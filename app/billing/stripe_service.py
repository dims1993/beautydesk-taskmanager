"""
Stripe: mapeo price_id ↔ plan, sesiones de Checkout / Portal y sincronización vía webhooks.
Requiere STRIPE_SECRET_KEY y precios por plan (STRIPE_PRICE_ESENCIAL, etc.).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import stripe
from sqlmodel import Session, select

from app.billing.subscription import PaymentMethod, SubscriptionPlan
from app.models.appointment import Appointment
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
    """
    Base URL del front (sin / final). Debe ser el sitio público (p. ej.
    https://app.vercel.app), no el panel de Vercel (vercel.com/.../project).
    """
    base = (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
    try:
        host = (urlparse(base).netloc or "").lower()
    except Exception:  # noqa: BLE001
        return base
    # 404 al volver de Stripe: muchas veces FRONTEND_URL = URL copiada del dashboard
    if host in ("vercel.com", "www.vercel.com"):
        raise ValueError(
            "FRONTEND_URL apunta a vercel.com (panel). Configura en Render la URL "
            "pública de la app, por ejemplo https://tu-proyecto.vercel.app "
            "(Vercel → tu proyecto → Domains, o prueba con la URL de preview https://...vercel.app)."
        )
    return base


def trial_period_days() -> int:
    """Días de prueba para la primera suscripción (0 = sin periodo de prueba)."""
    try:
        return max(0, int((os.getenv("STRIPE_TRIAL_DAYS") or "10").strip() or 10))
    except (TypeError, ValueError):
        return 10


def _stripe_ts_to_utc(v: Any) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is not None:
            return v
        return v.replace(tzinfo=timezone.utc)
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(int(v), tz=timezone.utc)
    return None


def create_checkout_session(
    *,
    organization_id: int,
    owner_email: str,
    plan: SubscriptionPlan,
    include_trial: bool = False,
) -> str:
    """
    URL de Stripe Checkout (suscripción). Si include_trial y STRIPE_TRIAL_DAYS>0,
    se programa periodo de prueba: se guarda la tarjeta, cargo 0 en el inicio
    (factura 0) y el cobro mensual al terminar la prueba salvo cancelación.
    """
    configure_stripe()
    price_id = price_id_for_plan(plan)
    if not price_id:
        raise ValueError(
            f"No hay STRIPE_PRICE_{plan.name} en el entorno del servidor.",
        )

    success_url = f"{_frontend_base()}/app?tab=ajustes&billing=success"
    cancel_url = f"{_frontend_base()}/app?tab=ajustes&billing=cancel"

    subscription_data: dict[str, Any] = {
        "metadata": {
            "organization_id": str(organization_id),
            "plan": plan.value,
        },
    }
    tdays = trial_period_days() if include_trial else 0
    if tdays > 0:
        subscription_data["trial_period_days"] = tdays

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
        subscription_data=subscription_data,
        allow_promotion_codes=True,
        payment_method_collection="always",
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
    d = sub if isinstance(sub, dict) else (sub.to_dict() if hasattr(sub, "to_dict") else sub)
    if not isinstance(d, dict):
        d = {}

    status = d.get("status")
    if status is not None and isinstance(status, str):
        org.stripe_sub_status = status
    price_id = _subscription_price_id(d)
    if price_id:
        org.subscription_plan = plan_from_stripe_price_id(price_id)
    org.payment_method = PaymentMethod.CARD
    org.subscription_active = status in ("active", "trialing")
    org.stripe_trial_ends_at = _stripe_ts_to_utc(d.get("trial_end"))
    org.stripe_current_period_ends_at = _stripe_ts_to_utc(d.get("current_period_end"))
    cid = d.get("customer")
    if isinstance(cid, str):
        org.stripe_customer_id = cid
    elif cid is not None and hasattr(cid, "id"):
        org.stripe_customer_id = str(cid.id)
    sid = d.get("id")
    if sid:
        org.stripe_subscription_id = sid
    db.add(org)
    db.commit()
    db.refresh(org)


def _subscription_id_from_checkout_session(session_obj: dict) -> Optional[str]:
    """`subscription` en Session puede ser id (str) o objeto expandido (dict)."""
    raw = session_obj.get("subscription")
    if raw is None:
        return None
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    if isinstance(raw, dict):
        rid = raw.get("id")
        if isinstance(rid, str) and rid.strip():
            return rid.strip()
    return None


def _checkout_session_belongs_to_org(session_obj: dict, organization_id: int) -> bool:
    exp = str(organization_id)
    cr = (session_obj.get("client_reference_id") or "").strip()
    meta = session_obj.get("metadata") or {}
    mo = meta.get("organization_id")
    mo_s = str(mo).strip() if mo is not None and str(mo).strip() else ""
    return cr == exp or mo_s == exp


def sync_organization_from_checkout_session_id(
    db: Session,
    *,
    organization_id: int,
    session_id: str,
) -> tuple[bool, Optional[str]]:
    """
    Aplica el mismo resultado que el webhook `checkout.session.completed` leyendo
    la Session en la API. Útil si el webhook aún no llegó (p. ej. local sin
    `stripe listen` o retraso).
    """
    org = db.get(Organization, organization_id)
    if not org:
        return False, "Organización no encontrada"
    if org.stripe_subscription_id and str(org.stripe_subscription_id).strip():
        return True, None

    configure_stripe()
    try:
        sess = stripe.checkout.Session.retrieve(
            session_id, expand=["subscription"]
        )
    except stripe.error.StripeError as e:
        return False, (getattr(e, "user_message", None) or str(e) or "Error de Stripe")

    d = sess.to_dict() if hasattr(sess, "to_dict") else None
    if not isinstance(d, dict):
        return False, "Respuesta de Stripe inesperada"

    if not _checkout_session_belongs_to_org(d, organization_id):
        return False, "Esta sesión de pago no corresponde a tu organización"

    if d.get("mode") != "subscription":
        return False, "La sesión no es de suscripción"

    st = d.get("status")
    if st != "complete":
        return False, f"La sesión aún no está completa (estado: {st})"

    if not _subscription_id_from_checkout_session(d):
        return False, "Stripe aún no asoció la suscripción; espera unos segundos y recarga"

    try:
        handle_checkout_session_completed(db, d)
    except Exception as e:  # noqa: BLE001
        return False, str(e) or "Error al sincronizar"
    org2 = db.get(Organization, organization_id)
    if not org2 or not (org2.stripe_subscription_id and str(org2.stripe_subscription_id).strip()):
        return (
            False,
            "La suscripción no quedó guardada. Reintenta o comprueba el webhook y los logs del servidor.",
        )
    return True, None


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

    sub_id = _subscription_id_from_checkout_session(session_obj)
    if not sub_id:
        return
    configure_stripe()
    sub = stripe.Subscription.retrieve(sub_id, expand=["items.data.price"])
    sub_payload = sub.to_dict() if hasattr(sub, "to_dict") else sub
    org.billing_trial_consumed = True
    sync_org_from_stripe_subscription(db, org, sub_payload)


def handle_deposit_checkout_session_completed(db: Session, session_obj: dict) -> None:
    """
    Deposit checkout: mark appointment as paid and confirm it.
    Expected session metadata: {kind:"deposit", appointment_id:"...", organization_id:"..."}
    """
    if session_obj.get("mode") != "payment":
        return
    md = session_obj.get("metadata") or {}
    if (md.get("kind") or "").strip().lower() != "deposit":
        return
    appo_id_raw = md.get("appointment_id")
    if not appo_id_raw:
        return
    try:
        appo_id = int(appo_id_raw)
    except (TypeError, ValueError):
        return

    appo = db.get(Appointment, appo_id)
    if not appo:
        return

    # If session id doesn't match, ignore (prevents cross-linking).
    sid = session_obj.get("id")
    if sid and getattr(appo, "stripe_checkout_session_id", None) and appo.stripe_checkout_session_id != sid:
        return

    appo.deposit_paid = True
    appo.stripe_payment_intent_id = session_obj.get("payment_intent")
    appo.status = "scheduled"
    db.add(appo)
    db.commit()


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
    org.stripe_sub_status = "canceled"
    org.stripe_trial_ends_at = None
    org.stripe_current_period_ends_at = None
    db.add(org)
    db.commit()
