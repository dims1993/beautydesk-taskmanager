import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.security import create_access_token, get_password_hash
from app.models.organization import BusinessType, Organization
from app.models.user import User, UserRole

SUPER_ADMIN_REGISTRATION_SECRET = os.getenv("SUPER_ADMIN_REGISTRATION_SECRET", "")

ALLOWED_SELF_REGISTER_ROLES = frozenset(
    {UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.CLIENT}
)


def _secret_matches(provided: Optional[str], expected: str) -> bool:
    if not expected:
        return False
    p = hashlib.sha256((provided or "").encode("utf-8")).digest()
    e = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(p, e)


def parse_user_role(role_str: str) -> UserRole:
    raw = (role_str or "").strip().upper()
    try:
        r = UserRole(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Rol inválido")
    if r not in ALLOWED_SELF_REGISTER_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Este rol no está disponible en el registro público.",
        )
    return r


def parse_business_type(value: Optional[str]) -> BusinessType:
    if not value:
        raise HTTPException(status_code=400, detail="Tipo de negocio requerido")
    key = value.strip().upper()
    try:
        return BusinessType[key]
    except KeyError:
        return BusinessType.OTHER


def register_account_only(
    db: Session,
    *,
    username: Optional[str],
    email: str,
    password_plain: Optional[str],
    google_random_password: bool,
    role: UserRole,
    super_admin_secret: Optional[str],
    phone: str,
    terms_accepted: bool,
) -> dict:
    """
    Crea usuario sin organización (OWNER queda pendiente de paso fiscal).
    Con Google: username = email (normalizado).
    """
    if not terms_accepted:
        raise HTTPException(
            status_code=400,
            detail="Debes aceptar los términos y la política de privacidad.",
        )
    phone_clean = (phone or "").strip()
    if not phone_clean:
        raise HTTPException(status_code=400, detail="El teléfono es obligatorio")

    em = email.strip().lower()
    if google_random_password:
        uname = em
    else:
        if not username or not username.strip():
            raise HTTPException(status_code=400, detail="Nombre de usuario requerido")
        if not password_plain:
            raise HTTPException(status_code=400, detail="Contraseña requerida")
        uname = username.strip().lower()

    existing = db.exec(
        select(User).where((User.email == em) | (User.username == uname))
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Este correo o usuario ya está registrado. Inicia sesión. "
                "Si registraste una cuenta de titular pero no terminaste los datos fiscales, "
                "entra con tu correo y contraseña (o Google) y completa el negocio en Ajustes."
            ),
        )

    if role == UserRole.SUPER_ADMIN:
        if not _secret_matches(
            super_admin_secret, SUPER_ADMIN_REGISTRATION_SECRET
        ):
            raise HTTPException(
                status_code=403,
                detail="Clave de registro de super administrador incorrecta o no configurada en el servidor.",
            )
        password_src = (
            secrets.token_urlsafe(48) if google_random_password else password_plain
        )
        if not password_src:
            raise HTTPException(status_code=400, detail="Contraseña requerida")
        pwd_hash = get_password_hash(password_src)
        user = User(
            username=uname,
            email=em,
            password_hash=pwd_hash,
            role=UserRole.SUPER_ADMIN,
            organization_id=None,
            integrations_access=True,
            phone=phone_clean,
            terms_accepted_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif role == UserRole.OWNER:
        password_src = (
            secrets.token_urlsafe(48) if google_random_password else password_plain
        )
        if not password_src:
            raise HTTPException(status_code=400, detail="Contraseña requerida")
        pwd_hash = get_password_hash(password_src)
        user = User(
            username=uname,
            email=em,
            password_hash=pwd_hash,
            role=UserRole.OWNER,
            organization_id=None,
            integrations_access=False,
            phone=phone_clean,
            terms_accepted_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        password_src = (
            secrets.token_urlsafe(48) if google_random_password else password_plain
        )
        if not password_src:
            raise HTTPException(status_code=400, detail="Contraseña requerida")
        pwd_hash = get_password_hash(password_src)
        user = User(
            username=uname,
            email=em,
            password_hash=pwd_hash,
            role=UserRole.CLIENT,
            organization_id=None,
            integrations_access=False,
            phone=phone_clean,
            terms_accepted_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(data={"sub": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "organization_id": user.organization_id,
        "integrations_access": user.integrations_access,
        "requires_billing_step": role == UserRole.OWNER,
    }


def complete_owner_billing(
    db: Session,
    user: User,
    *,
    business_type: BusinessType,
    organization_name: str,
    legal_name: str,
    billing_address_line1: str,
    billing_address_line2: Optional[str],
    city: str,
    postal_code: str,
    province: Optional[str],
    country: str,
    tax_id: Optional[str],
    billing_phone: Optional[str],
    billing_email: Optional[str],
) -> dict:
    if user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=400,
            detail="Solo las cuentas de titular completan datos fiscales aquí.",
        )
    if user.organization_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Los datos fiscales ya fueron registrados para esta cuenta.",
        )

    em = user.email.lower()
    org = Organization(
        name=organization_name.strip(),
        subscription_active=True,
        owner_id=None,
        business_type=business_type,
        legal_name=legal_name.strip(),
        billing_address_line1=billing_address_line1.strip(),
        billing_address_line2=(billing_address_line2 or "").strip() or None,
        city=city.strip(),
        postal_code=postal_code.strip(),
        province=(province or "").strip() or None,
        country=country.strip(),
        tax_id=(tax_id or "").strip() or None,
        billing_phone=(billing_phone or "").strip() or None,
        billing_email=(billing_email or em).strip().lower(),
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    user.organization_id = org.id
    db.add(user)
    db.commit()
    db.refresh(user)

    org.owner_id = user.id
    db.add(org)
    db.commit()
    db.refresh(org)

    return {
        "organization_id": org.id,
        "message": "Datos fiscales guardados correctamente",
    }
