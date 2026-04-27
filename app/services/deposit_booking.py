"""
Shared flow: create appointment pending deposit + Stripe Checkout (Connect destination).
Used by /agent/book and /public/booking/book.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import stripe
from fastapi import HTTPException
from sqlmodel import Session, select

from app.billing.stripe_service import configure_stripe, stripe_secret_configured
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.organization import Organization
from app.schemas.agent import BookRequest, BookResponse

DEPOSIT_PERCENT = 0.25
HOLD_MINUTES = 15


def org_accepts_online_deposit(org: Organization) -> bool:
    """Uses org flags synced when the owner opens Connect status in Settings."""
    if not stripe_secret_configured():
        return False
    if not getattr(org, "stripe_connect_account_id", None):
        return False
    return bool(
        getattr(org, "stripe_connect_charges_enabled", False)
        and getattr(org, "stripe_connect_payouts_enabled", False)
    )


def _frontend_base() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def book_with_deposit_checkout(
    db: Session,
    org: Organization,
    body: BookRequest,
    *,
    checkout_return: str = "app",
    public_booking_token: str | None = None,
) -> BookResponse:
    """
    checkout_return:
      - "app": return to logged-in app calendar after Checkout.
      - "public": return to /reservar?token=… (public booking page).
      - "guest": return to /reservar?deposit=… (WhatsApp / payer without salon token).
    public_booking_token: required when checkout_return == "public" (for return URLs).
    """
    # Deferred import avoids circular import (agent.router ↔ this module).
    from app.routers.agent import (
        _has_collision,
        _norm_phone_es,
        _services_for_org,
        _staff_ids_for_org,
        _total_minutes,
        _total_price,
        _tz,
    )

    if not stripe_secret_configured():
        raise HTTPException(status_code=503, detail="Pagos no configurados en el servidor.")
    acct_id = getattr(org, "stripe_connect_account_id", None)
    if not acct_id:
        raise HTTPException(status_code=400, detail="El negocio aún no ha conectado Stripe para depósitos.")

    org_id = int(org.id)
    tz = _tz()

    start = body.start_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=tz)
    else:
        start = start.astimezone(tz)

    if start < datetime.now(tz) + timedelta(minutes=int(body.min_notice_minutes)):
        raise HTTPException(status_code=400, detail="Reserva con poca antelación (mínimo 30 min)")

    services = _services_for_org(db, org_id, list(body.service_ids))
    minutes = _total_minutes(services)
    price = _total_price(services)
    end = start + timedelta(minutes=minutes)

    staff_ids = (
        [int(body.preferred_staff_id)] if body.preferred_staff_id else _staff_ids_for_org(db, org_id)
    )
    if not staff_ids:
        raise HTTPException(status_code=400, detail="No hay profesionales disponibles")

    chosen_staff: int | None = None
    for sid in staff_ids:
        if not _has_collision(db, org_id, sid, start, end):
            chosen_staff = sid
            break
    if chosen_staff is None:
        raise HTTPException(status_code=400, detail="No hay disponibilidad para esa hora")

    phone_norm = _norm_phone_es(body.phone)
    if not phone_norm:
        raise HTTPException(status_code=400, detail="Teléfono requerido")

    existing_clients = db.exec(select(Client).where(Client.organization_id == org_id)).all()
    client_row = None
    for c in existing_clients:
        if _norm_phone_es(c.telefono) == phone_norm:
            client_row = c
            break

    first = (body.first_name or "").strip() or "Cliente"
    last = (body.last_name or "").strip() or None
    email = (body.email or "").strip() or None

    if client_row is None:
        client_row = Client(
            nombre=first,
            apellidos=last,
            telefono=str(body.phone).strip(),
            email=email,
            organization_id=org_id,
        )
        db.add(client_row)
        db.flush()
        db.refresh(client_row)
    else:
        changed = False
        if first and first != client_row.nombre:
            client_row.nombre = first
            changed = True
        if body.last_name is not None:
            if (last or None) != client_row.apellidos:
                client_row.apellidos = last
                changed = True
        if email and email != client_row.email:
            client_row.email = email
            changed = True
        if str(body.phone).strip() and str(body.phone).strip() != client_row.telefono:
            client_row.telefono = str(body.phone).strip()
            changed = True
        if changed:
            db.add(client_row)

    primary = services[0]
    extras = [int(s.id) for s in services[1:]]

    appo = Appointment(
        client_id=client_row.id,
        client_name=" ".join([first, last or ""]).strip(),
        client_phone=str(body.phone).strip(),
        client_email=email,
        start_time=start,
        end_time=end,
        status="pending_deposit",
        notes=(body.notes or "").strip() or None,
        staff_id=chosen_staff,
        service_id=int(primary.id),
        additional_service_ids_json=json.dumps(extras) if extras else None,
        organization_id=org_id,
    )

    db.add(appo)
    db.commit()
    db.refresh(appo)

    deposit_amount = round(price * DEPOSIT_PERCENT, 2)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=HOLD_MINUTES)
    appo.deposit_percent = float(DEPOSIT_PERCENT)
    appo.deposit_amount = float(deposit_amount)
    appo.deposit_paid = False
    appo.deposit_expires_at = expires_at
    db.add(appo)
    db.commit()
    db.refresh(appo)

    configure_stripe()
    fb = _frontend_base()
    if checkout_return == "public":
        tok = (public_booking_token or "").strip()
        if not tok:
            raise HTTPException(status_code=500, detail="Token de reserva pública no disponible")
        q = quote(tok, safe="")
        success_url = f"{fb}/reservar?token={q}&deposit=success&appointment_id={int(appo.id)}"
        cancel_url = f"{fb}/reservar?token={q}&deposit=cancel&appointment_id={int(appo.id)}"
    elif checkout_return == "guest":
        success_url = f"{fb}/reservar?deposit=success&appointment_id={int(appo.id)}"
        cancel_url = f"{fb}/reservar?deposit=cancel&appointment_id={int(appo.id)}"
    else:
        success_url = f"{fb}/app?tab=calendario&deposit=success&appointment_id={int(appo.id)}"
        cancel_url = f"{fb}/app?tab=calendario&deposit=cancel&appointment_id={int(appo.id)}"

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
            "appointment_id": str(int(appo.id)),
            "organization_id": str(org_id),
        },
        payment_intent_data={
            "metadata": {
                "kind": "deposit",
                "appointment_id": str(int(appo.id)),
                "organization_id": str(org_id),
            },
            "transfer_data": {"destination": str(acct_id)},
        },
    )
    cust_email = (body.email or "").strip()
    if cust_email:
        session_kwargs["customer_email"] = cust_email
    session = stripe.checkout.Session.create(**session_kwargs)
    url = session.get("url")
    sid = session.get("id")
    if not url or not sid:
        raise HTTPException(status_code=502, detail="Stripe no devolvió URL de pago.")
    appo.stripe_checkout_session_id = sid
    db.add(appo)
    db.commit()

    return BookResponse(
        appointment_id=int(appo.id),
        staff_id=chosen_staff,
        client_id=int(client_row.id),
        start_time=appo.start_time,
        end_time=appo.end_time,
        total_minutes=minutes,
        total_price=price,
        deposit_amount=deposit_amount,
        payment_url=str(url),
        deposit_expires_at=expires_at,
    )
