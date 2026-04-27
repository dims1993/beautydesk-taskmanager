import json
import os
import re
import unicodedata
from datetime import datetime, timedelta, date, time
from zoneinfo import ZoneInfo
from urllib.parse import quote

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
from app.schemas.agent import BookRequest
from app.services.deposit_booking import book_with_deposit_checkout, org_accepts_online_deposit


TZ = ZoneInfo("Europe/Madrid")

TIME_RE = re.compile(r"\b([01]?\d|2[0-3])(?::([0-5]\d))\b")


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
    return db.exec(
        select(Service).where(
            Service.organization_id == org_id,
            Service.is_active == True,  # noqa: E712
        )
    ).all()


def _service_cache_from_services(services: list[Service]) -> list[dict]:
    return [{"id": int(s.id), "name": s.name} for s in services if s.id is not None][:30]


def _filter_services_by_keyword(services: list[Service], keyword: str) -> list[Service]:
    raw = _strip_accents((keyword or "").strip().lower())
    if not raw:
        return services
    out: list[Service] = []
    for s in services:
        name = _strip_accents((s.name or "").strip().lower())
        desc = _strip_accents((getattr(s, "description", "") or "").strip().lower())
        if raw in name or (desc and raw in desc):
            out.append(s)
    return out


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


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _parse_relative_date_es(txt: str) -> date | None:
    raw = _strip_accents((txt or "").strip().lower())
    today = datetime.now(TZ).date()
    if "pasado manana" in raw:
        return today + timedelta(days=2)
    if "manana" in raw:
        return today + timedelta(days=1)
    if "hoy" in raw:
        return today
    return None


def _parse_time_hhmm_es(txt: str) -> time | None:
    raw = _strip_accents((txt or "").strip().lower())
    m = TIME_RE.search(raw)
    if not m:
        # allow "a las 20"
        m2 = re.search(r"\b([01]?\d|2[0-3])\b", raw)
        if not m2:
            return None
        hh = int(m2.group(1))
        return time(hh, 0)
    hh = int(m.group(1))
    mm = int(m.group(2) or "0")
    return time(hh, mm)


def _match_service_ids_from_text(db: Session, org_id: int, txt: str) -> list[int]:
    raw = _strip_accents((txt or "").strip().lower())
    if not raw:
        return []
    services = _list_services(db, org_id)
    hits: list[tuple[int, int]] = []
    for s in services:
        if s.id is None:
            continue
        name = _strip_accents((s.name or "").strip().lower())
        if not name:
            continue
        if name in raw:
            hits.append((len(name), int(s.id)))
    hits.sort(reverse=True)
    return [sid for _, sid in hits[:3]]


def _best_service_id_from_text_or_number(
    db: Session,
    org_id: int,
    txt: str,
    services_cache: list[dict] | None,
) -> int | None:
    """
    Resolve a service either by numeric menu choice or by fuzzy-ish name match.
    Falls back to live service list when cache is missing.
    """
    raw = (txt or "").strip()
    if not raw:
        return None

    cache = services_cache or []
    if not cache:
        services = _list_services(db, org_id)
        cache = [{"id": int(s.id), "name": s.name} for s in services if s.id is not None][:30]

    # numeric choice (1..N)
    choice = _parse_choice_number(raw, len(cache))
    if choice:
        return int(cache[choice - 1]["id"])

    # name match
    hits = _match_service_ids_from_text(db, org_id, raw)
    if hits:
        return int(hits[0])
    return None


def _parse_yes_no(txt: str) -> bool | None:
    raw = (txt or "").strip().lower()
    if not raw:
        return None
    if raw in ("si", "sí", "s", "ok", "vale", "confirmar", "confirmo", "yes", "y"):
        return True
    if raw in ("no", "n", "cancelar", "cancelo", "stop"):
        return False
    return None


def _local_now_naive() -> datetime:
    """Local Europe/Madrid time but stored as naive in DB."""
    return datetime.now(TZ).replace(tzinfo=None)


def _greeting(org: Organization) -> str:
    return f"Hola, soy el asistente personal de {org.name}."


def _public_booking_line(org: Organization) -> str | None:
    tok = getattr(org, "booking_public_token", None)
    if not tok or not str(tok).strip():
        return None
    base = (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
    return f"{base}/reservar?token={quote(str(tok).strip(), safe='')}"


def _main_menu_message(org: Organization) -> str:
    """
    Utility-style root menu (similar to corporate WhatsApp bots): clear numbered options.
    """
    lines = [
        _greeting(org),
        "",
        "Elige una opción escribiendo el número:",
        "1) Servicios y precios",
        "2) Reservar cita",
        "3) Cancelar mi cita",
        "4) Datos de contacto del salón",
        "",
        "También puedes escribir: SERVICIOS, CITA, CANCELAR, AYUDA u OPCIONES.",
    ]
    return "\n".join(lines)


def _contact_message(org: Organization) -> str:
    parts: list[str] = ["Datos de contacto del salón:", ""]
    ph = (getattr(org, "billing_phone", None) or "").strip()
    em = (getattr(org, "billing_email", None) or "").strip()
    if ph:
        parts.append(f"Teléfono: {ph}")
    else:
        parts.append("Teléfono: (no publicado) Pregunta al salón.")
    if em:
        parts.append(f"Email: {em}")
    else:
        parts.append("Email: (no publicado)")
    pub = _public_booking_line(org)
    if pub:
        parts.append("")
        parts.append("Reserva online (web):")
        parts.append(pub)
    parts.append("")
    parts.append("Para volver al menú escribe OPCIONES o MENU.")
    return "\n".join(parts)


def _start_cita_flow(db: Session, conv: Conversation, org: Organization) -> str:
    services = _list_services(db, int(org.id))
    if not services:
        return "Ahora mismo no hay servicios configurados en el salón."
    state = {
        "step": "awaiting_service",
        "services_cache": [{"id": int(s.id), "name": s.name} for s in services if s.id is not None][:30],
    }
    _save_state(db, conv, state)
    return f"{_greeting(org)}\n" + _format_services_menu(services)


def _try_cancel_last_appointment(db: Session, org: Organization, from_addr: str) -> str:
    """Shared by CANCELAR and main-menu option 3."""
    phone_digits = _norm_phone_es(_digits_only(from_addr))
    if not phone_digits:
        return "Para cancelar necesito que me escribas desde el mismo WhatsApp de la reserva."
    client = db.exec(
        select(Client).where(
            Client.organization_id == org.id,
            Client.telefono == phone_digits,
        )
    ).first()
    if not client or client.id is None:
        return "No encuentro ninguna cita asociada a este número."
    now_local = _local_now_naive()
    appo = db.exec(
        select(Appointment)
        .where(
            Appointment.organization_id == org.id,
            Appointment.client_id == int(client.id),
            Appointment.status == "scheduled",
            Appointment.start_time >= now_local,
        )
        .order_by(Appointment.start_time.asc())
    ).first()
    if not appo:
        return "No tienes ninguna cita pendiente para cancelar."
    if (appo.start_time - now_local) > timedelta(hours=24):
        return "Solo puedes cancelar dentro de las 24 horas previas a la cita."
    appo.status = "cancelled"
    db.add(appo)
    db.commit()
    return f"Tu cita ha sido cancelada. (Cita #{int(appo.id)})"


def _staff_display_name(u: User) -> str:
    parts = [getattr(u, "first_name", None), getattr(u, "last_name", None)]
    raw = " ".join([p for p in parts if p and str(p).strip()]).strip()
    if raw:
        return raw
    return (
        (getattr(u, "nombre", None) or getattr(u, "username", None) or getattr(u, "email", "") or "Profesional")
        .strip()
    )


def _list_staff_for_org(db: Session, org_id: int) -> list[User]:
    ids = _staff_ids_for_org(db, org_id)
    if not ids:
        return []
    rows = db.exec(select(User).where(User.id.in_(ids))).all()
    rows.sort(key=lambda u: int(u.id or 0))
    return rows


def _format_staff_menu(staff: list[User]) -> tuple[str, list[dict]]:
    cache: list[dict] = []
    lines: list[str] = []
    for idx, u in enumerate(staff[:10], start=1):
        if u.id is None:
            continue
        cache.append({"id": int(u.id), "name": _staff_display_name(u)})
        lines.append(f"{idx}) {cache[-1]['name']}")
    return "¿Con quién te gustaría la cita? Responde con el número:\n" + "\n".join(lines), cache


def _parse_staff_choice(txt: str, staff_cache: list[dict]) -> int | None:
    choice = _parse_choice_number(txt, len(staff_cache))
    if not choice:
        return None
    return int(staff_cache[choice - 1]["id"])


def _parse_hhmm_to_time(s: str, *, fallback: time) -> time:
    try:
        hh, mm = [int(x) for x in str(s).strip().split(":")]
        return time(hh, mm)
    except Exception:
        return fallback


def _org_open_windows_for_day(org: Organization, *, dow: int) -> list[tuple[time, time]]:
    """
    Returns 0..N open windows for a day, supporting both:
    - New schema: {"mode": "...", "intervals": [{"start","end"}, ...]}
    - Legacy schema: {"open_time","close_time"}
    """
    raw = (getattr(org, "salon_hours_json", None) or "").strip()
    if not raw:
        return [(time(9, 0), time(20, 0))]
    try:
        days = json.loads(raw) or []
        row = next((d for d in days if int(d.get("day_of_week", -1)) == dow), None)
    except Exception:
        row = None
    if not isinstance(row, dict):
        return [(time(9, 0), time(20, 0))]
    if not bool(row.get("is_open", True)):
        return []

    intervals = row.get("intervals")
    if isinstance(intervals, list) and intervals:
        out: list[tuple[time, time]] = []
        for it in intervals:
            if not isinstance(it, dict):
                continue
            st = _parse_hhmm_to_time(it.get("start", "09:00"), fallback=time(9, 0))
            en = _parse_hhmm_to_time(it.get("end", "20:00"), fallback=time(20, 0))
            if st < en:
                out.append((st, en))
        return out or [(time(9, 0), time(20, 0))]

    open_t = _parse_hhmm_to_time(row.get("open_time", "09:00"), fallback=time(9, 0))
    close_t = _parse_hhmm_to_time(row.get("close_time", "20:00"), fallback=time(20, 0))
    if open_t >= close_t:
        return [(time(9, 0), time(20, 0))]
    return [(open_t, close_t)]


def _org_is_closed_on_date(org: Organization, *, day: date) -> bool:
    raw = (getattr(org, "salon_closed_dates_json", None) or "").strip()
    if not raw:
        return False
    try:
        dates = json.loads(raw) or []
        if not isinstance(dates, list):
            return False
        s = day.isoformat()
        return any(str(x).strip() == s for x in dates)
    except Exception:
        return False


def _compute_slots(
    db: Session,
    *,
    org_id: int,
    org: Organization,
    service_ids: list[int],
    day: date,
    step_minutes: int = 15,
    min_notice_minutes: int = 30,
    limit: int = 3,
) -> list[tuple[datetime, int]]:
    services = _services_for_org(db, org_id, service_ids)
    minutes = _total_minutes(services)
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="Invalid service duration")

    if _org_is_closed_on_date(org, day=day):
        return []

    dow = day.weekday()  # Mon=0 .. Sun=6
    windows = _org_open_windows_for_day(org, dow=dow)
    if not windows:
        return []

    # IMPORTANT: Appointment.start_time is stored as naive local time in DB (timestamp without tz).
    # If we pass tz-aware datetimes, Postgres will convert to UTC and we end up with a 2h shift.
    now_local = _local_now_naive()
    min_start = now_local + timedelta(minutes=min_notice_minutes)

    staff_ids = _staff_ids_for_org(db, org_id)
    slots: list[tuple[datetime, int]] = []

    # Simple strategy: first-fit across staff
    for open_t, close_t in windows:
        day_open = datetime.combine(day, open_t)
        day_close = datetime.combine(day, close_t)
        cursor = max(day_open, min_start)
        while cursor + timedelta(minutes=minutes) <= day_close and len(slots) < limit:
            end = cursor + timedelta(minutes=minutes)
            for staff_id in staff_ids:
                if not _has_collision(db, org_id, staff_id, cursor, end):
                    slots.append((cursor, staff_id))
                    break
            cursor = cursor + timedelta(minutes=step_minutes)
        if len(slots) >= limit:
            break
    return slots


def _compute_slots_near_preferred_time(
    db: Session,
    *,
    org_id: int,
    org: Organization,
    service_ids: list[int],
    day: date,
    preferred: time,
    step_minutes: int = 15,
    min_notice_minutes: int = 30,
    limit: int = 3,
) -> list[tuple[datetime, int]]:
    """
    Try to honor a requested start time; otherwise propose nearest alternatives.
    Returns naive local datetimes (see _compute_slots).
    """
    services = _services_for_org(db, org_id, service_ids)
    minutes = _total_minutes(services)
    if minutes <= 0:
        return []

    if _org_is_closed_on_date(org, day=day):
        return []

    dow = day.weekday()
    windows = _org_open_windows_for_day(org, dow=dow)
    if not windows:
        return []

    requested = datetime.combine(day, preferred)

    now_local = _local_now_naive()
    min_start = now_local + timedelta(minutes=min_notice_minutes)
    if requested < min_start:
        requested = min_start

    staff_ids = _staff_ids_for_org(db, org_id)

    def within_some_window(start_dt: datetime) -> bool:
        end_dt = start_dt + timedelta(minutes=minutes)
        for open_t, close_t in windows:
            w_open = datetime.combine(day, open_t)
            w_close = datetime.combine(day, close_t)
            if start_dt >= w_open and end_dt <= w_close:
                return True
        return False

    def fits(start_dt: datetime) -> tuple[datetime, int] | None:
        end_dt = start_dt + timedelta(minutes=minutes)
        if not within_some_window(start_dt):
            return None
        for staff_id in staff_ids:
            if not _has_collision(db, org_id, staff_id, start_dt, end_dt):
                return (start_dt, staff_id)
        return None

    # 1) Exact (rounded to step)
    # round down to nearest step
    base_minutes = (requested.hour * 60 + requested.minute)
    step = max(5, int(step_minutes))
    rounded = (base_minutes // step) * step
    exact = datetime.combine(day, time(rounded // 60, rounded % 60))
    hit = fits(exact)
    if hit:
        return [hit]

    # 2) Nearest alternatives (across windows) based on distance to exact
    all_candidates: list[tuple[datetime, int]] = []
    step_td = timedelta(minutes=step)
    for open_t, close_t in windows:
        w_open = datetime.combine(day, open_t)
        w_close = datetime.combine(day, close_t)
        cursor = max(w_open, min_start)
        while cursor + timedelta(minutes=minutes) <= w_close:
            h = fits(cursor)
            if h:
                all_candidates.append(h)
            cursor = cursor + step_td
    all_candidates.sort(key=lambda x: abs((x[0] - exact).total_seconds()))
    return all_candidates[:limit]


def _compute_slots_for_specific_staff_near_time(
    db: Session,
    *,
    org_id: int,
    org: Organization,
    staff_id: int,
    service_ids: list[int],
    day: date,
    preferred: time,
    step_minutes: int = 15,
    min_notice_minutes: int = 30,
    limit: int = 3,
) -> list[datetime]:
    """Try requested time first, then nearest alternatives, for a specific staff."""
    services = _services_for_org(db, org_id, service_ids)
    minutes = _total_minutes(services)
    if minutes <= 0:
        return []

    if _org_is_closed_on_date(org, day=day):
        return []

    dow = day.weekday()
    windows = _org_open_windows_for_day(org, dow=dow)
    if not windows:
        return []

    requested = datetime.combine(day, preferred)

    min_start = _local_now_naive() + timedelta(minutes=min_notice_minutes)
    if requested < min_start:
        requested = min_start

    def within_some_window(start_dt: datetime) -> bool:
        end_dt = start_dt + timedelta(minutes=minutes)
        for open_t, close_t in windows:
            w_open = datetime.combine(day, open_t)
            w_close = datetime.combine(day, close_t)
            if start_dt >= w_open and end_dt <= w_close:
                return True
        return False

    def fits(start_dt: datetime) -> bool:
        end_dt = start_dt + timedelta(minutes=minutes)
        if not within_some_window(start_dt):
            return False
        return not _has_collision(db, org_id, staff_id, start_dt, end_dt)

    base_minutes = requested.hour * 60 + requested.minute
    step = max(5, int(step_minutes))
    rounded = (base_minutes // step) * step
    exact = datetime.combine(day, time(rounded // 60, rounded % 60))

    out: list[datetime] = []
    if fits(exact):
        out.append(exact)
        return out

    for delta_steps in range(1, 16):
        for sign in (-1, 1):
            cand = exact + timedelta(minutes=sign * delta_steps * step)
            if fits(cand):
                out.append(cand)
                if len(out) >= limit:
                    return out
    return out


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

    client_name = (getattr(client, "nombre", None) or "").strip() or "Cliente WhatsApp"
    client_phone = (getattr(client, "telefono", None) or "").strip() or (phone_digits or None)
    client_email = (getattr(client, "email", None) or "").strip() or None

    services = _services_for_org(db, int(org.id), service_ids)
    total_minutes = _total_minutes(services)
    # Store as naive local time (see note in _compute_slots)
    start_time_local = start_time.replace(tzinfo=None)
    end_time = start_time_local + timedelta(minutes=total_minutes)

    primary_id = int(service_ids[0])
    additional = [int(x) for x in service_ids[1:]]

    appo = Appointment(
        organization_id=int(org.id),
        client_id=int(client.id),
        client_name=client_name,
        client_phone=client_phone,
        client_email=client_email,
        staff_id=int(staff_id),
        service_id=primary_id,
        additional_service_ids_json=json.dumps(additional) if additional else None,
        start_time=start_time_local,
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
        return "Listo. Empezamos de cero. Escribe OPCIONES para ver el menú, CITA para reservar o SERVICIOS para el catálogo."

    if txt_upper in ("CANCELAR", "CANCEL", "ANULAR"):
        return _try_cancel_last_appointment(db, org, from_addr)

    if txt_upper in ("CAMBIAR FECHA", "FECHA", "OTRO DIA", "OTRO DÍA"):
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        if not service_ids:
            return "Primero dime qué quieres reservar: escribe CITA."
        state["step"] = "awaiting_date"
        _save_state(db, conv, state)
        return "Perfecto. Dime la fecha (YYYY-MM-DD)."

    if txt_upper in ("HI", "HOLA", "HELP", "AYUDA", "MENU", "MENÚ", "START", "OPCIONES"):
        return _main_menu_message(org)

    if txt_upper.startswith("SERVICIOS"):
        services = _list_services(db, int(org.id))
        if not services:
            return "Aún no hay servicios configurados."
        # allow: "SERVICIOS uñas" -> filtered list
        parts = txt.split(maxsplit=1)
        if len(parts) == 2 and parts[1].strip():
            filtered = _filter_services_by_keyword(services, parts[1])
            if not filtered:
                return "No encuentro servicios con esa palabra. Escribe SERVICIOS para ver el catálogo completo."
            return (
                "Servicios encontrados:\n"
                + "\n".join(f"- {s.name}" for s in filtered[:30])
                + "\n\nDi: CITA"
            )
        return "Servicios disponibles:\n" + "\n".join(f"- {s.name}" for s in services[:30]) + "\n\nDi: CITA"

    step = state.get("step") or "idle"

    # Main menu shortcuts (idle only) — must run before NL and before generic idle→CITA funnel.
    if step == "idle" and txt.strip() in ("1", "2", "3", "4"):
        choice = int(txt.strip())
        if choice == 1:
            services = _list_services(db, int(org.id))
            if not services:
                return "Aún no hay servicios configurados."
            return (
                "Servicios y precios:\n"
                + "\n".join(f"- {s.name}" for s in services[:30])
                + "\n\nPara reservar escribe 2 o CITA."
            )
        if choice == 2:
            return _start_cita_flow(db, conv, org)
        if choice == 3:
            return _try_cancel_last_appointment(db, org, from_addr)
        return _contact_message(org)

    # Natural language assist: capture date/time/service from free text when idle.
    if step == "idle" and txt and txt_upper not in ("CITA", "SERVICIOS"):
        rel_d = _parse_relative_date_es(txt)
        abs_d = _parse_date_yyyy_mm_dd(txt)
        t = _parse_time_hhmm_es(txt)
        svc_ids = _match_service_ids_from_text(db, int(org.id), txt)
        if rel_d or abs_d:
            state["preferred_day"] = (abs_d or rel_d).isoformat()
        if t:
            state["preferred_time"] = t.strftime("%H:%M")
        if svc_ids:
            state["service_ids"] = [int(svc_ids[0])]
        if any(k in state for k in ("preferred_day", "preferred_time", "service_ids")):
            if not state.get("service_ids"):
                services = _list_services(db, int(org.id))
                # If the message contains a keyword, show a filtered menu instead of full list
                keyword_hits = _filter_services_by_keyword(services, txt)
                shown = keyword_hits if 0 < len(keyword_hits) < len(services) else services
                state["services_cache"] = _service_cache_from_services(shown)
                state["step"] = "awaiting_service"
            else:
                state["step"] = "awaiting_date"
            _save_state(db, conv, state)
            if state["step"] == "awaiting_service":
                services = _list_services(db, int(org.id))
                shown = _filter_services_by_keyword(services, txt)
                if 0 < len(shown) < len(services):
                    return (
                        "He encontrado estos servicios relacionados. Responde con el número o el nombre:\n"
                        + _format_services_menu(shown)
                    )
                return (
                    "Entendido. Para reservar necesito el servicio.\n"
                    + _format_services_menu(services)
                )
            # If we already have a service, ask date (or use captured date)
            if state.get("preferred_day"):
                state["step"] = "awaiting_date"
                _save_state(db, conv, state)
                return (
                    "Perfecto. He entendido la fecha.\n"
                    "Confírmame el día escribiendo YYYY-MM-DD (por ejemplo 2026-04-30)."
                )
            return "Perfecto. ¿Qué día quieres? Escribe la fecha en formato YYYY-MM-DD (ej: 2026-04-30)."

    if txt_upper == "CITA" or step == "idle":
        return _start_cita_flow(db, conv, org)

    if step == "awaiting_service":
        cached = state.get("services_cache") or []
        service_id = _best_service_id_from_text_or_number(
            db, int(org.id), txt, cached
        )
        if not service_id:
            # ensure cache exists for next attempt
            if not cached:
                services = _list_services(db, int(org.id))
                # If user typed a keyword (not just a number), filter the menu
                shown = _filter_services_by_keyword(services, txt)
                if 0 < len(shown) < len(services):
                    state["services_cache"] = _service_cache_from_services(shown)
                else:
                    state["services_cache"] = _service_cache_from_services(services)
                _save_state(db, conv, state)
            return (
                "No te he entendido.\n"
                "Responde con el número del servicio (ej: 1) o escribe su nombre (ej: 'manicura')."
            )
        state["service_ids"] = [service_id]
        state["step"] = "awaiting_more_services"
        _save_state(db, conv, state)
        return (
            "Perfecto. ¿Quieres añadir otro servicio a la misma cita?\n"
            "Responde: SI / NO"
        )

    if step == "awaiting_more_services":
        yn = _parse_yes_no(txt)
        if yn is None:
            return "Responde SI o NO. (También puedes escribir RESET para empezar de cero)."
        if yn is False:
            state["step"] = "awaiting_date"
            _save_state(db, conv, state)
            return "Genial. ¿Qué día quieres? Escribe la fecha en formato YYYY-MM-DD (ej: 2026-04-30)."

        # yes -> show menu again to pick an additional service
        services = _list_services(db, int(org.id))
        if not services:
            state["step"] = "awaiting_date"
            _save_state(db, conv, state)
            return "No veo servicios para añadir. Dime la fecha (YYYY-MM-DD)."
        state["step"] = "awaiting_additional_service"
        state["services_cache"] = [{"id": int(s.id), "name": s.name} for s in services if s.id is not None][:30]
        _save_state(db, conv, state)
        return "Elige el servicio adicional escribiendo el número:\n" + "\n".join(
            f"{i}) {s.name}" for i, s in enumerate(services[:30], start=1)
        )

    if step == "awaiting_additional_service":
        cached = state.get("services_cache") or []
        choice = _parse_choice_number(txt, len(cached))
        if not choice:
            return "No te he entendido. Escribe el número del servicio adicional (ej: 2)."
        service_id = int(cached[choice - 1]["id"])
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        if service_id in service_ids:
            return "Ese servicio ya está añadido. Elige otro número o responde RESET."
        service_ids.append(service_id)
        state["service_ids"] = service_ids
        state["step"] = "awaiting_more_services"
        _save_state(db, conv, state)
        return "Añadido. ¿Quieres añadir otro servicio?\nResponde: SI / NO"

    if step == "awaiting_date":
        # Enforce: we must know the service(s) before offering availability.
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        if not service_ids:
            services = _list_services(db, int(org.id))
            state["step"] = "awaiting_service"
            state["services_cache"] = _service_cache_from_services(services)
            _save_state(db, conv, state)
            return "Antes necesito el servicio para calcular la duración.\n" + _format_services_menu(services)

        d = _parse_date_yyyy_mm_dd(txt) or _parse_relative_date_es(txt)
        if not d:
            return (
                "Formato de fecha inválido.\n"
                "Ejemplos válidos:\n"
                "- 2026-04-30\n"
                "- mañana\n"
                "- mañana a las 15:00"
            )

        # If the user provided a time in this same message, capture it as preferred_time
        t_in_msg = _parse_time_hhmm_es(txt)
        if t_in_msg:
            state["preferred_time"] = t_in_msg.strftime("%H:%M")

        pref = (state.get("preferred_time") or "").strip()
        pref_t = _parse_time_hhmm_es(pref) if pref else None
        if not pref_t:
            state["step"] = "awaiting_time"
            state["preferred_day"] = d.isoformat()
            _save_state(db, conv, state)
            return "Perfecto. ¿A qué hora te gustaría? (ej: 15:00)"

        state["preferred_day"] = d.isoformat()

        staff = _list_staff_for_org(db, int(org.id))
        if len(staff) > 1:
            menu, cache = _format_staff_menu(staff)
            state["step"] = "awaiting_staff"
            state["staff_cache"] = cache
            _save_state(db, conv, state)
            return menu

        # 0 or 1 staff -> pick automatically
        staff_id = int(staff[0].id) if staff and staff[0].id is not None else None
        if not staff_id:
            return "No encuentro profesionales disponibles. Revisa el equipo del salón."

        options_dt = _compute_slots_for_specific_staff_near_time(
            db,
            org_id=int(org.id),
            org=org,
            staff_id=staff_id,
            service_ids=service_ids,
            day=d,
            preferred=pref_t,
            limit=3,
        )
        if not options_dt:
            return "Ese profesional está ocupado a esa hora. Prueba con otra hora o fecha."

        options = [{"start": dt.isoformat(), "staff_id": staff_id} for dt in options_dt]
        state["step"] = "awaiting_slot_choice"
        state["slot_options"] = options
        state["slot_day"] = d.isoformat()
        _save_state(db, conv, state)
        lines = []
        for idx, opt in enumerate(options, start=1):
            dt = datetime.fromisoformat(opt["start"])
            lines.append(f"{idx}) {dt.strftime('%H:%M')}")
        return (
            f"Huecos disponibles para {d.isoformat()}:\n"
            + "\n".join(lines)
            + "\n\nElige una opción (1, 2, 3)."
        )

    if step == "awaiting_time":
        t = _parse_time_hhmm_es(txt)
        if not t:
            return "Hora inválida. Ejemplo: 15:00"
        state["preferred_time"] = t.strftime("%H:%M")
        state["step"] = "awaiting_date"
        _save_state(db, conv, state)
        return "Perfecto. Ahora dime el día (hoy/mañana o YYYY-MM-DD)."

    if step == "awaiting_staff":
        cache = state.get("staff_cache") or []
        sid = _parse_staff_choice(txt, cache)
        if not sid:
            return "No te he entendido. Responde con el número del profesional."
        state["staff_id"] = int(sid)
        # Reuse the flow by re-entering date step with stored preferred day/time
        d_raw = (state.get("preferred_day") or "").strip()
        t_raw = (state.get("preferred_time") or "").strip()
        d = _parse_date_yyyy_mm_dd(d_raw) or _parse_relative_date_es(d_raw)
        pref_t = _parse_time_hhmm_es(t_raw) if t_raw else None
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        if not d or not pref_t or not service_ids:
            state["step"] = "awaiting_date"
            _save_state(db, conv, state)
            return "Perfecto. Dime el día (hoy/mañana o YYYY-MM-DD)."

        options_dt = _compute_slots_for_specific_staff_near_time(
            db,
            org_id=int(org.id),
            org=org,
            staff_id=int(sid),
            service_ids=service_ids,
            day=d,
            preferred=pref_t,
            limit=3,
        )
        if not options_dt:
            return "Ese profesional está ocupado a esa hora. Prueba con otra hora o fecha."
        options = [{"start": dt.isoformat(), "staff_id": int(sid)} for dt in options_dt]
        state["step"] = "awaiting_slot_choice"
        state["slot_options"] = options
        state["slot_day"] = d.isoformat()
        _save_state(db, conv, state)
        lines = []
        for idx, opt in enumerate(options, start=1):
            dt = datetime.fromisoformat(opt["start"])
            lines.append(f"{idx}) {dt.strftime('%H:%M')}")
        return (
            f"Huecos disponibles para {d.isoformat()} con ese profesional:\n"
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
        state["step"] = "awaiting_booking_confirmation"
        state["selected_slot"] = {"start": opt["start"], "staff_id": staff_id}
        _save_state(db, conv, state)
        # Build service summary
        svcs = _services_for_org(db, int(org.id), service_ids)
        svc_names = ", ".join([s.name for s in svcs]) if svcs else "Servicio"
        return (
            "Perfecto, voy a reservar esto:\n"
            f"- Servicio(s): {svc_names}\n"
            f"- Día/hora: {start.strftime('%Y-%m-%d %H:%M')}\n\n"
            "¿Confirmas la cita?\nResponde: SI / NO"
        )

    if step == "awaiting_booking_confirmation":
        yn = _parse_yes_no(txt)
        if yn is None:
            return "Responde SI o NO. (También puedes escribir CAMBIAR FECHA o RESET)."
        if yn is False:
            # Keep selected services but allow choosing a new date
            state["step"] = "awaiting_date"
            state.pop("selected_slot", None)
            state.pop("slot_options", None)
            _save_state(db, conv, state)
            return "Vale. Dime otra fecha (YYYY-MM-DD) y te doy huecos disponibles."

        selected = state.get("selected_slot") or {}
        if not selected.get("start") or not selected.get("staff_id"):
            state["step"] = "awaiting_date"
            _save_state(db, conv, state)
            return "He perdido el horario seleccionado. Dime la fecha (YYYY-MM-DD) y lo intentamos de nuevo."
        start = datetime.fromisoformat(str(selected["start"]))
        staff_id = int(selected["staff_id"])
        service_ids = [int(x) for x in (state.get("service_ids") or [])]

        phone_digits = _norm_phone_es(_digits_only(from_addr))
        if not phone_digits:
            state = {"step": "idle"}
            _save_state(db, conv, state)
            return (
                "No puedo leer tu número de teléfono desde WhatsApp. "
                "Escribe CITA para intentarlo de nuevo."
            )

        existing = db.exec(
            select(Client).where(
                Client.organization_id == org.id,
                Client.telefono == phone_digits,
            )
        ).first()
        first = (getattr(existing, "nombre", None) or "").strip() or "Cliente"
        last = (getattr(existing, "apellidos", None) or "").strip() or None
        email = (getattr(existing, "email", None) or "").strip() or None

        if org_accepts_online_deposit(org):
            try:
                body = BookRequest(
                    first_name=first,
                    last_name=last or None,
                    phone=str(phone_digits),
                    email=email or None,
                    service_ids=service_ids,
                    start_time=start,
                    preferred_staff_id=staff_id,
                    notes="Reserva por WhatsApp (depósito).",
                    min_notice_minutes=30,
                )
                res = book_with_deposit_checkout(db, org, body, checkout_return="guest")
                pay = (res.payment_url or "").strip()
                state = {"step": "idle"}
                _save_state(db, conv, state)
                if not pay:
                    return (
                        "No se pudo generar el enlace de pago. Escribe CITA para intentarlo de nuevo "
                        "o contacta con el salón."
                    )
                return (
                    "Para confirmar la cita, paga el depósito (25%) en este enlace "
                    "(tienes unos minutos; tarjeta o Bizum):\n"
                    f"{pay}\n\n"
                    "Al completar el pago, la cita quedará confirmada sola. "
                    "Si quieres otra cita después, escribe CITA."
                )
            except HTTPException as e:
                d = e.detail if isinstance(e.detail, str) else str(e.detail)
                state = {"step": "idle"}
                _save_state(db, conv, state)
                return f"No se pudo preparar el pago: {d} Escribe CITA para intentarlo de nuevo."

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
            "¡Gracias! Tu cita ha sido agendada.\n"
            f"- Cita #{int(appo.id)}\n"
            f"- Día/hora: {start.strftime('%Y-%m-%d %H:%M')}\n"
            "(Este salón aún no tiene activado el depósito online; la reserva queda sin pago por la app.)\n"
            "Si quieres otra cita, escribe CITA."
        )

    # Fallback
    state["step"] = "idle"
    _save_state(db, conv, state)
    return "No te he entendido. Escribe OPCIONES, MENU o AYUDA para ver el menú."

