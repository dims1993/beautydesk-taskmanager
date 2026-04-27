import os
import json
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.db.session import get_session
from app.dependencies import get_current_user_for_app
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.models.appointment import Appointment
from app.models.service import Service
from app.billing.stripe_service import configure_stripe, stripe_secret_configured


router = APIRouter(prefix="/payments", tags=["payments"])


DEPOSIT_PERCENT = 0.25
HOLD_MINUTES = 15


def _frontend_base() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def _require_owner(user: User) -> None:
    if user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Solo el titular puede configurar cobros.")


def _org_for_user(db: Session, user: User) -> Organization:
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="No perteneces a una organización.")
    org = db.get(Organization, user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada.")
    return org


@router.get("/connect/status")
def connect_status(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    org = _org_for_user(db, current_user)
    acct_id = getattr(org, "stripe_connect_account_id", None)
    if acct_id and stripe_secret_configured():
        try:
            configure_stripe()
            acct = stripe.Account.retrieve(str(acct_id))
            org.stripe_connect_details_submitted = bool(acct.get("details_submitted"))
            org.stripe_connect_charges_enabled = bool(acct.get("charges_enabled"))
            org.stripe_connect_payouts_enabled = bool(acct.get("payouts_enabled"))
            db.add(org)
            db.commit()
            db.refresh(org)
        except Exception:
            # Non-fatal: keep cached values
            pass
    return {
        "connect_account_id": acct_id,
        "details_submitted": bool(getattr(org, "stripe_connect_details_submitted", False)),
        "charges_enabled": bool(getattr(org, "stripe_connect_charges_enabled", False)),
        "payouts_enabled": bool(getattr(org, "stripe_connect_payouts_enabled", False)),
        "ready": bool(getattr(org, "stripe_connect_payouts_enabled", False)),
    }


class ConnectOnboardResponse(BaseModel):
    url: str


@router.post("/connect/onboard", response_model=ConnectOnboardResponse)
def connect_onboard(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    _require_owner(current_user)
    if not stripe_secret_configured():
        raise HTTPException(status_code=503, detail="Stripe no configurado en el servidor.")

    org = _org_for_user(db, current_user)
    configure_stripe()

    acct_id = getattr(org, "stripe_connect_account_id", None)
    if not acct_id:
        acct = stripe.Account.create(
            type="express",
            country="ES",
            email=(current_user.email or "").strip() or None,
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            business_profile={
                "name": (org.name or "").strip() or None,
                "product_description": "Reservas y depósitos para citas",
            },
            metadata={"organization_id": str(org.id)},
        )
        acct_id = acct.get("id")
        if not acct_id:
            raise HTTPException(status_code=502, detail="Stripe no devolvió account_id.")
        org.stripe_connect_account_id = acct_id
        db.add(org)
        db.commit()
        db.refresh(org)

    return_url = f"{_frontend_base()}/app?tab=ajustes&focus=payments"
    refresh_url = return_url
    link = stripe.AccountLink.create(
        account=acct_id,
        refresh_url=refresh_url,
        return_url=return_url,
        type="account_onboarding",
    )
    url = link.get("url")
    if not url:
        raise HTTPException(status_code=502, detail="Stripe no devolvió URL de onboarding.")
    return {"url": url}


def _parse_extra_service_ids(raw: str | None) -> list[int]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        return [int(x) for x in data if str(x).isdigit() or isinstance(x, int)]
    except Exception:
        return []


def _appointment_total_price(db: Session, appo: Appointment) -> float:
    ids = [int(appo.service_id)]
    ids.extend(_parse_extra_service_ids(getattr(appo, "additional_service_ids_json", None)))
    rows = db.exec(select(Service).where(Service.id.in_(ids))).all()
    total = 0.0
    for s in rows:
        try:
            total += float(getattr(s, "price", 0) or 0)
        except Exception:
            pass
    return float(total)


class DepositCheckoutResponse(BaseModel):
    url: str
    deposit_amount: float
    expires_at: datetime


@router.post("/appointments/{appointment_id}/deposit/checkout", response_model=DepositCheckoutResponse)
def create_deposit_checkout(
    appointment_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    """
    Creates a Stripe Checkout Session for a 25% deposit.
    Money is routed to the org's connected Stripe account (destination charge).
    """
    if not stripe_secret_configured():
        raise HTTPException(status_code=503, detail="Stripe no configurado en el servidor.")

    org = _org_for_user(db, current_user)
    acct_id = getattr(org, "stripe_connect_account_id", None)
    if not acct_id or not str(acct_id).strip():
        raise HTTPException(
            status_code=400,
            detail="Primero conecta Stripe en Ajustes para poder cobrar depósitos.",
        )

    appo = db.get(Appointment, appointment_id)
    if not appo:
        raise HTTPException(status_code=404, detail="Cita no encontrada.")
    if current_user.role != UserRole.SUPER_ADMIN:
        if not current_user.organization_id or appo.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Sin acceso a esta cita.")

    total = _appointment_total_price(db, appo)
    if total <= 0:
        raise HTTPException(status_code=400, detail="La cita no tiene precio válido.")

    deposit_amount = round(total * DEPOSIT_PERCENT, 2)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=HOLD_MINUTES)

    # mark hold
    appo.status = "pending_deposit"
    appo.deposit_percent = float(DEPOSIT_PERCENT)
    appo.deposit_amount = float(deposit_amount)
    appo.deposit_paid = False
    appo.deposit_expires_at = expires_at
    db.add(appo)
    db.commit()
    db.refresh(appo)

    configure_stripe()

    success_url = f"{_frontend_base()}/app?tab=calendario&deposit=success&appointment_id={appo.id}"
    cancel_url = f"{_frontend_base()}/app?tab=calendario&deposit=cancel&appointment_id={appo.id}"

    # Stripe expects amounts in cents
    amount_cents = int(round(deposit_amount * 100))
    if amount_cents < 50:
        raise HTTPException(status_code=400, detail="Depósito demasiado pequeño.")

    session_kwargs: dict = dict(
        mode="payment",
        expires_at=int(expires_at.timestamp()),
        payment_method_types=["card", "bizum"],
        line_items=[
            {
                "price_data": {
                    "currency": "eur",
                    "product_data": {"name": f"Depósito reserva ({int(DEPOSIT_PERCENT*100)}%)"},
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }
        ],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "kind": "deposit",
            "appointment_id": str(appo.id),
            "organization_id": str(org.id),
        },
        payment_intent_data={
            "metadata": {
                "kind": "deposit",
                "appointment_id": str(appo.id),
                "organization_id": str(org.id),
            },
            "transfer_data": {"destination": str(acct_id)},
        },
    )
    ce = (getattr(appo, "client_email", None) or "").strip()
    if ce:
        session_kwargs["customer_email"] = ce
    session = stripe.checkout.Session.create(**session_kwargs)

    url = session.get("url")
    sid = session.get("id")
    if not url or not sid:
        raise HTTPException(status_code=502, detail="Stripe no devolvió URL de pago.")

    appo.stripe_checkout_session_id = sid
    db.add(appo)
    db.commit()

    return {"url": url, "deposit_amount": float(deposit_amount), "expires_at": expires_at}

