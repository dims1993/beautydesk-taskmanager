"""
Planes de suscripción alineados con la landing (Esencial / Profesional / Premium),
método de pago previsto para facturación y permisos (entitlements) por plan.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional

from sqlmodel import Session, select

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User


class SubscriptionPlan(str, Enum):
    ESENCIAL = "esencial"
    PROFESIONAL = "profesional"
    PREMIUM = "premium"


class PaymentMethod(str, Enum):
    """Forma de cobro acordada; `unspecified` hasta activar pasarela (Stripe, etc.)."""

    UNSPECIFIED = "unspecified"
    CARD = "card"
    SEPA_DEBIT = "sepa_debit"
    BANK_TRANSFER = "bank_transfer"
    MANUAL_INVOICE = "manual_invoice"


@dataclass(frozen=True)
class PlanEntitlements:
    """Capacidades que la app concede según la suscripción de la organización."""

    google_calendar: bool
    # None = sin límite práctico (Premium)
    max_staff_users: Optional[int]
    stats_level: str  # basic | standard | advanced
    export_monthly: bool
    advanced_analytics: bool
    team_invites: bool
    priority_support: bool


def _plan_matrix(plan: SubscriptionPlan) -> PlanEntitlements:
    """Matriz alineada con PRICING en la landing."""
    if plan == SubscriptionPlan.ESENCIAL:
        return PlanEntitlements(
            google_calendar=False,
            max_staff_users=0,
            stats_level="basic",
            export_monthly=False,
            advanced_analytics=False,
            team_invites=False,
            priority_support=False,
        )
    if plan == SubscriptionPlan.PROFESIONAL:
        return PlanEntitlements(
            google_calendar=True,
            max_staff_users=2,
            stats_level="standard",
            export_monthly=True,
            advanced_analytics=False,
            team_invites=True,
            priority_support=False,
        )
    # PREMIUM
    return PlanEntitlements(
        google_calendar=True,
        max_staff_users=None,
        stats_level="advanced",
        export_monthly=True,
        advanced_analytics=True,
        team_invites=True,
        priority_support=True,
    )


def parse_subscription_plan(raw: Optional[str]) -> SubscriptionPlan:
    if not raw:
        return SubscriptionPlan.ESENCIAL
    key = str(raw).strip().lower()
    try:
        return SubscriptionPlan(key)
    except ValueError:
        return SubscriptionPlan.ESENCIAL


def parse_payment_method(raw: Optional[str]) -> PaymentMethod:
    if not raw:
        return PaymentMethod.UNSPECIFIED
    key = str(raw).strip().lower()
    try:
        return PaymentMethod(key)
    except ValueError:
        return PaymentMethod.UNSPECIFIED


def entitlements_for_organization(org: Optional["Organization"]) -> PlanEntitlements:
    if org is None:
        return _plan_matrix(SubscriptionPlan.ESENCIAL)
    raw = getattr(org, "subscription_plan", None)
    if isinstance(raw, SubscriptionPlan):
        return _plan_matrix(raw)
    if raw is None:
        return _plan_matrix(SubscriptionPlan.ESENCIAL)
    return _plan_matrix(parse_subscription_plan(str(raw)))


def integrations_access_effective(
    user: "User",
    org: Optional["Organization"],
) -> bool:
    """Google Calendar / integraciones: según plan de organización (y SUPER_ADMIN)."""
    from app.models.user import UserRole

    if user.role == UserRole.SUPER_ADMIN:
        return True
    if org is not None:
        return entitlements_for_organization(org).google_calendar
    return bool(getattr(user, "integrations_access", False))


def calendar_sync_allowed(db: Session, user: "User") -> bool:
    from app.models.organization import Organization
    from app.models.user import UserRole

    if user.role == UserRole.SUPER_ADMIN:
        return True
    if not user.organization_id:
        return bool(getattr(user, "integrations_access", False))
    org = db.get(Organization, user.organization_id)
    return integrations_access_effective(user, org)


def count_staff_in_organization(db: Session, organization_id: int) -> int:
    from app.models.user import User, UserRole

    stmt = select(User).where(
        User.organization_id == organization_id,
        User.role == UserRole.STAFF,
    )
    return len(db.exec(stmt).all())


def entitlements_to_dict(ent: PlanEntitlements) -> dict:
    return {
        "google_calendar": ent.google_calendar,
        "max_staff_users": ent.max_staff_users,
        "stats_level": ent.stats_level,
        "export_monthly": ent.export_monthly,
        "advanced_analytics": ent.advanced_analytics,
        "team_invites": ent.team_invites,
        "priority_support": ent.priority_support,
    }


def org_subscription_and_payment_str(org: Any) -> tuple[str, str]:
    """Valores serializables para API (strings)."""
    sp = getattr(org, "subscription_plan", None)
    if isinstance(sp, SubscriptionPlan):
        plan_s = sp.value
    else:
        plan_s = parse_subscription_plan(str(sp) if sp else None).value
    pm = getattr(org, "payment_method", None)
    if isinstance(pm, PaymentMethod):
        pm_s = pm.value
    else:
        pm_s = parse_payment_method(str(pm) if pm else None).value
    return plan_s, pm_s
