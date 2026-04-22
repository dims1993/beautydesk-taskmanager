"""
Bloqueo de la app hasta que la organización tenga suscripción en Stripe
(checkout completado; stripe_subscription_id asignado vía webhook).
"""
from __future__ import annotations

import os

from sqlmodel import Session

from app.billing.stripe_service import stripe_secret_configured
from app.models.organization import Organization
from app.models.user import User, UserRole


def org_stripe_enforcement_enabled() -> bool:
    return os.getenv("ENFORCE_ORG_STRIPE_SUBSCRIPTION", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def organization_blocks_app_access(db: Session, user: User) -> bool:
    """
    True si el usuario no debe poder usar la API de negocio (citas, clientes, …)
    hasta completar el checkout con tarjeta en Stripe.
    """
    if not org_stripe_enforcement_enabled():
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return False
    if not user.organization_id:
        return False
    if not stripe_secret_configured():
        return False
    org = db.get(Organization, user.organization_id)
    if not org:
        return False
    sid = getattr(org, "stripe_subscription_id", None) or None
    if sid and str(sid).strip():
        return False
    return True
