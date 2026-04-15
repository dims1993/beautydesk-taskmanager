import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session, select

from app.constants.onboarding import ALLOWED_SALON_CATEGORIES
from app.core.security import get_password_hash
from app.models.organization import BusinessType, Organization
from app.models.pending_registration import PendingRegistration
from app.models.user import User, UserRole

CODE_TTL_MINUTES = 30


def _hash_verification_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def _unique_username(
    db: Session,
    email: str,
    first_name: str,
    last_name: str,
) -> str:
    local = (email.split("@")[0] if "@" in email else email).strip().lower()
    base = "".join(c for c in local if c.isalnum() or c in "._-") or "usuario"
    candidate = base[:48]
    n = 0
    while True:
        uname = candidate if n == 0 else f"{candidate[:40]}_{n}"
        exists = db.exec(select(User).where(User.username == uname)).first()
        if not exists:
            return uname
        n += 1
        if n > 9999:
            candidate = f"u{secrets.token_hex(4)}"
            n = 0


def _build_payload_dict(
    *,
    business_name: str,
    address: str,
    city: str,
    postal_code: str,
    country: str,
    primary_category: str,
    categories: list[str],
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    password_hash: str,
) -> dict[str, Any]:
    return {
        "business_name": business_name.strip(),
        "address": address.strip(),
        "city": city.strip(),
        "postal_code": postal_code.strip(),
        "country": country.strip(),
        "primary_category": primary_category,
        "categories": categories,
        "first_name": first_name.strip(),
        "last_name": last_name.strip(),
        "email": email.strip().lower(),
        "phone": phone.strip(),
        "password_hash": password_hash,
    }


def validate_wizard_categories(primary: str, categories: list[str]) -> list[str]:
    p = (primary or "").strip().upper()
    if p not in ALLOWED_SALON_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail="Servicio principal no válido.",
        )
    seen: list[str] = []
    for raw in categories or []:
        key = (raw or "").strip().upper()
        if key not in ALLOWED_SALON_CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=f"Categoría no válida: {raw}",
            )
        if key not in seen:
            seen.append(key)
    if p not in seen:
        seen.insert(0, p)
    return seen


def start_owner_wizard_registration(
    db: Session,
    *,
    business_name: str,
    address: str,
    city: str,
    postal_code: str,
    country: str,
    primary_category: str,
    categories: list[str],
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    password_plain: str,
    accept_terms_and_privacy: bool,
) -> tuple[str, str]:
    """
    Creates a pending row and returns (registration_token, plain_6_digit_code).
    """
    if not accept_terms_and_privacy:
        raise HTTPException(
            status_code=400,
            detail="Debes aceptar los términos y la política de privacidad.",
        )

    em = email.strip().lower()
    existing_user = db.exec(select(User).where(User.email == em)).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Este correo ya está registrado. Inicia sesión.",
        )

    cats = validate_wizard_categories(primary_category, categories)
    pwd_hash = get_password_hash(password_plain)

    payload = _build_payload_dict(
        business_name=business_name,
        address=address,
        city=city,
        postal_code=postal_code,
        country=country,
        primary_category=cats[0],
        categories=cats,
        first_name=first_name,
        last_name=last_name,
        email=em,
        phone=phone,
        password_hash=pwd_hash,
    )

    stale = db.exec(
        select(PendingRegistration).where(PendingRegistration.email == em)
    ).all()
    for row in stale:
        db.delete(row)
    db.commit()

    code = f"{secrets.randbelow(1000000):06d}"
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    pending = PendingRegistration(
        registration_token=token,
        email=em,
        code_hash=_hash_verification_code(code),
        expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
        created_at=now,
        payload_json=json.dumps(payload, ensure_ascii=False),
    )
    db.add(pending)
    db.commit()

    return token, code


def confirm_owner_wizard_registration(
    db: Session,
    *,
    registration_token: str,
    code: str,
) -> None:
    token = (registration_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token de registro requerido.")

    raw_code = (code or "").strip().replace(" ", "")
    if len(raw_code) != 6 or not raw_code.isdigit():
        raise HTTPException(
            status_code=400,
            detail="Introduce el código de 6 dígitos.",
        )

    row = db.exec(
        select(PendingRegistration).where(
            PendingRegistration.registration_token == token
        )
    ).first()
    if not row:
        raise HTTPException(
            status_code=400,
            detail="Registro no encontrado o ya confirmado.",
        )

    now = datetime.now(timezone.utc)
    if row.expires_at.tzinfo is None:
        expires = row.expires_at.replace(tzinfo=timezone.utc)
    else:
        expires = row.expires_at
    if now > expires:
        db.delete(row)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="El código ha caducado. Vuelve a registrarte.",
        )

    if not secrets.compare_digest(
        row.code_hash, _hash_verification_code(raw_code)
    ):
        raise HTTPException(status_code=400, detail="Código incorrecto.")

    try:
        payload = json.loads(row.payload_json)
    except json.JSONDecodeError:
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=500, detail="Datos de registro corruptos.")

    em = payload["email"].lower()
    if db.exec(select(User).where(User.email == em)).first():
        db.delete(row)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Este correo ya está registrado. Inicia sesión.",
        )

    org = Organization(
        name=payload["business_name"],
        subscription_active=True,
        owner_id=None,
        business_type=BusinessType.SALON,
        legal_name=payload["business_name"],
        billing_address_line1=payload["address"],
        billing_address_line2=None,
        city=payload["city"],
        postal_code=payload["postal_code"],
        province=None,
        country=payload["country"],
        tax_id=None,
        billing_phone=payload.get("phone"),
        billing_email=em,
        salon_category_primary=payload.get("primary_category"),
        salon_categories_json=json.dumps(payload.get("categories") or [], ensure_ascii=False),
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    username = _unique_username(
        db,
        em,
        payload.get("first_name") or "",
        payload.get("last_name") or "",
    )
    user = User(
        username=username,
        email=em,
        password_hash=payload["password_hash"],
        role=UserRole.OWNER,
        organization_id=org.id,
        integrations_access=False,
        phone=payload.get("phone"),
        terms_accepted_at=datetime.now(timezone.utc),
        first_name=(payload.get("first_name") or "").strip() or None,
        last_name=(payload.get("last_name") or "").strip() or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    org.owner_id = user.id
    db.add(org)
    db.delete(row)
    db.commit()
