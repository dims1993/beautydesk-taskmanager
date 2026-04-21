import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlmodel import Session, select
from typing import List
from sqlalchemy import or_

from app.core.db.session import get_session
from app.models.user import User, UserRole
from app.models.organization import Organization
from app.core.notifications import send_registration_verification_email
from app.schemas.user import (
    RegisterAccountRequest,
    RegisterBillingRequest,
    RegisterOwnerWizardConfirmRequest,
    RegisterOwnerWizardRequest,
    SetCashClosePasswordBody,
    UserMeOut,
    UserOut,
    VerifyCashCloseBody,
)
from app.schemas.token import Token
from app.dependencies import get_current_user
from app.core.security import get_password_hash, verify_password
from app.billing.subscription import (
    count_staff_in_organization,
    entitlements_for_organization,
    entitlements_to_dict,
    integrations_access_effective,
    org_subscription_and_payment_str,
)

from app.services.registration import (
    complete_owner_billing,
    parse_business_type,
    parse_user_role,
    register_account_only,
)
from app.services.wizard_registration import (
    confirm_owner_wizard_registration,
    start_owner_wizard_registration,
)

router = APIRouter(prefix="/users", tags=["users"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


@router.post("/register/owner-wizard")
async def register_owner_wizard(
    body: RegisterOwnerWizardRequest,
    db: Session = Depends(get_session),
):
    """
    OWNER freemium: guarda datos en pendiente y envía código por correo.
    Tras confirmar con /register/owner-wizard/confirm, la cuenta queda creada.
    """
    token, code = start_owner_wizard_registration(
        db,
        business_name=body.business_name,
        address=body.address,
        city=body.city,
        postal_code=body.postal_code,
        country=body.country,
        primary_category=body.primary_category,
        categories=body.categories,
        first_name=body.first_name,
        last_name=body.last_name,
        email=str(body.email),
        phone=body.phone,
        password_plain=body.password,
        accept_terms_and_privacy=body.accept_terms_and_privacy,
    )
    await send_registration_verification_email(
        to_email=str(body.email),
        first_name=body.first_name,
        business_name=body.business_name,
        code=code,
    )
    return {
        "registration_token": token,
        "message": "Te hemos enviado un código de verificación por correo.",
    }


@router.post("/register/owner-wizard/confirm")
def register_owner_wizard_confirm(
    body: RegisterOwnerWizardConfirmRequest,
    db: Session = Depends(get_session),
):
    confirm_owner_wizard_registration(
        db,
        registration_token=body.registration_token,
        code=body.code,
    )
    return {
        "success": True,
        "message": "Cuenta activada. Ya puedes iniciar sesión.",
    }


@router.post("/register/account", response_model=Token)
def register_account(user_data: RegisterAccountRequest, db: Session = Depends(get_session)):
    google_cred = user_data.google_credential
    if google_cred:
        if not GOOGLE_CLIENT_ID:
            raise HTTPException(
                status_code=500,
                detail="Registro con Google no disponible (falta GOOGLE_CLIENT_ID en el servidor).",
            )
        try:
            idinfo = id_token.verify_oauth2_token(
                google_cred, google_requests.Request(), GOOGLE_CLIENT_ID
            )
            email_final = idinfo["email"].lower()
        except ValueError:
            raise HTTPException(status_code=400, detail="Token de Google inválido")
        password_plain = None
        google_random = True
        username_for_db = None
    else:
        email_final = user_data.email.lower()
        password_plain = user_data.password
        google_random = False
        username_for_db = user_data.username.strip()

    role = parse_user_role(user_data.role)

    return register_account_only(
        db,
        username=username_for_db,
        email=email_final,
        password_plain=password_plain,
        google_random_password=google_random,
        role=role,
        super_admin_secret=user_data.super_admin_registration_secret,
        phone=user_data.phone,
        terms_accepted=user_data.accept_terms_and_privacy,
    )


@router.post("/register/billing")
def register_billing(
    body: RegisterBillingRequest,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    bt = parse_business_type(body.business_type)
    return complete_owner_billing(
        db,
        current_user,
        business_type=bt,
        organization_name=body.organization_name,
        legal_name=body.legal_name,
        billing_address_line1=body.billing_address_line1,
        billing_address_line2=body.billing_address_line2,
        city=body.city,
        postal_code=body.postal_code,
        province=body.province,
        country=body.country,
        tax_id=body.tax_id,
        billing_phone=body.billing_phone,
        billing_email=body.billing_email,
    )


@router.get("/me", response_model=UserMeOut)
def read_users_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    org = None
    org_name = None
    org_city = None
    cash_close_configured = False
    subscription_plan = None
    payment_method = None
    plan_entitlements = None

    if current_user.organization_id:
        org = db.get(Organization, current_user.organization_id)
        if org:
            org_name = (org.name or "").strip() or None
            org_city = (org.city or "").strip() or None
            h = org.cash_close_password_hash
            cash_close_configured = bool(h and str(h).strip())
            subscription_plan, payment_method = org_subscription_and_payment_str(org)
            plan_entitlements = entitlements_to_dict(entitlements_for_organization(org))

    base = UserOut.model_validate(current_user).model_dump()
    base["integrations_access"] = integrations_access_effective(current_user, org)

    return UserMeOut(
        **base,
        organization_name=org_name,
        organization_city=org_city,
        cash_close_password_configured=cash_close_configured,
        subscription_plan=subscription_plan,
        payment_method=payment_method,
        plan_entitlements=plan_entitlements,
    )


@router.patch("/me/organization/cash-close-password")
def set_organization_cash_close_password(
    body: SetCashClosePasswordBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Solo OWNER: define la contraseña para cerrar caja / validar cierres."""
    if current_user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=403,
            detail="Solo el titular del negocio puede configurar la contraseña de cierre de caja.",
        )
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Completa los datos del negocio antes de configurar la caja.",
        )
    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    pwd = (body.password or "").strip()
    org.cash_close_password_hash = get_password_hash(pwd)
    db.add(org)
    db.commit()
    return {"success": True, "message": "Contraseña de cierre de caja guardada."}


@router.post("/me/organization/verify-cash-close")
def verify_organization_cash_close(
    body: VerifyCashCloseBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Valida la contraseña de cierre para el salón del usuario."""
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="No perteneces a una organización.",
        )
    org = db.get(Organization, current_user.organization_id)
    if not org or not org.cash_close_password_hash:
        raise HTTPException(
            status_code=400,
            detail="El titular aún no ha configurado la contraseña de cierre de caja.",
        )
    if not verify_password(body.password, org.cash_close_password_hash):
        raise HTTPException(status_code=401, detail="Contraseña incorrecta.")
    return {"valid": True}

@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return db.query(User).all()

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_session)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


@router.get("/team", response_model=list[User])
async def get_team(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if not current_user.organization_id:
        return []
    statement = select(User).where(
        User.organization_id == current_user.organization_id
    )
    return db.exec(statement).all()

@router.post("/team", response_model=User)
async def add_team_member(
    user_in: dict,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Completa los datos fiscales de tu negocio en Ajustes antes de invitar al equipo.",
        )
    statement = select(User).where(User.email == user_in["email"])
    if db.exec(statement).first():
        raise HTTPException(status_code=400, detail="Este correo ya está registrado")

    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    ent = entitlements_for_organization(org)
    if not ent.team_invites:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Tu plan Esencial no incluye equipo. "
                "Actualiza a Profesional o Premium para invitar profesionales."
            ),
        )
    if ent.max_staff_users is not None:
        staff_n = count_staff_in_organization(db, current_user.organization_id)
        if staff_n >= ent.max_staff_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Has alcanzado el máximo de profesionales para tu plan "
                    f"({ent.max_staff_users}). Mejora de plan para añadir más."
                ),
            )

    role_raw = (user_in.get("role") or "STAFF").strip().upper()
    try:
        member_role = UserRole(role_raw)
    except ValueError:
        member_role = UserRole.STAFF

    new_user = User(
        email=user_in["email"],
        username=user_in.get("username") or user_in["email"].split("@")[0],
        role=member_role,
        organization_id=current_user.organization_id,
        password_hash=get_password_hash(secrets.token_urlsafe(32)),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="No autorizado")

    statement = select(Organization).where(Organization.id == org_id)
    org = db.exec(statement).first()

    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

    db.delete(org)
    db.commit()
    return {"message": "Organización eliminada"}

@router.delete("/team/{user_id}")
async def delete_team_member(
    user_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    statement = select(User).where(User.id == user_id)
    user_to_delete = db.exec(statement).first()

    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if current_user.role != UserRole.SUPER_ADMIN:
        if user_to_delete.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar a este usuario")

        if user_to_delete.id == current_user.id:
            raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")

    db.delete(user_to_delete)
    db.commit()

    return {"detail": "Acceso revocado correctamente"}
