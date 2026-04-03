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
from app.schemas.user import UserOut, RegisterAccountRequest, RegisterBillingRequest
from app.schemas.token import Token
from app.dependencies import get_current_user
from app.core.security import get_password_hash

from app.services.registration import (
    complete_owner_billing,
    parse_business_type,
    parse_user_role,
    register_account_only,
)

router = APIRouter(prefix="/users", tags=["users"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


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


@router.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

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
