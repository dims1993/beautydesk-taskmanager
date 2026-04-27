import hashlib
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlmodel import Session, select
from sqlalchemy import or_, and_
from datetime import timezone

from app.core.db.session import get_session
from app.dependencies import get_current_user_optional
from app.models.appointment import Appointment
from app.models.organization import Organization
from app.models.service_category import ServiceCategory
from app.models.service import Service
from app.models.user import User, UserRole
from app.services.deposit_booking import book_with_deposit_checkout
from app.schemas.agent import (
    AvailabilityRequest,
    AvailabilityResponse,
    AvailabilitySlot,
    QuoteRequest,
    QuoteResponse,
    BookRequest,
    BookResponse,
)

router = APIRouter(prefix="/agent", tags=["agent"])


def _org_from_agent_key(db: Session, key: str) -> Organization | None:
    raw = (key or "").strip()
    if not raw:
        return None
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return db.exec(select(Organization).where(Organization.agent_key_hash == h)).first()


def _get_org_context(
    db: Session,
    x_agent_key: str | None,
    current_user: User | None,
) -> Organization:
    # Prefer explicit agent key (for WhatsApp/IG orchestrators)
    if x_agent_key:
        org = _org_from_agent_key(db, x_agent_key)
        if not org:
            raise HTTPException(status_code=401, detail="Invalid agent key")
        return org

    # Fallback: allow authenticated org users (owner/staff) to call /agent/*
    if current_user and current_user.organization_id:
        org = db.get(Organization, current_user.organization_id)
        if org:
            return org

    raise HTTPException(status_code=401, detail="Missing authentication")

@router.get("/services")
def agent_services(
    db: Session = Depends(get_session),
    x_agent_key: str | None = Header(default=None, alias="X-Agent-Key"),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Returns the live service catalog for the current salon/org.
    Intended for the conversational agent to suggest valid services.
    """
    org = _get_org_context(db, x_agent_key, current_user)
    org_id = int(org.id)
    rows = db.exec(
        select(Service).where(Service.organization_id == org_id, Service.is_active == True)  # noqa: E712
    ).all()
    cats = db.exec(
        select(ServiceCategory).where(ServiceCategory.organization_id == org_id)
    ).all()
    cat_by_id = {int(c.id): c for c in cats if c and c.id is not None}
    return [
        {
            "id": int(s.id),
            "name": s.name,
            "duration": int(s.duration),
            "price": float(s.price),
            "category_id": int(s.category_id) if getattr(s, "category_id", None) else None,
            "category_name": (
                cat_by_id.get(int(s.category_id)).name
                if getattr(s, "category_id", None) and int(s.category_id) in cat_by_id
                else None
            ),
        }
        for s in rows
        if s and s.id is not None
    ]


def _tz() -> ZoneInfo:
    return ZoneInfo("Europe/Madrid")


def _parse_hhmm(v: str) -> time:
    raw = (v or "").strip()
    parts = raw.split(":")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid HH:MM time")
    try:
        hh = int(parts[0])
        mm = int(parts[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid HH:MM time")
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        raise HTTPException(status_code=400, detail="Invalid HH:MM time")
    return time(hour=hh, minute=mm)


def _digits_only(raw: str | None) -> str:
    if not raw:
        return ""
    return "".join(c for c in str(raw) if c.isdigit())


def _norm_phone_es(raw: str | None) -> str:
    digits = _digits_only(raw)
    if len(digits) >= 12 and digits.startswith("0034"):
        digits = digits[4:]
    if len(digits) >= 11 and digits.startswith("34"):
        digits = digits[2:]
    return digits


def _org_id_or_400(user: User) -> int:
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Provide org context via owner account")
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Missing organization")
    return int(user.organization_id)


def _services_for_org(db: Session, org_id: int, service_ids: list[int]) -> list[Service]:
    services: list[Service] = []
    for sid in service_ids:
        svc = db.get(Service, sid)
        if not svc:
            raise HTTPException(status_code=400, detail="Servicio no encontrado")
        if svc.organization_id != org_id:
            raise HTTPException(status_code=403, detail="Servicio fuera de tu organización")
        services.append(svc)
    return services


def _total_minutes(services: list[Service]) -> int:
    return int(sum((s.duration or 60) for s in services))


def _total_price(services: list[Service]) -> float:
    return float(sum((float(s.price) if s.price is not None else 0.0) for s in services))


def _staff_ids_for_org(db: Session, org_id: int) -> list[int]:
    rows = db.exec(select(User).where(User.organization_id == org_id)).all()
    ids: list[int] = []
    for u in rows:
        if u.role in (UserRole.OWNER, UserRole.STAFF):
            if u.id is not None:
                ids.append(int(u.id))
    return sorted(set(ids))


def _has_collision(db: Session, org_id: int, staff_id: int, start: datetime, end: datetime) -> bool:
    now_utc = datetime.now(timezone.utc)
    stmt = select(Appointment).where(
        Appointment.organization_id == org_id,
        Appointment.staff_id == staff_id,
        or_(
            Appointment.status == "scheduled",
            and_(
                Appointment.status == "pending_deposit",
                Appointment.deposit_expires_at.is_not(None),
                Appointment.deposit_expires_at > now_utc,
            ),
        ),
        start < Appointment.end_time,
        end > Appointment.start_time,
    )
    return db.exec(stmt).first() is not None


@router.post("/quote", response_model=QuoteResponse)
def agent_quote(
    body: QuoteRequest,
    db: Session = Depends(get_session),
    x_agent_key: str | None = Header(default=None, alias="X-Agent-Key"),
    current_user: User | None = Depends(get_current_user_optional),
):
    org = _get_org_context(db, x_agent_key, current_user)
    org_id = int(org.id)
    services = _services_for_org(db, org_id, list(body.service_ids))
    minutes = _total_minutes(services)
    price = _total_price(services)
    deposit_amount = round(price * 0.25, 2)
    return QuoteResponse(
        total_minutes=minutes,
        total_price=price,
        deposit_amount=deposit_amount,
    )


@router.post("/availability", response_model=AvailabilityResponse)
def agent_availability(
    body: AvailabilityRequest,
    db: Session = Depends(get_session),
    x_agent_key: str | None = Header(default=None, alias="X-Agent-Key"),
    current_user: User | None = Depends(get_current_user_optional),
):
    org = _get_org_context(db, x_agent_key, current_user)
    org_id = int(org.id)
    services = _services_for_org(db, org_id, list(body.service_ids))
    minutes = _total_minutes(services)
    step = int(body.slot_step_minutes)
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="Invalid service duration")
    if step <= 0:
        raise HTTPException(status_code=400, detail="Invalid slot_step_minutes")

    tz = _tz()
    day_open = datetime.combine(body.day, _parse_hhmm(body.open_time), tzinfo=tz)
    day_close = datetime.combine(body.day, _parse_hhmm(body.close_time), tzinfo=tz)
    if day_close <= day_open:
        raise HTTPException(status_code=400, detail="close_time must be after open_time")

    now = datetime.now(tz)
    min_start = now + timedelta(minutes=int(body.min_notice_minutes))
    start_cursor = max(day_open, min_start)

    staff_ids = [int(body.staff_id)] if body.staff_id else _staff_ids_for_org(db, org_id)
    if not staff_ids:
        return AvailabilityResponse(total_minutes=minutes, slots=[])

    slots: list[AvailabilitySlot] = []
    cursor = start_cursor

    # align cursor to slot step
    if cursor.minute % step != 0:
        delta = step - (cursor.minute % step)
        cursor = (cursor + timedelta(minutes=delta)).replace(second=0, microsecond=0)
    else:
        cursor = cursor.replace(second=0, microsecond=0)

    while True:
        end = cursor + timedelta(minutes=minutes)
        if end > day_close:
            break
        for sid in staff_ids:
            if not _has_collision(db, org_id, sid, cursor, end):
                slots.append(AvailabilitySlot(staff_id=sid, start_time=cursor, end_time=end))
        cursor = cursor + timedelta(minutes=step)

    return AvailabilityResponse(total_minutes=minutes, slots=slots)


@router.post("/book", response_model=BookResponse)
def agent_book(
    body: BookRequest,
    db: Session = Depends(get_session),
    x_agent_key: str | None = Header(default=None, alias="X-Agent-Key"),
    current_user: User | None = Depends(get_current_user_optional),
):
    org = _get_org_context(db, x_agent_key, current_user)
    return book_with_deposit_checkout(db, org, body, checkout_return="app")

