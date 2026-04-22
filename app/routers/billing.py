"""
Facturación Stripe: Checkout (primera suscripción), cambio de plan, portal de cliente, webhooks.
"""
from __future__ import annotations

import os

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.billing.stripe_service import (
    configure_stripe,
    create_billing_portal_session,
    create_checkout_session,
    handle_checkout_session_completed,
    handle_subscription_deleted,
    handle_subscription_updated,
    modify_subscription_to_plan,
    plans_price_availability,
    price_id_for_plan,
    stripe_secret_configured,
    sync_organization_from_checkout_session_id,
    trial_period_days,
    webhook_secret_configured,
)
from app.billing.subscription import SubscriptionPlan, parse_subscription_plan
from app.core.db.session import get_session
from app.dependencies import get_current_user
from app.models.organization import Organization
from app.models.user import User, UserRole

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutBody(BaseModel):
    plan: str = Field(..., description="esencial | profesional | premium")


class ChangePlanBody(BaseModel):
    plan: str = Field(..., description="esencial | profesional | premium")


class ConfirmCheckoutSessionBody(BaseModel):
    session_id: str = Field(..., min_length=8, description="cs_… de la URL al volver de Stripe")


def _require_owner_with_org(user: User) -> None:
    if user.role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el titular del negocio puede gestionar la suscripción.",
        )
    if not user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completa los datos del negocio antes de contratar un plan.",
        )


def _parse_plan(raw: str) -> SubscriptionPlan:
    return parse_subscription_plan(raw)


@router.post("/confirm-checkout-session")
def confirm_checkout_session(
    body: ConfirmCheckoutSessionBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Sincroniza la organización como el webhook, usando el session_id de la URL
    de éxito. Necesario si el webhook aún no llegó (local sin `stripe listen`).
    Usa get_current_user (no el gate de app) para poder ejecutarse con cuenta
    aún “bloqueada” hasta asignar stripe_subscription_id.
    """
    _require_owner_with_org(current_user)
    if not stripe_secret_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagos no configurados en el servidor (STRIPE_SECRET_KEY).",
        )
    sid = (body.session_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="session_id requerido")

    ok, err = sync_organization_from_checkout_session_id(
        db,
        organization_id=current_user.organization_id,
        session_id=sid,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err or "No se pudo confirmar el pago con Stripe",
        )
    return {"success": True}


@router.get("/status")
def billing_status():
    """Estado de configuración (sin secretos). Útil para la UI de Ajustes."""
    tdays = trial_period_days()
    return {
        "stripe_configured": stripe_secret_configured(),
        "webhook_configured": webhook_secret_configured(),
        "prices": plans_price_availability(),
        "trial_period_days": tdays,
        "first_checkout_uses_trial": tdays > 0,
    }


@router.post("/checkout-session")
def create_checkout(
    body: CheckoutBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_owner_with_org(current_user)
    if not stripe_secret_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagos no configurados en el servidor (STRIPE_SECRET_KEY).",
        )

    plan = _parse_plan(body.plan)
    if not price_id_for_plan(plan):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Falta el precio de Stripe para el plan {plan.value} (STRIPE_PRICE_{plan.name}).",
        )

    org = db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

    if org.stripe_subscription_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Ya tienes una suscripción en Stripe. Usa «Gestionar facturación» "
                "o «Cambiar plan» según corresponda."
            ),
        )

    # Una sola prueba por organización: si ya hubo un checkout completado, sin trial
    include_trial = not bool(
        getattr(org, "billing_trial_consumed", False) or False
    ) and (trial_period_days() > 0)

    try:
        url = create_checkout_session(
            organization_id=org.id,
            owner_email=current_user.email,
            plan=plan,
            include_trial=include_trial,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe: {getattr(e, 'user_message', None) or str(e)}",
        ) from e

    tdays = trial_period_days()
    return {
        "url": url,
        "trial_applied": include_trial and tdays > 0,
        "trial_period_days": tdays if include_trial else 0,
    }


@router.post("/change-plan")
def change_plan(
    body: ChangePlanBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Cambia el precio de la suscripción existente (upgrade/downgrade con prorrateo)."""
    _require_owner_with_org(current_user)
    if not stripe_secret_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pagos no configurados en el servidor.",
        )

    new_plan = _parse_plan(body.plan)
    if not price_id_for_plan(new_plan):
        raise HTTPException(
            status_code=503,
            detail=f"Falta STRIPE_PRICE_{new_plan.name} en el servidor.",
        )

    org = db.get(Organization, current_user.organization_id)
    if not org or not org.stripe_subscription_id:
        raise HTTPException(
            status_code=400,
            detail="No hay suscripción activa en Stripe. Usa «Contratar plan» primero.",
        )

    try:
        configure_stripe()
        modify_subscription_to_plan(
            stripe_subscription_id=org.stripe_subscription_id,
            new_plan=new_plan,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe: {getattr(e, 'user_message', None) or str(e)}",
        ) from e

    return {"success": True, "plan": new_plan.value}


@router.post("/portal-session")
def billing_portal(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Portal de cliente Stripe (facturas, método de pago, cancelar…)."""
    _require_owner_with_org(current_user)
    if not stripe_secret_configured():
        raise HTTPException(status_code=503, detail="Stripe no configurado.")

    org = db.get(Organization, current_user.organization_id)
    if not org or not org.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No hay cliente de Stripe asociado. Contrata un plan primero.",
        )

    try:
        url = create_billing_portal_session(stripe_customer_id=org.stripe_customer_id)
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe: {getattr(e, 'user_message', None) or str(e)}",
        ) from e

    return {"url": url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_session)):
    if not webhook_secret_configured():
        raise HTTPException(status_code=503, detail="Webhook no configurado")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Falta stripe-signature")

    wh_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, wh_secret)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Payload inválido: {e}") from e
    except stripe.error.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail=f"Firma inválida: {e}") from e

    configure_stripe()
    etype = event["type"]
    data = event["data"]["object"]

    try:
        if etype == "checkout.session.completed":
            handle_checkout_session_completed(db, data)
        elif etype == "customer.subscription.updated":
            handle_subscription_updated(db, data)
        elif etype == "customer.subscription.deleted":
            handle_subscription_deleted(db, data)
    except Exception as e:
        # Log y 200: Stripe reintenta en 5xx; en bugs internos preferimos no spamear reintentos
        print(f"⚠️ billing webhook handler error ({etype}): {e}")

    return {"received": True}
