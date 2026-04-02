"""
Seed demo appointments for the current (or chosen) month: calendar density + revenue chart data.

Tagged with notes='SEED_DEMO' so you can remove them with --clear only.

Usage (from project root, venv + .env):
  python -m app.seed_demo_appointments
  python -m app.seed_demo_appointments --email you@example.com

With Docker:
  docker compose exec backend python -m app.seed_demo_appointments --email you@example.com

Other:
  python -m app.seed_demo_appointments --year 2026 --month 4
  python -m app.seed_demo_appointments --clear
"""

from __future__ import annotations

import argparse
import calendar
import random
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.core.db.session import engine
from app.models.appointment import Appointment
from app.models.service import Service
from app.models.user import User
from app.seed import seed_services

SEED_TAG = "SEED_DEMO"
SAMPLE_CLIENT_NAMES = [
    "Ana García",
    "Laura Martín",
    "Carmen Ruiz",
    "Elena Soto",
    "Patricia Vega",
    "Isabel Núñez",
    "Marta Gil",
    "Sara Ortega",
    "Lucía Ramos",
    "Nuria Campos",
]


def _clear_demo(session: Session) -> int:
    rows = session.exec(select(Appointment).where(Appointment.notes == SEED_TAG)).all()
    n = len(rows)
    for a in rows:
        session.delete(a)
    session.commit()
    return n


def _pick_staff(session: Session, email: str | None) -> User:
    if email:
        u = session.exec(select(User).where(User.email == email.lower())).first()
        if not u:
            raise SystemExit(f"No user found with email: {email}")
        return u
    u = session.exec(select(User).order_by(User.id)).first()
    if not u:
        raise SystemExit("No users in database. Create a user first.")
    return u


def _other_staff_ids(session: Session, exclude_id: int) -> list[int]:
    users = session.exec(select(User).where(User.id != exclude_id)).all()
    return [u.id for u in users[:3]]


def seed_demo_appointments(
    year: int,
    month: int,
    staff_email: str | None = None,
) -> None:
    seed_services()

    with Session(engine) as session:
        staff = _pick_staff(session, staff_email)
        other_ids = _other_staff_ids(session, staff.id)

        services = session.exec(select(Service).order_by(Service.id)).all()
        if not services:
            raise SystemExit("No services. Run seed_services or create services first.")

        _clear_demo(session)

        _, last_day = calendar.monthrange(year, month)
        rng = random.Random(42 + year * 100 + month)

        slots_per_day = [
            (9, 30),
            (11, 0),
            (12, 30),
            (15, 0),
            (16, 30),
            (18, 0),
            (19, 30),
        ]

        created = 0
        for day in range(1, last_day + 1):
            if day % 7 == 0:
                continue
            num_slots = rng.randint(2, min(5, len(slots_per_day)))
            chosen = rng.sample(slots_per_day, num_slots)

            for hour, minute in sorted(chosen):
                svc = rng.choice(services)
                start = datetime(year, month, day, hour, minute, 0)
                end = start + timedelta(minutes=svc.duration)

                is_completed = rng.random() < 0.55
                status = "completed" if is_completed else "scheduled"

                # Revenue stats filter by logged-in staff; completed rows always
                # attach to the seeded user so charts match after --email.
                if is_completed:
                    sid = staff.id
                    base = float(svc.price)
                    final_price = round(base * rng.uniform(0.85, 1.15), 2)
                    payment = "tarjeta" if rng.random() < 0.4 else "efectivo"
                else:
                    use_main_staff = rng.random() < 0.75
                    sid = (
                        staff.id
                        if use_main_staff
                        else (rng.choice(other_ids) if other_ids else staff.id)
                    )
                    final_price = 0.0
                    payment = "efectivo"

                name = rng.choice(SAMPLE_CLIENT_NAMES)

                appo = Appointment(
                    client_name=name,
                    client_phone=f"600{rng.randint(100000, 999999)}",
                    client_email=None,
                    start_time=start,
                    end_time=end,
                    status=status,
                    notes=SEED_TAG,
                    final_price=final_price,
                    payment_method=payment,
                    staff_id=sid,
                    service_id=svc.id,
                    organization_id=staff.organization_id,
                )
                session.add(appo)
                created += 1

        session.commit()
        print(
            f"✅ Created {created} demo appointments for {year}-{month:02d} "
            f"(staff focus: id={staff.id} {staff.email}). "
            f"Charts use completed appointments for the logged-in staff only."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo calendar / stats data")
    parser.add_argument("--email", help="Staff user email to attach most data to (charts)")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--month", type=int, default=None)
    parser.add_argument("--clear", action="store_true", help="Remove all SEED_DEMO appointments")
    args = parser.parse_args()

    now = datetime.now()
    year = args.year if args.year is not None else now.year
    month = args.month if args.month is not None else now.month

    if args.clear:
        with Session(engine) as session:
            n = _clear_demo(session)
            print(f"Removed {n} demo appointment(s).")
        return

    seed_demo_appointments(year, month, staff_email=args.email)


if __name__ == "__main__":
    main()
