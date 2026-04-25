import json
import re
import unicodedata
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
    return db.exec(select(Service).where(Service.organization_id == org_id)).all()


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

    dow = day.weekday()  # Mon=0 .. Sun=6
    open_t = time(9, 0)
    close_t = time(20, 0)
    is_open = True
    raw = (getattr(org, "salon_hours_json", None) or "").strip()
    if raw:
        try:
            days = json.loads(raw)
            row = next((d for d in days if int(d.get("day_of_week", -1)) == dow), None)
            if row:
                is_open = bool(row.get("is_open", True))
                if is_open:
                    oh, om = [int(x) for x in str(row.get("open_time", "09:00")).split(":")]
                    ch, cm = [int(x) for x in str(row.get("close_time", "20:00")).split(":")]
                    open_t = time(oh, om)
                    close_t = time(ch, cm)
        except Exception:
            pass
    if not is_open:
        return []

    # IMPORTANT: Appointment.start_time is stored as naive local time in DB (timestamp without tz).
    # If we pass tz-aware datetimes, Postgres will convert to UTC and we end up with a 2h shift.
    day_open = datetime.combine(day, open_t)
    day_close = datetime.combine(day, close_t)
    now_local = datetime.now(TZ).replace(tzinfo=None)
    min_start = now_local + timedelta(minutes=min_notice_minutes)
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

    dow = day.weekday()
    open_t = time(9, 0)
    close_t = time(20, 0)
    is_open = True
    raw = (getattr(org, "salon_hours_json", None) or "").strip()
    if raw:
        try:
            days = json.loads(raw)
            row = next((d for d in days if int(d.get("day_of_week", -1)) == dow), None)
            if row:
                is_open = bool(row.get("is_open", True))
                if is_open:
                    oh, om = [int(x) for x in str(row.get("open_time", "09:00")).split(":")]
                    ch, cm = [int(x) for x in str(row.get("close_time", "20:00")).split(":")]
                    open_t = time(oh, om)
                    close_t = time(ch, cm)
        except Exception:
            pass
    if not is_open:
        return []

    day_open = datetime.combine(day, open_t)
    day_close = datetime.combine(day, close_t)
    requested = datetime.combine(day, preferred)

    now_local = datetime.now(TZ).replace(tzinfo=None)
    min_start = now_local + timedelta(minutes=min_notice_minutes)
    if requested < min_start:
        requested = min_start

    staff_ids = _staff_ids_for_org(db, org_id)

    def fits(start_dt: datetime) -> tuple[datetime, int] | None:
        end_dt = start_dt + timedelta(minutes=minutes)
        if start_dt < day_open or end_dt > day_close:
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

    # 2) Nearest alternatives around exact
    out: list[tuple[datetime, int]] = []
    for delta_steps in range(1, 16):  # search up to ~4h each side (15m * 16)
        for sign in (-1, 1):
            cand = exact + timedelta(minutes=sign * delta_steps * step)
            h = fits(cand)
            if h:
                out.append(h)
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
        return "Listo. Empezamos de cero. Escribe CITA para reservar o SERVICIOS para ver el catálogo."

    if txt_upper in ("CAMBIAR FECHA", "FECHA", "OTRO DIA", "OTRO DÍA"):
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        if not service_ids:
            return "Primero dime qué quieres reservar: escribe CITA."
        state["step"] = "awaiting_date"
        _save_state(db, conv, state)
        return "Perfecto. Dime la fecha (YYYY-MM-DD)."

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
        d = _parse_date_yyyy_mm_dd(txt)
        if not d:
            return "Formato de fecha inválido. Ejemplo: 2026-04-30"
        # If the user previously sent "hoy/mañana" in a natural message, we keep it but
        # still require an explicit YYYY-MM-DD to avoid misunderstandings.
        service_ids = [int(x) for x in (state.get("service_ids") or [])]
        pref = (state.get("preferred_time") or "").strip()
        pref_t = _parse_time_hhmm_es(pref) if pref else None
        if pref_t:
            slots = _compute_slots_near_preferred_time(
                db,
                org_id=int(org.id),
                org=org,
                service_ids=service_ids,
                day=d,
                preferred=pref_t,
            )
            # If exact time was available we might get 1; fill up to 3 with general slots after it
            if len(slots) < 3:
                more = _compute_slots(db, org_id=int(org.id), org=org, service_ids=service_ids, day=d)
                for s in more:
                    if s not in slots:
                        slots.append(s)
                    if len(slots) >= 3:
                        break
        else:
            slots = _compute_slots(db, org_id=int(org.id), org=org, service_ids=service_ids, day=d)
        if not slots:
            return "No encuentro huecos ese día dentro del horario del salón. Prueba con otra fecha (YYYY-MM-DD)."
        # store options
        options = []
        for s, staff_id in slots:
            options.append({"start": s.isoformat(), "staff_id": int(staff_id)})
        state["step"] = "awaiting_slot_choice"
        state["slot_options"] = options
        state["slot_day"] = d.isoformat()
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
            "Si quieres otra cita, escribe CITA."
        )

    # Fallback
    state["step"] = "idle"
    _save_state(db, conv, state)
    return "No te he entendido. Escribe AYUDA para ver opciones."

