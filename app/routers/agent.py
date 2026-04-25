import json
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.db.session import get_session
from app.dependencies import get_current_user_for_app
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.service import Service
from app.models.user import User, UserRole
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

@router.get("/services")
def agent_services(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    """
    Returns the live service catalog for the current salon/org.
    Intended for the conversational agent to suggest valid services.
    """
    org_id = _org_id_or_400(current_user)
    rows = db.exec(select(Service).where(Service.organization_id == org_id)).all()
    return [
        {
            "id": int(s.id),
            "name": s.name,
            "duration": int(s.duration),
            "price": float(s.price),
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
    stmt = select(Appointment).where(
        Appointment.organization_id == org_id,
        Appointment.staff_id == staff_id,
        Appointment.status == "scheduled",
        start < Appointment.end_time,
        end > Appointment.start_time,
    )
    return db.exec(stmt).first() is not None


@router.post("/quote", response_model=QuoteResponse)
def agent_quote(
    body: QuoteRequest,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    org_id = _org_id_or_400(current_user)
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
    current_user: User = Depends(get_current_user_for_app),
):
    org_id = _org_id_or_400(current_user)
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
    current_user: User = Depends(get_current_user_for_app),
):
    org_id = _org_id_or_400(current_user)
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

    staff_ids = [int(body.preferred_staff_id)] if body.preferred_staff_id else _staff_ids_for_org(db, org_id)
    if not staff_ids:
        raise HTTPException(status_code=400, detail="No hay profesionales disponibles")

    chosen_staff: int | None = None
    for sid in staff_ids:
        if not _has_collision(db, org_id, sid, start, end):
            chosen_staff = sid
            break
    if chosen_staff is None:
        raise HTTPException(status_code=400, detail="No hay disponibilidad para esa hora")

    # Client upsert by normalized phone (org-scoped)
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
        # best-effort refresh fields
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
        status="scheduled",
        notes=(body.notes or "").strip() or None,
        staff_id=chosen_staff,
        service_id=int(primary.id),
        additional_service_ids_json=json.dumps(extras) if extras else None,
        organization_id=org_id,
    )

    db.add(appo)
    db.commit()
    db.refresh(appo)

    deposit_amount = round(price * 0.25, 2)
    return BookResponse(
        appointment_id=int(appo.id),
        staff_id=chosen_staff,
        client_id=int(client_row.id),
        start_time=appo.start_time,
        end_time=appo.end_time,
        total_minutes=minutes,
        total_price=price,
        deposit_amount=deposit_amount,
    )

