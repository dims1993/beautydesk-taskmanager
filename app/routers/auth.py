import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from google.oauth2 import id_token
from google.auth.transport import requests
from google_auth_oauthlib.flow import Flow
from requests_oauthlib import OAuth2Session
from app.core.db.session import get_session
from app.models import User 
from app.schemas.token import Token 
from app.core.security import create_access_token 
from app.core.security import SECRET_KEY, ALGORITHM
from jose import jwt, JWTError
from app.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_OAUTH_REDIRECT_URI = os.getenv(
    "GOOGLE_OAUTH_REDIRECT_URI",
    "http://localhost:8000/auth/google/calendar/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Include OIDC scopes because Google may return them in the callback `scope`
# (and requests-oauthlib validates that the granted scope matches the requested scope).
GOOGLE_CALENDAR_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
]
ALLOWED_EMAILS = os.getenv("ALLOWED_EMAILS").split(',')

def _google_oauth_client_config_web():
    return {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }


def _build_calendar_flow(state: str | None = None) -> Flow:
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
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
    )
    return Flow(
        oauth2session=oauth2session,
        client_type="web",
        # Flow expects the Google client-secrets format: {"web": {...}} for web clients
        client_config={"web": client_web},
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
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
            print(f"🚫 Intento de acceso denegado para: {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado. Este correo no está registrado como profesional en BeautyTask."
            )

        # 4. CONTROL DE ACCESO: Verificar si el email está en la lista blanca
        if email not in ALLOWED_EMAILS:
            print(f"🚫 Intento de acceso denegado para: {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado. Este correo no está en la lista blanca."
            )

        # 5. Guardar tokens de Google (si vienen en la petición)
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
            "role": user.role,
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


@router.get("/google/calendar/connect")
def google_calendar_connect(current_user: User = Depends(get_current_user)):
    """
    Starts OAuth2 Authorization Code flow to connect a user's Google Calendar.
    Returns the Google consent URL to redirect the user to.
    """
    # Helpful diagnostics for Docker logs
    print(
        "DEBUG: google_calendar_connect config:",
        {
            "has_GOOGLE_CLIENT_ID": bool(GOOGLE_CLIENT_ID),
            "has_GOOGLE_CLIENT_SECRET": bool(GOOGLE_CLIENT_SECRET),
            "GOOGLE_OAUTH_REDIRECT_URI": GOOGLE_OAUTH_REDIRECT_URI,
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

    flow = _build_calendar_flow(state=state)

    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    return {"authorization_url": authorization_url}


@router.get("/google/calendar/status")
def google_calendar_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    user = db.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "connected": bool(user.google_refresh_token or user.google_access_token),
        "has_refresh_token": bool(user.google_refresh_token),
    }


@router.post("/google/calendar/disconnect")
def google_calendar_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    user = db.exec(select(User).where(User.id == current_user.id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.google_access_token = None
    user.google_refresh_token = None
    db.add(user)
    db.commit()
    return {"disconnected": True}


@router.get("/google/calendar/callback")
def google_calendar_callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_session)):
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

    flow = _build_calendar_flow(state=state)

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
