import json
import os
import re
import unicodedata
from datetime import datetime, timedelta, date, time, timezone
from zoneinfo import ZoneInfo
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from app.models import Conversation, Organization, Service
from app.models import ServiceCategory
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
from app.services.deposit_booking import (
    DEPOSIT_PERCENT,
    book_with_deposit_checkout,
    org_accepts_online_deposit,
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


def _service_ids_int_list(state: dict) -> list[int]:
    """Parse state service_ids; skip invalid entries (avoids uncaught ValueError on corrupt JSON)."""
    out: list[int] = []
    for x in state.get("service_ids") or []:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            continue
    return out


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


def _list_categories_for_org(db: Session, org_id: int) -> list[ServiceCategory]:
    rows = db.exec(
        select(ServiceCategory).where(ServiceCategory.organization_id == org_id)
    ).all()
    rows.sort(key=lambda c: (int(c.sort_order or 0), (c.name or "").lower()))
    return rows


def _collect_category_menu_entries(
    db: Session, org_id: int, *, exclude_service_ids: set[int]
) -> list[dict]:
    """
    Each entry: {"cid": int category id, OR null for uncategorized, OR -1 for all-in-one bucket}.
    """
    services = [s for s in _list_services(db, org_id) if s.id is not None and int(s.id) not in exclude_service_ids]
    if not services:
        return []
    cats = _list_categories_for_org(db, org_id)
    cat_by_id = {int(c.id): c for c in cats if c.id is not None}
    cat_ids_in_use: set[int] = set()
    has_uncat = False
    for s in services:
        cid = getattr(s, "category_id", None)
        if cid is None or int(cid) not in cat_by_id:
            has_uncat = True
        else:
            cat_ids_in_use.add(int(cid))
    out: list[dict] = []
    for c in cats:
        if c.id is not None and int(c.id) in cat_ids_in_use:
            out.append({"cid": int(c.id), "name": (c.name or "Categoría").strip()})
    if has_uncat:
        out.append({"cid": None, "name": "Sin categoría"})
    if not out:
        out.append({"cid": -1, "name": "Todos los servicios"})
    return out


def _services_for_category_bucket(
    db: Session, org_id: int, *, bucket_cid: int | None, exclude_service_ids: set[int]
) -> list[Service]:
    services = [s for s in _list_services(db, org_id) if s.id is not None and int(s.id) not in exclude_service_ids]
    cats = _list_categories_for_org(db, org_id)
    cat_by_id = {int(c.id): c for c in cats if c.id is not None}
    if bucket_cid == -1:
        return services
    if bucket_cid is None:
        return [
            s
            for s in services
            if getattr(s, "category_id", None) is None
            or int(s.category_id) not in cat_by_id
        ]
    return [s for s in services if getattr(s, "category_id", None) is not None and int(s.category_id) == int(bucket_cid)]


def _format_category_page_message(entries: list[dict], offset: int, title: str) -> tuple[str, bool]:
    """
    Lists up to 9 categories plus optional 10) Ver más. Returns (message, used_more_slot).
    """
    rest = entries[offset:]
    lines = [title, ""]
    if len(rest) <= 10:
        for i, e in enumerate(rest, start=1):
            lines.append(f"{i}) {e['name']}")
        lines.append("")
        lines.append("Responde con el número de la categoría.")
        return "\n".join(lines), False
    page = rest[:9]
    for i, e in enumerate(page, start=1):
        lines.append(f"{i}) {e['name']}")
    lines.append("10) Ver más categorías…")
    lines.append("")
    lines.append("Responde con el número (1–10).")
    return "\n".join(lines), True


def _format_service_page_in_category(
    services: list[Service], offset: int, title: str
) -> tuple[str, bool]:
    rest = services[offset:]
    lines = [title, ""]
    if len(rest) <= 10:
        for i, s in enumerate(rest, start=1):
            meta: list[str] = []
            if getattr(s, "duration", None) is not None:
                meta.append(f"{int(s.duration)}min")
            if getattr(s, "price", None) is not None:
                meta.append(f"{float(s.price):g}€")
            suf = f" ({' · '.join(meta)})" if meta else ""
            lines.append(f"{i}) {s.name}{suf}")
        lines.append("")
        lines.append("Responde con el número del servicio.")
        return "\n".join(lines), False
    page = rest[:9]
    for i, s in enumerate(page, start=1):
        meta = []
        if getattr(s, "duration", None) is not None:
            meta.append(f"{int(s.duration)}min")
        if getattr(s, "price", None) is not None:
            meta.append(f"{float(s.price):g}€")
        suf = f" ({' · '.join(meta)})" if meta else ""
        lines.append(f"{i}) {s.name}{suf}")
    lines.append("10) Ver más servicios…")
    lines.append("")
    lines.append("Responde con el número (1–10).")
    return "\n".join(lines), True


def _day_has_any_slot(
    db: Session,
    org_id: int,
    org: Organization,
    day: date,
    service_ids: list[int],
    staff_id: int | None,
) -> bool:
    staff_i = int(staff_id) if staff_id is not None else None
    m = _slots_for_day_band(db, org_id, org, day, service_ids, staff_i, time(9, 0), time(13, 0), limit=1)
    if m:
        return True
    a = _slots_for_day_band(db, org_id, org, day, service_ids, staff_i, time(15, 0), time(19, 0), limit=1)
    return bool(a)


def _collect_next_available_days(
    db: Session,
    org_id: int,
    org: Organization,
    *,
    service_ids: list[int],
    staff_id: int | None,
    start_from: date,
    max_scan_days: int,
    want: int,
    skip: int,
) -> list[date]:
    """First `skip` matching days are skipped; then collect up to `want` days that have ≥1 slot."""
    if not service_ids:
        return []
    found: list[date] = []
    skip_left = int(skip)
    for i in range(max_scan_days):
        d = start_from + timedelta(days=i)
        if _org_is_closed_on_date(org, day=d):
            continue
        if not _day_has_any_slot(db, org_id, org, d, service_ids, staff_id):
            continue
        if skip_left > 0:
            skip_left -= 1
            continue
        found.append(d)
        if len(found) >= want:
            break
    return found


def _available_days_page(
    db: Session,
    org_id: int,
    org: Organization,
    *,
    service_ids: list[int],
    staff_id: int | None,
    start_from: date,
    skip: int,
    max_scan_days: int = 56,
) -> tuple[list[date], bool]:
    """Up to 10 days to show; has_more if an 11th exists after skip."""
    batch = _collect_next_available_days(
        db,
        org_id,
        org,
        service_ids=service_ids,
        staff_id=staff_id,
        start_from=start_from,
        max_scan_days=max_scan_days,
        want=11,
        skip=skip,
    )
    has_more = len(batch) > 10
    return batch[:10], has_more


def _format_day_row_es(d: date) -> str:
    wds = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
    mos = (
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    )
    return f"{wds[d.weekday()]} {d.day} de {mos[d.month - 1]} ({_format_date_dd_mm_yy(d)})"


def _day_pick_level1_text() -> str:
    today = datetime.now(TZ).date()
    tmr = today + timedelta(days=1)
    day_after = today + timedelta(days=2)
    return (
        "¿Qué día prefieres?\n\n"
        f"1) Hoy ({_format_date_dd_mm_yy(today)})\n"
        f"2) Mañana ({_format_date_dd_mm_yy(tmr)})\n"
        f"3) Pasado mañana ({_format_date_dd_mm_yy(day_after)})\n"
        "4) Otros días (lista con huecos; máx. 10 por pantalla)\n\n"
        "Responde con 1, 2, 3 o 4."
    )


def _first_day_for_alternatives_list(today: date) -> date:
    """Primer día que puede salir en la lista de 'Otros días' (sin repetir 1–3 del nivel 1)."""
    return today + timedelta(days=3)


def _day_alternatives_message(
    days: list[date], *, has_more: bool, start_index: int = 1
) -> str:
    lines = [
        "Otros días con hueco (no aparecen aquí hoy, mañana ni pasado mañana):",
        "",
    ]
    n = start_index
    for d in days:
        lines.append(f"{n}) {_format_day_row_es(d)}")
        n += 1
    if has_more:
        lines.append(f"{n}) Ver más días…")
        n += 1
    lines.append(f"{n}) Escribir fecha manualmente (DD-MM-YY o AAAA-MM-DD)")
    lines.append("")
    lines.append("Responde solo con el número.")
    return "\n".join(lines)


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
    """Leading integer only (handles '1)', '1.', Twilio quirks)."""
    raw = (txt or "").strip()
    if not raw:
        return None
    m = re.match(r"^(\d+)", raw)
    if not m:
        return None
    try:
        n = int(m.group(1))
    except ValueError:
        return None
    if n < 1 or n > max_n:
        return None
    return n


def _format_date_dd_mm_yy(d: date) -> str:
    """Spanish-style calendar date (2-digit year)."""
    return d.strftime("%d-%m-%y")


def _parse_date_yyyy_mm_dd(txt: str) -> date | None:
    raw = (txt or "").strip()
    try:
        return date.fromisoformat(raw)
    except Exception:
        return None


def _parse_date_dd_mm_yy(txt: str) -> date | None:
    raw = (txt or "").strip()
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$", raw)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def _parse_date_flexible(txt: str) -> date | None:
    return _parse_date_yyyy_mm_dd(txt) or _parse_date_dd_mm_yy(txt) or _parse_relative_date_es(txt)


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


def _public_booking_line(org: Organization) -> str | None:
    tok = getattr(org, "booking_public_token", None)
    if not tok or not str(tok).strip():
        return None
    base = (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
    return f"{base}/reservar?token={quote(str(tok).strip(), safe='')}"


def _wake_intro_text(org: Organization) -> str:
    return (
        f"Hola, soy el asistente personal de {org.name}. "
        "Aquí podrás obtener información sobre los servicios que ofrecemos y la disponibilidad "
        "de horario en nuestra agenda. También podrás hacer tu reserva o cancelarla en caso de "
        "haber sufrido algún inconveniente. ¿En qué te puedo ayudar?"
    )


def _root_menu_text() -> str:
    return "\n".join(
        [
            "Pulsa una de las siguientes opciones (elige el número o escribe el nombre de la opción):",
            "",
            "1) Reservar una cita",
            "2) Cancelar una cita",
            "3) Mis citas",
            "4) Ubicación y horario",
            "5) Volver a comenzar",
            "",
            "Responde con el número de la opción (o Sí/No cuando te lo pidamos).",
        ]
    )


def _wake_messages(org: Organization) -> list[str]:
    return [_wake_intro_text(org), _root_menu_text()]


def _try_cancel_last_appointment(db: Session, org: Organization, from_addr: str) -> str:
    """Shared by CANCELAR and main-menu option 2."""
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
    now_utc = datetime.now(timezone.utc)
    appo = db.exec(
        select(Appointment)
        .where(
            Appointment.organization_id == org.id,
            Appointment.client_id == int(client.id),
            Appointment.start_time >= now_local,
            or_(
                Appointment.status == "scheduled",
                and_(
                    Appointment.status == "pending_deposit",
                    Appointment.deposit_expires_at.is_not(None),
                    Appointment.deposit_expires_at > now_utc,
                ),
            ),
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


def _staff_by_id(db: Session, org_id: int, staff_id: int) -> User | None:
    for u in _list_staff_for_org(db, org_id):
        if int(u.id or 0) == int(staff_id):
            return u
    return None


def _format_staff_menu(staff: list[User]) -> tuple[str, list[dict]]:
    cache: list[dict] = []
    lines: list[str] = []
    for idx, u in enumerate(staff[:10], start=1):
        if u.id is None:
            continue
        cache.append({"id": int(u.id), "name": _staff_display_name(u)})
        lines.append(f"{idx}) {cache[-1]['name']}")
    extra = ""
    if len(staff) > 10:
        extra = "\n\n(Hay más profesionales en el salón; solo mostramos 10. Llama al salón si no ves a alguien.)"
    return "¿Con quién te gustaría la cita? Responde con el número:\n" + "\n".join(lines) + extra, cache


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


_SPANISH_WEEKDAYS = (
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
    "domingo",
)
_SPANISH_MONTHS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def _format_slot_confirm_es(dt: datetime) -> str:
    d = dt.date()
    wd = _SPANISH_WEEKDAYS[d.weekday()]
    mo = _SPANISH_MONTHS[d.month - 1]
    return f"{wd} {_format_date_dd_mm_yy(d)} ({d.day} de {mo}) a las {dt.strftime('%H:%M')}"


def _day_segments_clipped(
    org: Organization,
    day: date,
    band_lo: time,
    band_hi: time,
) -> list[tuple[datetime, datetime]]:
    """Intersect salon windows with [band_lo, band_hi] on that calendar day (naive local)."""
    out: list[tuple[datetime, datetime]] = []
    b0 = datetime.combine(day, band_lo)
    b1 = datetime.combine(day, band_hi)
    for open_t, close_t in _org_open_windows_for_day(org, dow=day.weekday()):
        w0 = datetime.combine(day, open_t)
        w1 = datetime.combine(day, close_t)
        cs = max(w0, b0)
        ce = min(w1, b1)
        if cs < ce:
            out.append((cs, ce))
    return out


def _round_up_to_slot_step(dt: datetime, step_minutes: int) -> datetime:
    d0 = datetime.combine(dt.date(), time(0))
    elapsed = int((dt - d0).total_seconds() // 60)
    rem = elapsed % step_minutes
    base = dt.replace(second=0, microsecond=0)
    if rem == 0:
        return base
    return base + timedelta(minutes=step_minutes - rem)


def _slots_for_day_band(
    db: Session,
    org_id: int,
    org: Organization,
    day: date,
    service_ids: list[int],
    staff_id: int | None,
    band_lo: time,
    band_hi: time,
    *,
    step_minutes: int = 30,
    min_notice_minutes: int = 30,
    limit: int = 48,
) -> list[dict]:
    if _org_is_closed_on_date(org, day=day):
        return []
    try:
        minutes = _total_minutes(_services_for_org(db, org_id, service_ids))
    except HTTPException:
        return []
    if minutes <= 0:
        return []
    segments = _day_segments_clipped(org, day, band_lo, band_hi)
    if not segments:
        return []
    now_local = _local_now_naive()
    min_start = now_local + timedelta(minutes=min_notice_minutes)
    staff_order = [int(staff_id)] if staff_id is not None else _staff_ids_for_org(db, org_id)
    if not staff_order:
        return []
    out: list[dict] = []
    step = max(5, int(step_minutes))
    for cs, ce in segments:
        cursor = max(cs, min_start)
        if cursor >= ce:
            continue
        cursor = _round_up_to_slot_step(cursor, step)
        while cursor + timedelta(minutes=minutes) <= ce:
            end_dt = cursor + timedelta(minutes=minutes)
            chosen: int | None = None
            if staff_id is not None:
                if not _has_collision(db, org_id, int(staff_id), cursor, end_dt):
                    chosen = int(staff_id)
            else:
                for sid in staff_order:
                    if not _has_collision(db, org_id, sid, cursor, end_dt):
                        chosen = sid
                        break
            if chosen is not None:
                out.append({"start": cursor.isoformat(timespec="minutes"), "staff_id": int(chosen)})
                if len(out) >= limit:
                    return out
            cursor += timedelta(minutes=step)
    return out


def _parse_root_menu_choice(txt: str) -> int | None:
    raw = (txt or "").strip()
    if not raw:
        return None
    n = _parse_choice_number(raw, 5)
    if n:
        return n
    low = _strip_accents(raw.lower())
    if "reservar" in low:
        return 1
    if "cancelar" in low:
        return 2
    if "mis cita" in low:
        return 3
    if "ubicacion" in low or "horario" in low:
        return 4
    if "volver" in low or "comenzar" in low:
        return 5
    return None


def _location_hours_text(org: Organization) -> str:
    lines: list[str] = ["Ubicación y horario", ""]
    a1 = (getattr(org, "billing_address_line1", None) or "").strip()
    city = (getattr(org, "city", None) or "").strip()
    pc = (getattr(org, "postal_code", None) or "").strip()
    addr = ", ".join(x for x in (a1, pc, city) if x)
    if addr:
        lines.append(f"Dirección: {addr}")
    else:
        lines.append("Dirección: no publicada en la app.")
    ph = (getattr(org, "billing_phone", None) or "").strip()
    em = (getattr(org, "billing_email", None) or "").strip()
    if ph:
        lines.append(f"Teléfono: {ph}")
    if em:
        lines.append(f"Email: {em}")
    pub = _public_booking_line(org)
    if pub:
        lines.append("")
        lines.append(f"Reserva online: {pub}")
    raw = (getattr(org, "salon_hours_json", None) or "").strip()
    lines.append("")
    if raw:
        lines.append("Horario del salón está configurado en la app (varía por día). Puedes reservar por web o seguir aquí con la opción 1.")
    else:
        lines.append("Horario: consulta por teléfono o email si no aparece en la web.")
    lines.append("")
    lines.append("Elige otra opción (1–5) o escribe MENÚ.")
    return "\n".join(lines)


def _mis_citas_text(db: Session, org: Organization, from_addr: str) -> str:
    phone_digits = _norm_phone_es(_digits_only(from_addr))
    if not phone_digits:
        return "No puedo leer tu número. Escribe desde el mismo WhatsApp con el que reservaste."
    client = db.exec(
        select(Client).where(
            Client.organization_id == org.id,
            Client.telefono == phone_digits,
        )
    ).first()
    if not client or client.id is None:
        return "No hay citas asociadas a este número.\n\nElige otra opción (1–5)."
    now_local = _local_now_naive()
    now_utc = datetime.now(timezone.utc)
    rows = db.exec(
        select(Appointment)
        .where(
            Appointment.organization_id == org.id,
            Appointment.client_id == int(client.id),
            Appointment.start_time >= now_local,
            or_(
                Appointment.status == "scheduled",
                and_(
                    Appointment.status == "pending_deposit",
                    Appointment.deposit_expires_at.is_not(None),
                    Appointment.deposit_expires_at > now_utc,
                ),
            ),
        )
        .order_by(Appointment.start_time.asc())
    ).all()
    if not rows:
        return "No tienes citas futuras registradas con este número.\n\nElige otra opción (1–5)."
    lines = ["Tus próximas citas:", ""]
    for a in rows[:8]:
        st = a.start_time
        if st is None:
            continue
        stn = st.replace(tzinfo=None) if getattr(st, "tzinfo", None) else st
        st_label = _format_slot_confirm_es(stn)
        st_txt = "pendiente de pago" if (a.status or "") == "pending_deposit" else (a.status or "")
        lines.append(f"- {st_label} — {st_txt}")
    lines.append("")
    lines.append("Elige otra opción (1–5) o escribe MENÚ.")
    return "\n".join(lines)


def _known_steps() -> frozenset[str]:
    return frozenset(
        {
            "idle",
            "awaiting_main_menu",
            "book_ask_specific_staff",
            "book_await_staff_pick",
            "book_await_service_category",
            "book_await_service_pick",
            "book_await_more_services",
            "book_await_day_pick",
            "book_await_day_alternatives",
            "book_await_custom_date",
            "book_await_day_period",
            "book_await_slot_pick",
            "book_await_final_confirm",
            "book_await_fix_choice",
        }
    )


def _enter_service_category_step(
    db: Session,
    conv: Conversation,
    org: Organization,
    state: dict,
    *,
    intro: str,
    adding_extra: bool,
) -> str:
    org_id = int(org.id)
    exclude = set(_service_ids_int_list(state)) if adding_extra else set()
    entries = _collect_category_menu_entries(db, org_id, exclude_service_ids=exclude)
    if not entries:
        state["step"] = "awaiting_main_menu" if not adding_extra else "book_await_more_services"
        _save_state(db, conv, state)
        if adding_extra:
            return "No hay más servicios para añadir en esta categorización. Responde NO si has terminado."
        return "No hay servicios activos.\n\n" + _root_menu_text()
    state["step"] = "book_await_service_category"
    state["adding_extra"] = bool(adding_extra)
    state["category_menu_entries"] = entries
    state["category_pick_offset"] = 0
    state.pop("service_pick_offset", None)
    state.pop("pick_category_cid", None)
    state.pop("services_cache", None)
    _save_state(db, conv, state)
    title = f"{intro}\n\n¿Qué tipo de servicio buscas?" if intro else "¿Qué tipo de servicio buscas?"
    msg, _ = _format_category_page_message(entries, 0, title)
    return msg


def _format_slot_choice_message(slots: list[dict], day: date) -> str:
    lines = [
        f"Horas libres el {_format_date_dd_mm_yy(day)} (cada 30 min; duración y agenda ya aplicadas):",
        "",
    ]
    shown = slots[:20]
    for i, opt in enumerate(shown, start=1):
        dt = datetime.fromisoformat(str(opt["start"]))
        lines.append(f"{i}) {dt.strftime('%H:%M')}")
    n = len(shown)
    lines.append(f"{n + 1}) Cambiar de día (volver a elegir la fecha)")
    lines.append(f"{n + 2}) Menú principal del salón")
    lines.append("")
    lines.append(f"Responde con un número del 1 al {n + 2}.")
    return "\n".join(lines)


def _advance_to_period_step(
    db: Session,
    conv: Conversation,
    org: Organization,
    state: dict,
    day: date,
) -> str:
    org_id = int(org.id)
    service_ids = _service_ids_int_list(state)
    staff_id = state.get("staff_id")
    staff_id_i = int(staff_id) if staff_id is not None else None
    m_slots = _slots_for_day_band(
        db, org_id, org, day, service_ids, staff_id_i, time(9, 0), time(13, 0)
    )
    a_slots = _slots_for_day_band(
        db, org_id, org, day, service_ids, staff_id_i, time(15, 0), time(19, 0)
    )
    state["pick_day"] = day.isoformat()
    state.pop("slot_options", None)
    if not m_slots and not a_slots:
        state["step"] = "book_await_day_pick"
        _save_state(db, conv, state)
        return (
            "No hay huecos libres ese día con la duración total de tu reserva. "
            "Prueba otro día.\n\n" + _day_pick_level1_text()
        )
    if m_slots and not a_slots:
        pick = m_slots[:20]
        state["step"] = "book_await_slot_pick"
        state["slot_options"] = pick
        _save_state(db, conv, state)
        return _format_slot_choice_message(pick, day)
    if a_slots and not m_slots:
        pick = a_slots[:20]
        state["step"] = "book_await_slot_pick"
        state["slot_options"] = pick
        _save_state(db, conv, state)
        return _format_slot_choice_message(pick, day)
    po: dict[str, list[dict]] = {"1": m_slots, "2": a_slots}
    state["period_options"] = po
    state["step"] = "book_await_day_period"
    _save_state(db, conv, state)
    return "\n".join(
        [
            "Perfecto. ¿En qué momento del día prefieres?",
            "",
            "1) Mañana (9:00–13:00)",
            "2) Tarde (15:00–19:00)",
            "",
            "Responde con 1 o 2.",
        ]
    )


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
) -> str | list[str]:
    """
    Loads conversation state, runs the state machine, persists state.
    Returns one string or several (separate WhatsApp bubbles via TwiML).
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
    step = str(state.get("step") or "idle")

    if step not in _known_steps():
        state = {"step": "idle"}
        _save_state(db, conv, state)
        step = "idle"

    org_id = int(org.id)

    if txt_upper in ("RESET", "REINICIAR"):
        state = {"step": "awaiting_main_menu"}
        _save_state(db, conv, state)
        return _wake_messages(org)

    if txt_upper in ("MENU", "MENÚ", "OPCIONES", "AYUDA", "HELP", "START"):
        state["step"] = "awaiting_main_menu"
        _save_state(db, conv, state)
        return _root_menu_text()

    if txt_upper in ("CANCELAR", "CANCEL", "ANULAR"):
        msg = _try_cancel_last_appointment(db, org, from_addr)
        state = {"step": "awaiting_main_menu"}
        _save_state(db, conv, state)
        return msg + "\n\n" + _root_menu_text()

    if txt_upper.startswith("SERVICIOS"):
        services = _list_services(db, org_id)
        if not services:
            return "Aún no hay servicios configurados."
        parts = txt.split(maxsplit=1)
        if len(parts) == 2 and parts[1].strip():
            filtered = _filter_services_by_keyword(services, parts[1])
            if not filtered:
                return "No encuentro servicios con esa palabra. Elige 1 en el menú para reservar."
            return (
                "Servicios encontrados:\n"
                + "\n".join(f"- {s.name}" for s in filtered[:30])
                + "\n\nVuelve al menú con MENÚ y pulsa 1 para reservar."
            )
        return (
            "Servicios disponibles:\n"
            + "\n".join(f"- {s.name}" for s in services[:30])
            + "\n\nVuelve al menú con MENÚ y pulsa 1 para reservar."
        )

    if txt_upper == "CITA":
        state = {
            "step": "book_ask_specific_staff",
            "service_ids": [],
            "staff_id": None,
            "staff_pick_required": None,
        }
        _save_state(db, conv, state)
        return (
            "Nos alegra que cuentes con nosotras/os. "
            "¿Te gustaría reservar con alguno/a de nuestros/as profesionales en concreto?\n\n"
            "Responde: SÍ o NO"
        )

    if step == "idle":
        state = {"step": "awaiting_main_menu"}
        _save_state(db, conv, state)
        return _wake_messages(org)

    if step == "awaiting_main_menu":
        choice = _parse_root_menu_choice(txt)
        if not choice:
            return (
                "No te he entendido. Responde con un número del 1 al 5 o escribe MENÚ.\n\n" + _root_menu_text()
            )
        if choice == 1:
            state = {
                "step": "book_ask_specific_staff",
                "service_ids": [],
                "staff_id": None,
                "staff_pick_required": None,
            }
            _save_state(db, conv, state)
            return (
                "Nos alegra que cuentes con nosotras/os. "
                "¿Te gustaría reservar con alguno/a de nuestros/as profesionales en concreto?\n\n"
                "Responde: SÍ o NO"
            )
        if choice == 2:
            msg = _try_cancel_last_appointment(db, org, from_addr)
            state = {"step": "awaiting_main_menu"}
            _save_state(db, conv, state)
            return msg + "\n\n" + _root_menu_text()
        if choice == 3:
            msg = _mis_citas_text(db, org, from_addr)
            state = {"step": "awaiting_main_menu"}
            _save_state(db, conv, state)
            return msg
        if choice == 4:
            msg = _location_hours_text(org)
            state = {"step": "awaiting_main_menu"}
            _save_state(db, conv, state)
            return msg
        state = {"step": "awaiting_main_menu"}
        _save_state(db, conv, state)
        return _wake_messages(org)

    if step == "book_ask_specific_staff":
        yn = _parse_yes_no(txt)
        if yn is None:
            return "Responde solo: SÍ o NO. (También puedes escribir RESET para volver al inicio.)"
        staff_list = _list_staff_for_org(db, org_id)
        if not staff_list:
            state = {"step": "awaiting_main_menu"}
            _save_state(db, conv, state)
            return "No hay profesionales configurados en el salón.\n\n" + _root_menu_text()
        if yn is False:
            state["staff_pick_required"] = False
            state["staff_id"] = None
            services = _list_services(db, org_id)
            if not services:
                state = {"step": "awaiting_main_menu"}
                _save_state(db, conv, state)
                return "No hay servicios activos.\n\n" + _root_menu_text()
            _save_state(db, conv, state)
            return _enter_service_category_step(
                db, conv, org, state, intro="¿Qué servicio te gustaría reservar?", adding_extra=False
            )
        state["staff_pick_required"] = True
        state["step"] = "book_await_staff_pick"
        _, cache = _format_staff_menu(staff_list)
        state["staff_cache"] = cache
        _save_state(db, conv, state)
        body_menu = "\n".join(f"{i}) {c['name']}" for i, c in enumerate(cache, start=1))
        return "Selecciona un profesional respondiendo con el número:\n\n" + body_menu

    if step == "book_await_staff_pick":
        cache = state.get("staff_cache") or []
        sid = _parse_staff_choice(txt, cache)
        if not sid:
            return "Responde con el número del profesional (1, 2, …)."
        state["staff_id"] = int(sid)
        services = _list_services(db, org_id)
        if not services:
            state = {"step": "awaiting_main_menu"}
            _save_state(db, conv, state)
            return "No hay servicios activos.\n\n" + _root_menu_text()
        stf_u = _staff_by_id(db, org_id, int(sid))
        nm = _staff_display_name(stf_u) if stf_u else "el profesional elegido"
        _save_state(db, conv, state)
        return _enter_service_category_step(
            db,
            conv,
            org,
            state,
            intro=f"¿Qué servicio te gustaría reservar con {nm}?",
            adding_extra=False,
        )

    if step == "book_await_service_category":
        entries: list[dict] = state.get("category_menu_entries") or []
        offset = int(state.get("category_pick_offset") or 0)
        if not entries:
            state["step"] = "awaiting_main_menu"
            _save_state(db, conv, state)
            return "Se ha perdido el menú de categorías. Escribe MENÚ.\n\n" + _root_menu_text()
        rest = entries[offset:]
        if not rest:
            state["category_pick_offset"] = 0
            offset = 0
            rest = entries
        if len(rest) <= 10:
            mx = len(rest)
        else:
            mx = 10
        ch = _parse_choice_number(txt, mx)
        if not ch:
            return "Responde con el número de una de las categorías de la lista."
        if len(rest) > 10 and ch == 10:
            state["category_pick_offset"] = offset + 9
            _save_state(db, conv, state)
            title = "¿Qué tipo de servicio buscas?"
            msg, _ = _format_category_page_message(entries, offset + 9, title)
            return msg
        picked = rest[ch - 1]
        cid = picked.get("cid")
        state["pick_category_cid"] = cid
        state["service_pick_offset"] = 0
        state["step"] = "book_await_service_pick"
        exclude = set(_service_ids_int_list(state)) if state.get("adding_extra") else set()
        svc_list = _services_for_category_bucket(db, org_id, bucket_cid=cid, exclude_service_ids=exclude)
        if not svc_list:
            state["step"] = "book_await_service_category"
            state.pop("pick_category_cid", None)
            state["category_pick_offset"] = 0
            _save_state(db, conv, state)
            ent2 = state.get("category_menu_entries") or []
            msg2, _ = _format_category_page_message(ent2, 0, "¿Qué tipo de servicio buscas?")
            return "No hay servicios en esa categoría.\n\n" + msg2
        _save_state(db, conv, state)
        title = f"Servicios — {picked.get('name', 'Categoría')}"
        msg, _ = _format_service_page_in_category(svc_list, 0, title)
        return msg

    if step == "book_await_service_pick":
        cid = state.get("pick_category_cid")
        exclude = set(_service_ids_int_list(state)) if state.get("adding_extra") else set()
        svc_list = _services_for_category_bucket(db, org_id, bucket_cid=cid, exclude_service_ids=exclude)
        offset = int(state.get("service_pick_offset") or 0)
        rest = svc_list[offset:]
        if not rest:
            state["step"] = "book_await_service_category"
            state.pop("pick_category_cid", None)
            _save_state(db, conv, state)
            return "No quedan servicios aquí. Vuelve a elegir categoría (responde MENÚ si te pierdes)."
        if len(rest) <= 10:
            mx = len(rest)
        else:
            mx = 10
        ch = _parse_choice_number(txt, mx)
        if not ch:
            return "Responde con el número del servicio de la lista."
        if len(rest) > 10 and ch == 10:
            state["service_pick_offset"] = offset + 9
            _save_state(db, conv, state)
            title = f"Servicios — más opciones"
            msg, _ = _format_service_page_in_category(svc_list, offset + 9, title)
            return msg
        svc = rest[ch - 1]
        if svc.id is None:
            return "Servicio inválido."
        sid_new = int(svc.id)
        adding = bool(state.get("adding_extra"))
        if adding:
            cur = list(_service_ids_int_list(state))
            if sid_new in cur:
                return "Ese servicio ya está en la cita. Elige otro."
            cur.append(sid_new)
            state["service_ids"] = cur
        else:
            state["service_ids"] = [sid_new]
        state["step"] = "book_await_more_services"
        state.pop("adding_extra", None)
        state.pop("pick_category_cid", None)
        state.pop("category_menu_entries", None)
        state.pop("category_pick_offset", None)
        state.pop("service_pick_offset", None)
        _save_state(db, conv, state)
        return (
            "¡Perfecto! ¿Te gustaría agendar algún otro servicio en la misma cita?\n\nResponde: SÍ o NO"
        )

    if step == "book_await_more_services":
        yn = _parse_yes_no(txt)
        if yn is None:
            return "Responde SÍ o NO."
        if yn is False:
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return _day_pick_level1_text()
        return _enter_service_category_step(
            db, conv, org, state, intro="Elige otro servicio para la misma cita.", adding_extra=True
        )

    if step == "book_await_day_pick":
        sids_chk = _service_ids_int_list(state)
        if not sids_chk:
            state["step"] = "awaiting_main_menu"
            _save_state(db, conv, state)
            return (
                "No hay servicios seleccionados para buscar día. "
                "Escribe MENÚ y vuelve a reservar desde la opción 1."
            )
        raw_u = txt.upper()
        today = datetime.now(TZ).date()
        chosen: date | None = None
        dch = _parse_choice_number(txt, 4)
        if dch == 1 or raw_u == "HOY":
            chosen = today
        elif dch == 2 or raw_u in ("MAÑANA", "MANANA"):
            chosen = today + timedelta(days=1)
        elif dch == 3 or "PASADO" in raw_u:
            chosen = today + timedelta(days=2)
        elif dch == 4 or "OTRO" in raw_u or "LISTA" in raw_u:
            try:
                service_ids = _service_ids_int_list(state)
                staff_id = state.get("staff_id")
                start_from = _first_day_for_alternatives_list(today)
                skip = 0
                days, has_more = _available_days_page(
                    db,
                    org_id,
                    org,
                    service_ids=service_ids,
                    staff_id=int(staff_id) if staff_id is not None else None,
                    start_from=start_from,
                    skip=skip,
                )
            except Exception:
                state["step"] = "book_await_day_pick"
                _save_state(db, conv, state)
                return (
                    "No pude generar la lista de días ahora mismo. "
                    "Prueba 1, 2 o 3, o escribe MENÚ. Si sigue fallando, elige fecha manual en la opción 4 otra vez."
                )
            if not days:
                state["step"] = "book_await_custom_date"
                _save_state(db, conv, state)
                return (
                    "No encontramos más días con huecos en la lista automática. "
                    "Escribe la fecha: DD-MM-YY o AAAA-MM-DD (ej: 27-04-26 o 2026-04-27)."
                )
            state["step"] = "book_await_day_alternatives"
            state["day_alt_skip"] = 0
            _save_state(db, conv, state)
            return _day_alternatives_message(days, has_more=has_more)
        if not chosen:
            return "Responde 1, 2, 3 o 4 según la lista anterior."
        try:
            return _advance_to_period_step(db, conv, org, state, chosen)
        except Exception:
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return (
                "Ha ocurrido un error al buscar huecos para ese día. "
                "Prueba otra fecha o escribe MENÚ.\n\n" + _day_pick_level1_text()
            )

    if step == "book_await_day_alternatives":
        service_ids = _service_ids_int_list(state)
        staff_id = state.get("staff_id")
        today = datetime.now(TZ).date()
        start_from = _first_day_for_alternatives_list(today)
        skip = int(state.get("day_alt_skip") or 0)
        try:
            days, has_more = _available_days_page(
                db,
                org_id,
                org,
                service_ids=service_ids,
                staff_id=int(staff_id) if staff_id is not None else None,
                start_from=start_from,
                skip=skip,
            )
        except Exception:
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return (
                "No pude cargar la lista de días. "
                "Prueba de nuevo con la opción 4 o escribe MENÚ.\n\n" + _day_pick_level1_text()
            )
        nd = len(days)
        if nd == 0 and not has_more:
            state["step"] = "book_await_custom_date"
            _save_state(db, conv, state)
            return (
                "No hay más días con huecos en la lista. "
                "Escribe la fecha: DD-MM-YY o AAAA-MM-DD (ej: 27-04-26 o 2026-04-27)."
            )
        manual_at = nd + (2 if has_more else 1)
        max_ch = manual_at
        ch = _parse_choice_number(txt, max_ch)
        if not ch:
            return f"Responde con un número del 1 al {max_ch}."
        if 1 <= ch <= nd:
            chosen = days[ch - 1]
            state.pop("day_alt_skip", None)
            _save_state(db, conv, state)
            try:
                return _advance_to_period_step(db, conv, org, state, chosen)
            except Exception:
                state["step"] = "book_await_day_pick"
                _save_state(db, conv, state)
                return (
                    "Ha ocurrido un error al buscar huecos para ese día. "
                    "Prueba otra fecha o escribe MENÚ.\n\n" + _day_pick_level1_text()
                )
        if has_more and ch == nd + 1:
            state["day_alt_skip"] = skip + nd
            _save_state(db, conv, state)
            try:
                days2, has_more2 = _available_days_page(
                    db,
                    org_id,
                    org,
                    service_ids=service_ids,
                    staff_id=int(staff_id) if staff_id is not None else None,
                    start_from=start_from,
                    skip=state["day_alt_skip"],
                )
            except Exception:
                state["step"] = "book_await_day_pick"
                _save_state(db, conv, state)
                return (
                    "No pude cargar más días. "
                    "Prueba la opción 4 de nuevo o escribe MENÚ.\n\n" + _day_pick_level1_text()
                )
            if not days2:
                state["step"] = "book_await_custom_date"
                _save_state(db, conv, state)
                return (
                    "No hay más días en la lista. "
                    "Escribe la fecha: DD-MM-YY o AAAA-MM-DD (ej: 27-04-26 o 2026-04-27)."
                )
            _save_state(db, conv, state)
            return _day_alternatives_message(days2, has_more=has_more2)
        if ch == manual_at:
            state["step"] = "book_await_custom_date"
            state.pop("day_alt_skip", None)
            _save_state(db, conv, state)
            return (
                "Escribe la fecha: DD-MM-YY o AAAA-MM-DD "
                "(ej: 27-04-26 o 2026-05-01). Para volver al menú principal, escribe MENÚ."
            )
        return f"Responde con un número del 1 al {max_ch}."

    if step == "book_await_custom_date":
        d = _parse_date_flexible(txt)
        if not d:
            return (
                "No reconozco esa fecha. Prueba DD-MM-YY (ej: 27-04-26) o AAAA-MM-DD (ej: 2026-04-27). "
                "También «hoy» o «mañana». O escribe MENÚ para salir."
            )
        try:
            return _advance_to_period_step(db, conv, org, state, d)
        except Exception:
            state["step"] = "book_await_custom_date"
            _save_state(db, conv, state)
            return "No pude aplicar esa fecha. Prueba otra o escribe MENÚ."

    if step == "book_await_day_period":
        po = state.get("period_options") or {}
        key = txt.strip()
        slots = po.get(key)
        if not slots:
            return "Responde 1 o 2 según la franja que prefieras."
        state["step"] = "book_await_slot_pick"
        state["slot_options"] = (slots or [])[:20]
        d_raw = (state.get("pick_day") or "").strip()
        try:
            d = date.fromisoformat(d_raw)
        except Exception:
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return "He perdido el día elegido.\n\n" + _day_pick_level1_text()
        _save_state(db, conv, state)
        return _format_slot_choice_message(state["slot_options"], d)

    if step == "book_await_slot_pick":
        options = state.get("slot_options") or []
        ns = len(options)
        if ns == 0:
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return "No hay horas en esta franja. Elige otro día.\n\n" + _day_pick_level1_text()
        max_ch = ns + 2
        choice = _parse_choice_number(txt, max_ch)
        if not choice:
            return f"Responde con un número del 1 al {max_ch} (hora, cambiar día o menú)."
        if choice == ns + 1:
            for k in ("slot_options", "period_options", "pick_day", "selected_slot", "day_alt_skip"):
                state.pop(k, None)
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return "De acuerdo, elijamos otra fecha.\n\n" + _day_pick_level1_text()
        if choice == ns + 2:
            state = {"step": "awaiting_main_menu"}
            _save_state(db, conv, state)
            return _root_menu_text()
        opt = options[choice - 1]
        start = datetime.fromisoformat(str(opt["start"]))
        staff_id = int(opt["staff_id"])
        service_ids = _service_ids_int_list(state)
        state["step"] = "book_await_final_confirm"
        state["selected_slot"] = {"start": opt["start"], "staff_id": staff_id}
        _save_state(db, conv, state)
        svcs = _services_for_org(db, org_id, service_ids)
        svc_names = ", ".join([s.name for s in svcs]) if svcs else "Servicio"
        human = _format_slot_confirm_es(start)
        return (
            "Entendido, la reserva se efectuará para el "
            f"{human}.\n"
            f"Servicio(s): {svc_names}.\n\n"
            "¿Es correcto?\n\n"
            "Responde: SÍ o NO"
        )

    if step == "book_await_final_confirm":
        yn = _parse_yes_no(txt)
        if yn is None:
            return "Responde SÍ o NO."
        if yn is False:
            state["step"] = "book_await_fix_choice"
            _save_state(db, conv, state)
            return (
                "¿Qué te gustaría cambiar?\n\n"
                "1) Profesional\n"
                "2) Servicio(s)\n"
                "3) Fecha y hora\n\n"
                "Responde con 1, 2 o 3."
            )
        selected = state.get("selected_slot") or {}
        if not selected.get("start") or not selected.get("staff_id"):
            state["step"] = "book_await_day_pick"
            _save_state(db, conv, state)
            return "He perdido la selección.\n\n" + _day_pick_level1_text()
        start = datetime.fromisoformat(str(selected["start"]))
        staff_id = int(selected["staff_id"])
        service_ids = _service_ids_int_list(state)

        phone_digits = _norm_phone_es(_digits_only(from_addr))
        if not phone_digits:
            state = {"step": "idle"}
            _save_state(db, conv, state)
            return "No puedo leer tu número de teléfono desde WhatsApp. Escribe de nuevo para reactivar el menú."

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
                state = {"step": "awaiting_main_menu"}
                _save_state(db, conv, state)
                pct = int(round(float(DEPOSIT_PERCENT) * 100))
                if not pay:
                    return (
                        "No se pudo generar el enlace de pago. Escribe MENÚ para intentarlo de nuevo "
                        "o contacta con el salón."
                    )
                return (
                    f"Para confirmar la reserva se solicita un depósito del {pct}% sobre el importe.\n"
                    "Completa el pago en este enlace (tarjeta o Bizum):\n"
                    f"{pay}\n\n"
                    "Cuando Stripe confirme el pago (webhook), la cita quedará registrada automáticamente. "
                    "Si no pagas a tiempo, el hueco se libera.\n\n"
                    f"Gracias por contar con {org.name}."
                )
            except HTTPException as e:
                d = e.detail if isinstance(e.detail, str) else str(e.detail)
                state = {"step": "awaiting_main_menu"}
                _save_state(db, conv, state)
                return f"No se pudo preparar el pago: {d}\n\n" + _root_menu_text()

        appo = _book_appointment(
            db,
            org=org,
            from_addr=from_addr,
            service_ids=service_ids,
            start_time=start,
            staff_id=staff_id,
        )
        state = {"step": "awaiting_main_menu"}
        _save_state(db, conv, state)
        human = _format_slot_confirm_es(start)
        return (
            f"Su reserva ha sido registrada con éxito para el {human}. "
            f"Gracias por contar con {org.name}.\n"
            f"(Cita #{int(appo.id)} — este salón no usa depósito online por la app.)"
        )

    if step == "book_await_fix_choice":
        raw = txt.strip()
        if raw not in ("1", "2", "3"):
            return "Responde con 1, 2 o 3."
        if raw == "1":
            state.pop("staff_id", None)
            state["step"] = "book_ask_specific_staff"
            state["staff_pick_required"] = None
            state.pop("selected_slot", None)
            state.pop("slot_options", None)
            state.pop("period_options", None)
            _save_state(db, conv, state)
            return (
                "De acuerdo. ¿Te gustaría reservar con alguno/a de nuestros/as profesionales en concreto?\n\n"
                "Responde: SÍ o NO"
            )
        if raw == "2":
            state["service_ids"] = []
            state.pop("selected_slot", None)
            state.pop("slot_options", None)
            state.pop("period_options", None)
            _save_state(db, conv, state)
            sid = state.get("staff_id")
            if sid:
                stf_u = _staff_by_id(db, org_id, int(sid))
                nm = _staff_display_name(stf_u) if stf_u else "el profesional elegido"
                intro = f"¿Qué servicio te gustaría reservar con {nm}?"
            else:
                intro = "¿Qué servicio te gustaría reservar?"
            return _enter_service_category_step(db, conv, org, state, intro=intro, adding_extra=False)
        state["step"] = "book_await_day_pick"
        state.pop("selected_slot", None)
        state.pop("slot_options", None)
        state.pop("period_options", None)
        state.pop("day_alt_skip", None)
        _save_state(db, conv, state)
        return "Vamos a cambiar fecha y hora.\n\n" + _day_pick_level1_text()

    state["step"] = "awaiting_main_menu"
    _save_state(db, conv, state)
    return "No te he entendido en este paso.\n\n" + _root_menu_text()

