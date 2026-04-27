import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlmodel import Session, select
from google.oauth2 import id_token
from google.auth.transport import requests
from google_auth_oauthlib.flow import Flow
from requests_oauthlib import OAuth2Session
from app.core.db.session import get_session
from app.models import User
from app.models.user import UserRole
from app.models.organization import Organization
from app.billing.subscription import integrations_access_effective
from app.schemas.token import Token 
from app.core.security import create_access_token 
from app.core.security import SECRET_KEY, ALGORITHM
from jose import jwt, JWTError
from app.dependencies import get_current_user_for_app

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
# NOTE: Redirect URI must match the domain the user is on (Render in production).
# We build it from the incoming request to avoid accidental localhost callbacks on mobile.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Include OIDC scopes because Google may return them in the callback `scope`
# (and requests-oauthlib validates that the granted scope matches the requested scope).
GOOGLE_CALENDAR_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    # Full calendar access is overly broad. Prefer events scope for syncing appointments.
    "https://www.googleapis.com/auth/calendar.events",
]

def _public_redirect_uri_for_calendar_callback(request: Request, callback_path: str) -> str:
    """
    Build a public redirect_uri that matches what the browser used.
    Behind Render, request.url may be internal http; rely on X-Forwarded-*.
    """
    proto = (
        request.headers.get("x-forwarded-proto")
        or request.url.scheme
        or "https"
    ).split(",")[0].strip()
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.hostname
        or ""
    ).split(",")[0].strip()
    path = str(callback_path or "").strip() or "/auth/google/calendar/callback"
    if not path.startswith("/"):
        path = "/" + path
    return f"{proto}://{host}{path}"


def _google_oauth_client_config_web():
    return {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }


def _build_calendar_flow(*, redirect_uri: str, state: str | None = None) -> Flow:
    """
    Build a server-side OAuth flow for a confidential client.
    We explicitly disable PKCE here to avoid 'Missing code verifier' errors
    when the Flow instance is recreated between connect and callback.
    """
    client_web = _google_oauth_client_config_web()
    if not client_web["client_id"] or not client_web["client_secret"]:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth client is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
        )

    oauth2session = OAuth2Session(
        client_id=client_web["client_id"],
        scope=GOOGLE_CALENDAR_SCOPES,
        state=state,
        redirect_uri=redirect_uri,
    )
    return Flow(
        oauth2session=oauth2session,
        client_type="web",
        # Flow expects the Google client-secrets format: {"web": {...}} for web clients
        client_config={"web": client_web},
        redirect_uri=redirect_uri,
        code_verifier=None,
        autogenerate_code_verifier=False,
    )

@router.post("/google", response_model=Token)
async def auth_google(data: dict, db: Session = Depends(get_session)):
    token = data.get("token")
    
    if not token:
        raise HTTPException(status_code=400, detail="Token no proporcionado")
        
    try:
        # 1. Validar el token con los servidores de Google
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        
        # 2. Buscar si el usuario existe en nuestra base de datos
        # (Ya sea porque lo creaste como SuperAdmin o como Admin de salón)
        statement = select(User).where(User.email == email)
        user = db.exec(statement).first()
        
        # 3. CONTROL DE ACCESO: Si no está en la DB, no entra.
        if not user:
            print(f"🚫 Intento de acceso denegado (no en BD): {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado. Este correo no está registrado como profesional en BeautyTask."
            )

        # Si el usuario ya existe en la BD, siempre puede entrar con Google.
        # ALLOWED_EMAILS ya no se aplica aquí: bloqueaba a profesionales registrados
        # cuando en producción había una lista corta en env (p. ej. solo admins).

        # 4. Guardar tokens de Google (si vienen en la petición)
        google_access_token = data.get("access_token")
        google_refresh_token = data.get("refresh_token")

        if google_access_token:
            user.google_access_token = google_access_token
        if google_refresh_token:
            user.google_refresh_token = google_refresh_token
        
        # 6. Generar el JWT de nuestra propia App
        access_token = create_access_token(data={"sub": user.email})
        
        print(f"✅ Login exitoso: {user.email} (Rol: {user.role})")
        
        # 7. Guardar los cambios en la base de datos
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "organization_id": user.organization_id
        }

    except ValueError:
        raise HTTPException(status_code=400, detail="Token de Google inválido")
    except HTTPException as e:
        # Re-lanzamos el 403 para que el frontend lo reciba bien
        raise e
    except Exception as e:
        print(f"❌ Error inesperado en Auth: {str(e)}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


@router.post("/impersonate", response_model=Token)
def impersonate_user(
    body: dict,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    """
    SUPER_ADMIN only. Returns a JWT for the target user.
    Frontend should store the original token and provide a clear exit path.
    """
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="No autorizado")

    email_raw = (body.get("email") or "").strip().lower()
    if not email_raw:
        raise HTTPException(status_code=400, detail="Missing email")

    target = db.exec(select(User).where(User.email == email_raw)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    token = create_access_token(
        data={
            "sub": target.email,
            "impersonated": True,
            "actor_sub": current_user.email,
        }
    )
    org = db.get(Organization, target.organization_id) if target.organization_id else None
    integrations = integrations_access_effective(target, org)

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": target.role.value if hasattr(target.role, "value") else str(target.role),
        "organization_id": target.organization_id,
        "integrations_access": integrations,
    }


@router.get("/google/calendar/connect")
def google_calendar_connect(
    request: Request,
    current_user: User = Depends(get_current_user_for_app),
    db: Session = Depends(get_session),
):
    """
    Starts OAuth2 Authorization Code flow to connect a user's Google Calendar.
    Returns the Google consent URL to redirect the user to.
    """
    row = db.exec(select(User).where(User.id == current_user.id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    org = db.get(Organization, row.organization_id) if row.organization_id else None
    if not integrations_access_effective(row, org):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "La conexión con Google Calendar no está incluida en tu plan actual. "
                "Actualiza tu suscripción o contacta con soporte para desbloquear integraciones."
            ),
        )

    # Helpful diagnostics for Docker logs
    print(
        "DEBUG: google_calendar_connect config:",
        {
            "has_GOOGLE_CLIENT_ID": bool(GOOGLE_CLIENT_ID),
            "has_GOOGLE_CLIENT_SECRET": bool(GOOGLE_CLIENT_SECRET),
            "request_base_url": str(request.base_url),
            "FRONTEND_URL": FRONTEND_URL,
        },
    )

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail=(
                "Google OAuth client is not configured inside the backend container. "
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend environment (.env / Render)."
            ),
        )

    state_payload = {
        "sub": current_user.email,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()),
        "purpose": "google_calendar_connect",
    }
    state = jwt.encode(state_payload, SECRET_KEY, algorithm=ALGORITHM)

    # IMPORTANT: must match the exact public URL registered in Google OAuth client.
    callback_url = request.url_for("google_calendar_callback")
    redirect_uri = _public_redirect_uri_for_calendar_callback(request, callback_url.path)
    flow = _build_calendar_flow(redirect_uri=redirect_uri, state=state)

    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    return {"authorization_url": authorization_url}


@router.get("/google/calendar/status")
def google_calendar_status(
    current_user: User = Depends(get_current_user_for_app),
    db: Session = Depends(get_session),
):
    user = db.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    locked = not integrations_access_effective(user, org)
    if locked:
        return {
            "connected": False,
            "has_refresh_token": False,
            "integrations_locked": True,
        }
    return {
        "connected": bool(user.google_refresh_token or user.google_access_token),
        "has_refresh_token": bool(user.google_refresh_token),
        "integrations_locked": False,
    }


@router.post("/google/calendar/disconnect")
def google_calendar_disconnect(
    current_user: User = Depends(get_current_user_for_app),
    db: Session = Depends(get_session),
):
    user = db.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    if not integrations_access_effective(user, org):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Integraciones no disponibles en tu plan actual.",
        )
    user.google_access_token = None
    user.google_refresh_token = None
    db.add(user)
    db.commit()
    return {"disconnected": True}


@router.get("/google/calendar/callback")
def google_calendar_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_session),
):
    """
    OAuth2 callback endpoint. Exchanges code for tokens and stores them on the user.
    Redirects back to the frontend.
    """
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code/state")

    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "google_calendar_connect":
            raise HTTPException(status_code=400, detail="Invalid state purpose")
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=400, detail="Invalid state")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid state token")

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth client is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
        )

    user = db.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    if not integrations_access_effective(user, org):
        from fastapi.responses import RedirectResponse

        return RedirectResponse(
            f"{FRONTEND_URL}/app?google_calendar=locked"
        )

    callback_url = request.url_for("google_calendar_callback")
    redirect_uri = _public_redirect_uri_for_calendar_callback(request, callback_url.path)
    flow = _build_calendar_flow(redirect_uri=redirect_uri, state=state)

    try:
        flow.fetch_token(code=code)
    except Exception as e:
        print(f"❌ Google OAuth token exchange failed: {e}")
        raise HTTPException(status_code=400, detail="Google OAuth token exchange failed")
    creds = flow.credentials

    # Store tokens (refresh_token may be None if Google didn't re-issue it)
    if creds.token:
        user.google_access_token = creds.token
    if getattr(creds, "refresh_token", None):
        user.google_refresh_token = creds.refresh_token

    db.add(user)
    db.commit()
    db.refresh(user)

    # Redirect to frontend (simple success flag)
    from fastapi.responses import RedirectResponse

    return RedirectResponse(f"{FRONTEND_URL}/app?google_calendar=connected")
