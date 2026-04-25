import json
from datetime import datetime, timedelta, date, time
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models import Conversation, Organization, Service
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.user import User
from app.routers.agent import (
    _has_collision,
    _norm_phone_es,
    _services_for_org,
    _staff_ids_for_org,
    _total_minutes,
)


TZ = ZoneInfo("Europe/Madrid")


def _digits_only(raw: str | None) -> str:
    if not raw:
        return ""
    return "".join(c for c in str(raw) if c.isdigit())


def _load_state(conv: Conversation) -> dict:
    try:
        return json.loads(conv.state_json or "{}")
    except Exception:
        return {}


def _save_state(db: Session, conv: Conversation, state: dict) -> None:
    conv.state_json = json.dumps(state, ensure_ascii=False)
    conv.updated_at = datetime.utcnow()
    db.add(conv)
    db.commit()


def _get_or_create_conversation(
    db: Session,
    *,
    org_id: int,
    channel: str,
    from_addr: str,
    to_addr: str,
) -> Conversation:
    conv = db.exec(
        select(Conversation).where(
            Conversation.organization_id == org_id,
            Conversation.channel == channel,
            Conversation.from_addr == from_addr,
            Conversation.to_addr == to_addr,
        )
    ).first()
    if conv:
        return conv
    conv = Conversation(
        organization_id=org_id,
        channel=channel,
        from_addr=from_addr,
        to_addr=to_addr,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def _list_services(db: Session, org_id: int) -> list[Service]:
    return db.exec(select(Service).where(Service.organization_id == org_id)).all()


def _format_services_menu(services: list[Service]) -> str:
    lines: list[str] = []
    for idx, s in enumerate(services[:30], start=1):
        meta: list[str] = []
        dur = getattr(s, "duration", None)
        price = getattr(s, "price", None)
        if dur is not None:
            meta.append(f"{int(dur)}min")
        if price is not None:
            meta.append(f"{float(price):g}€")
        suffix = f" ({' · '.join(meta)})" if meta else ""
        lines.append(f"{idx}) {s.name}{suffix}")
    return "Elige un servicio escribiendo el número:\n" + "\n".join(lines)


def _parse_choice_number(txt: str, max_n: int) -> int | None:
    raw = (txt or "").strip()
    if not raw:
        return None
    try:
        n = int(raw)
    except ValueError:
        return None
    if n < 1 or n > max_n:
        return None
    return n


def _parse_date_yyyy_mm_dd(txt: str) -> date | None:
    raw = (txt or "").strip()
    try:
        return date.fromisoformat(raw)
    except Exception:
        return None


def _compute_slots(
    db: Session,
    *,
    org_id: int,
    service_ids: list[int],
    day: date,
    open_time: time = time(9, 0),
    close_time: time = time(20, 0),
    step_minutes: int = 15,
    min_notice_minutes: int = 30,
    limit: int = 3,
) -> list[tuple[datetime, int]]:
    services = _services_for_org(db, org_id, service_ids)
    minutes = _total_minutes(services)
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="Invalid service duration")

    day_open = datetime.combine(day, open_time, tzinfo=TZ)
    day_close = datetime.combine(day, close_time, tzinfo=TZ)
    now = datetime.now(TZ)
    min_start = now + timedelta(minutes=min_notice_minutes)
    cursor = max(day_open, min_start)

    staff_ids = _staff_ids_for_org(db, org_id)
    slots: list[tuple[datetime, int]] = []

    # Simple strategy: first-fit across staff
    while cursor + timedelta(minutes=minutes) <= day_close and len(slots) < limit:
        end = cursor + timedelta(minutes=minutes)
        for staff_id in staff_ids:
            if not _has_collision(db, org_id, staff_id, cursor, end):
                slots.append((cursor, staff_id))
                break
        cursor = cursor + timedelta(minutes=step_minutes)
    return slots


def _book_appointment(
    db: Session,
    *,
    org: Organization,
    from_addr: str,
    service_ids: list[int],
    start_time: datetime,
    staff_id: int,
) -> Appointment:
    # Find / upsert client by WhatsApp number
    phone_digits = _norm_phone_es(_digits_only(from_addr))
    client = None
    if phone_digits:
        client = db.exec(
            select(Client).where(
                Client.organization_id == org.id,
                Client.telefono == phone_digits,
            )
        ).first()
    if not client:
        client = Client(
            organization_id=int(org.id),
            nombre="Cliente WhatsApp",
            telefono=phone_digits or None,
        )
        db.add(client)
        db.commit()
        db.refresh(client)

    services = _services_for_org(db, int(org.id), service_ids)
    total_minutes = _total_minutes(services)
    end_time = start_time + timedelta(minutes=total_minutes)

    primary_id = int(service_ids[0])
    additional = [int(x) for x in service_ids[1:]]

    appo = Appointment(
        organization_id=int(org.id),
        client_id=int(client.id),
        staff_id=int(staff_id),
        service_id=primary_id,
        additional_service_ids_json=json.dumps(additional) if additional else None,
        start_time=start_time,
        end_time=end_time,
        status="scheduled",
        notes="Creada por agente WhatsApp (Twilio).",
    )
    db.add(appo)
    db.commit()
    db.refresh(appo)
    return appo


def handle_inbound_whatsapp(
    db: Session,
    *,
    org: Organization,
    from_addr: str,
    to_addr: str,
    body: str,
) -> str:
    """
    Stateless interface:
    - Loads conversation state from DB
    - Runs state machine
    - Persists state
    - Returns reply text
    """
    conv = _get_or_create_conversation(
        db,
        org_id=int(org.id),
        channel="whatsapp",
        from_addr=from_addr,
        to_addr=to_addr,
    )
    state = _load_state(conv)

    txt = (body or "").strip()
    txt_upper = txt.upper()

    # Global commands
    if txt_upper in ("RESET", "REINICIAR"):
        state = {"step": "idle"}
        _save_state(db, conv, state)
        return "Listo. Empezamos de cero. Escribe CITA para reservar o SERVICIOS para ver el catálogo."

    if txt_upper in ("HI", "HOLA", "HELP", "AYUDA", "MENU", "MENÚ", "START"):
        return (
            f"Hola, soy el asistente de {org.name}.\n"
            "Comandos:\n"
            "- SERVICIOS\n"
            "- CITA\n"
            "- RESET\n"
        )

    if txt_upper.startswith("SERVICIOS"):
        services = _list_services(db, int(org.id))
        if not services:
            return "Aún no hay servicios configurados."
        return "Servicios disponibles:\n" + "\n".join(f"- {s.name}" for s in services[:30]) + "\n\nDi: CITA"

    step = state.get("step") or "idle"

    if txt_upper == "CITA" or step == "idle":
        services = _list_services(db, int(org.id))
        if not services:
            return "Ahora mismo no hay servicios configurados en el salón."
        state = {
            "step": "awaiting_service",
            "services_cache": [{"id": int(s.id), "name": s.name} for s in services if s.id is not None][:30],
        }
        _save_state(db, conv, state)
        return _format_services_menu(services)

    if step == "awaiting_service":
        cached = state.get("services_cache") or []
        choice = _parse_choice_number(txt, len(cached))
        if not choice:
            return "No te he entendido. Escribe el número del servicio (ej: 1)."
        service_id = int(cached[choice - 1]["id"])
        state["step"] = "awaiting_date"
        state["service_ids"] = [service_id]
        _save_state(db, conv, state)
        return "Perfecto. ¿Qué día quieres? Escribe la fecha en formato YYYY-MM-DD (ej: 2026-04-30)."

    if step == "awaiting_date":
        d = _parse_date_yyyy_mm_dd(txt)
        if not d:
            return "Formato de fecha inválido. Ejemplo: 2026-04-30"
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        slots = _compute_slots(db, org_id=int(org.id), service_ids=service_ids, day=d)
        if not slots:
            return "No encuentro huecos ese día. Prueba con otra fecha (YYYY-MM-DD)."
        # store options
        options = []
        for s, staff_id in slots:
            options.append({"start": s.isoformat(), "staff_id": int(staff_id)})
        state["step"] = "awaiting_slot_choice"
        state["slot_options"] = options
        _save_state(db, conv, state)
        lines = []
        for idx, opt in enumerate(options, start=1):
            dt = datetime.fromisoformat(opt["start"])
            lines.append(f"{idx}) {dt.strftime('%H:%M')}")
        return (
            f"Estos son los primeros huecos disponibles para {d.isoformat()}:\n"
            + "\n".join(lines)
            + "\n\nElige una opción (1, 2, 3)."
        )

    if step == "awaiting_slot_choice":
        options = state.get("slot_options") or []
        choice = _parse_choice_number(txt, len(options))
        if not choice:
            return "Escribe 1, 2 o 3 para elegir un horario."
        opt = options[choice - 1]
        start = datetime.fromisoformat(opt["start"])
        staff_id = int(opt["staff_id"])
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        appo = _book_appointment(
            db,
            org=org,
            from_addr=from_addr,
            service_ids=service_ids,
            start_time=start,
            staff_id=staff_id,
        )
        state = {"step": "idle"}
        _save_state(db, conv, state)
        return (
            "Reserva confirmada.\n"
            f"- Cita #{int(appo.id)}\n"
            f"- Día/hora: {start.strftime('%Y-%m-%d %H:%M')}\n"
            "Si quieres otra cita, escribe CITA."
        )

    # Fallback
    state["step"] = "idle"
    _save_state(db, conv, state)
    return "No te he entendido. Escribe AYUDA para ver opciones."

