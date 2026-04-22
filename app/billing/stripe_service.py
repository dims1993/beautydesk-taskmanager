"""
Stripe: mapeo price_id ↔ plan, sesiones de Checkout / Portal y sincronización vía webhooks.
Requiere STRIPE_SECRET_KEY y precios por plan (STRIPE_PRICE_ESENCIAL, etc.).
"""
from __future__ import annotations

import os
from typing import Any, Optional

import stripe
from sqlmodel import Session, select

from app.billing.subscription import PaymentMethod, SubscriptionPlan
from app.models.organization import Organization


def configure_stripe() -> None:
    key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if key:
        stripe.api_key = key


def stripe_secret_configured() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY", "").strip())


def webhook_secret_configured() -> bool:
    return bool(os.getenv("STRIPE_WEBHOOK_SECRET", "").strip())


def price_id_for_plan(plan: SubscriptionPlan) -> Optional[str]:
    pid = os.getenv(f"STRIPE_PRICE_{plan.name}", "").strip()
    return pid or None


def plan_from_stripe_price_id(price_id: str) -> SubscriptionPlan:
    for p in SubscriptionPlan:
        if price_id_for_plan(p) == price_id:
            return p
    return SubscriptionPlan.ESENCIAL


def plans_price_availability() -> dict[str, bool]:
    return {p.value: bool(price_id_for_plan(p)) for p in SubscriptionPlan}


def _frontend_base() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def create_checkout_session(
    *,
    organization_id: int,
    owner_email: str,
    plan: SubscriptionPlan,
) -> str:
    """Devuelve la URL de Stripe Checkout (suscripción)."""
    configure_stripe()
    price_id = price_id_for_plan(plan)
    if not price_id:
        raise ValueError(
            f"No hay STRIPE_PRICE_{plan.name} en el entorno del servidor.",
        )

    success_url = f"{_frontend_base()}/app?tab=ajustes&billing=success"
    cancel_url = f"{_frontend_base()}/app?tab=ajustes&billing=cancel"

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url + "&session_id={CHECKOUT_SESSION_ID}",
        cancel_url=cancel_url,
        customer_email=owner_email,
        client_reference_id=str(organization_id),
        metadata={
            "organization_id": str(organization_id),
            "plan": plan.value,
        },
        subscription_data={
            "metadata": {
                "organization_id": str(organization_id),
                "plan": plan.value,
            },
        },
        allow_promotion_codes=True,
    )
    url = session.url
    if not url:
        raise RuntimeError("Stripe no devolvió URL de checkout")
    return url


def create_billing_portal_session(*, stripe_customer_id: str) -> str:
    configure_stripe()
    return_url = f"{_frontend_base()}/app?tab=ajustes"
    session = stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=return_url,
    )
    url = session.url
    if not url:
        raise RuntimeError("Stripe no devolvió URL del portal")
    return url


def modify_subscription_to_plan(
    *,
    stripe_subscription_id: str,
    new_plan: SubscriptionPlan,
) -> None:
    configure_stripe()
    price_id = price_id_for_plan(new_plan)
    if not price_id:
        raise ValueError(
            f"No hay STRIPE_PRICE_{new_plan.name} en el entorno del servidor.",
        )
    sub = stripe.Subscription.retrieve(stripe_subscription_id)
    items = sub.get("items", {}).get("data", [])
    if not items:
        raise ValueError("La suscripción de Stripe no tiene líneas de items")
    item_id = items[0]["id"]
    stripe.Subscription.modify(
        stripe_subscription_id,
        items=[{"id": item_id, "price": price_id}],
        proration_behavior="create_prorations",
        metadata={
            "plan": new_plan.value,
        },
    )


def _subscription_price_id(sub: Any) -> Optional[str]:
    try:
        items = sub.get("items", {}) if isinstance(sub, dict) else getattr(sub, "items", None)
        if items is None:
            return None
        data = items.get("data", []) if isinstance(items, dict) else getattr(items, "data", [])
        if not data:
            return None
        first = data[0]
        price = first.get("price") if isinstance(first, dict) else getattr(first, "price", None)
        if price is None:
            return None
        if isinstance(price, dict):
            return price.get("id")
        return getattr(price, "id", None)
    except Exception:
        return None


def sync_org_from_stripe_subscription(
    db: Session,
    org: Organization,
    sub: Any,
) -> None:
    """Actualiza organización desde objeto Subscription de Stripe."""
    status = sub.get("status") if isinstance(sub, dict) else getattr(sub, "status", None)
    price_id = _subscription_price_id(sub)
    if price_id:
        org.subscription_plan = plan_from_stripe_price_id(price_id)
    org.payment_method = PaymentMethod.CARD
    org.subscription_active = status in ("active", "trialing")
    cid = sub.get("customer") if isinstance(sub, dict) else getattr(sub, "customer", None)
    if isinstance(cid, str):
        org.stripe_customer_id = cid
    elif cid is not None and hasattr(cid, "id"):
        org.stripe_customer_id = str(cid.id)
    sid = sub.get("id") if isinstance(sub, dict) else getattr(sub, "id", None)
    if sid:
        org.stripe_subscription_id = sid
    db.add(org)
    db.commit()
    db.refresh(org)


def handle_checkout_session_completed(db: Session, session_obj: dict) -> None:
    if session_obj.get("mode") != "subscription":
        return
    org_id_raw = (session_obj.get("metadata") or {}).get("organization_id")
    if not org_id_raw:
        org_id_raw = session_obj.get("client_reference_id")
    if not org_id_raw:
        return
    try:
        org_id = int(org_id_raw)
    except (TypeError, ValueError):
        return
    org = db.get(Organization, org_id)
    if not org:
        return

    sub_id = session_obj.get("subscription")
    if not sub_id:
        return
    configure_stripe()
    sub = stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
    sub_payload = sub.to_dict() if hasattr(sub, "to_dict") else sub
    sync_org_from_stripe_subscription(db, org, sub_payload)


def handle_subscription_updated(db: Session, sub_obj: dict) -> None:
    sub_id = sub_obj.get("id")
    if not sub_id:
        return
    statement = select(Organization).where(
        Organization.stripe_subscription_id == sub_id
    )
    org = db.exec(statement).first()
    if not org:
        return
    sync_org_from_stripe_subscription(db, org, sub_obj)


def handle_subscription_deleted(db: Session, sub_obj: dict) -> None:
    sub_id = sub_obj.get("id")
    if not sub_id:
        return
    statement = select(Organization).where(
        Organization.stripe_subscription_id == sub_id
    )
    org = db.exec(statement).first()
    if not org:
        return
    org.stripe_subscription_id = None
    org.subscription_plan = SubscriptionPlan.ESENCIAL
    org.subscription_active = True
    db.add(org)
    db.commit()
