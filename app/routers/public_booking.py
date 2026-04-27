"""
Public online booking (no client login). Salon is identified by organization.booking_public_token.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.db.session import get_session
from app.models.organization import Organization
from app.models.service import Service
from app.schemas.agent import BookRequest, BookResponse
from app.services.deposit_booking import book_with_deposit_checkout
from app.services.whatsapp_agent import _compute_slots

router = APIRouter(prefix="/public/booking", tags=["public-booking"])


def _org_from_token(db: Session, token: str) -> Organization:
    raw = (token or "").strip()
    if len(raw) < 8:
        raise HTTPException(status_code=400, detail="Token no válido")
    org = db.exec(select(Organization).where(Organization.booking_public_token == raw)).first()
    if not org:
        raise HTTPException(status_code=404, detail="Enlace no válido o caducado")
    return org


@router.get("/config")
def public_booking_config(
    token: str,
    db: Session = Depends(get_session),
):
    org = _org_from_token(db, token)
    org_id = int(org.id)
    rows = db.exec(
        select(Service).where(Service.organization_id == org_id, Service.is_active == True)  # noqa: E712
    ).all()
    stripe_ok = bool(
        getattr(org, "stripe_connect_account_id", None)
        and getattr(org, "stripe_connect_charges_enabled", False)
        and getattr(org, "stripe_connect_payouts_enabled", False)
    )
    return {
        "organization_name": org.name,
        "stripe_ready": stripe_ok,
        "min_notice_minutes": 30,
        "services": [
            {
                "id": int(s.id),
                "name": s.name,
                "duration": int(s.duration or 60),
                "price": float(s.price or 0),
            }
            for s in rows
            if s.id is not None
        ],
    }


class PublicSlotsBody(BaseModel):
    token: str = Field(..., min_length=8)
    day: date
    service_ids: list[int] = Field(..., min_length=1)
    min_notice_minutes: int = Field(30, ge=0, le=24 * 60)


@router.post("/slots")
def public_booking_slots(
    body: PublicSlotsBody,
    db: Session = Depends(get_session),
):
    org = _org_from_token(db, body.token)
    org_id = int(org.id)
    slots = _compute_slots(
        db,
        org_id=org_id,
        org=org,
        service_ids=list(body.service_ids),
        day=body.day,
        step_minutes=15,
        min_notice_minutes=int(body.min_notice_minutes),
        limit=60,
    )
    out = []
    for start_dt, staff_id in slots:
        out.append(
            {
                "staff_id": int(staff_id),
                "start_time": start_dt.isoformat(timespec="minutes"),
            }
        )
    return {"slots": out}


class PublicBookBody(BookRequest):
    token: str = Field(..., min_length=8)


@router.post("/book", response_model=BookResponse)
def public_booking_book(
    body: PublicBookBody,
    db: Session = Depends(get_session),
):
    org = _org_from_token(db, body.token)
    if not (
        getattr(org, "stripe_connect_account_id", None)
        and getattr(org, "stripe_connect_charges_enabled", False)
        and getattr(org, "stripe_connect_payouts_enabled", False)
    ):
        raise HTTPException(
            status_code=503,
            detail="Este negocio aún no puede aceptar pagos online. Prueba más tarde o reserva por teléfono.",
        )
    inner = BookRequest(
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        email=body.email,
        service_ids=body.service_ids,
        start_time=body.start_time,
        preferred_staff_id=body.preferred_staff_id,
        notes=body.notes,
        min_notice_minutes=body.min_notice_minutes,
    )
    return book_with_deposit_checkout(
        db,
        org,
        inner,
        checkout_return="public",
        public_booking_token=body.token.strip(),
    )
