"""
Elimina un usuario (y toda su organización: citas, servicios, clientes, horarios) por email.

Uso (desde la raíz del repo):
  python -m scripts.purge_user_by_email davidisraelmunozsalinas@gmail.com

Requiere la misma configuración de BD que la API (.env, POSTGRES_* o DATABASE_URL).
"""
from __future__ import annotations

import sys

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "beautytask_password")
POSTGRES_SERVER = os.getenv("POSTGRES_SERVER", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "beautytask_db")
_DATABASE_URL = os.getenv("DATABASE_URL")
if not _DATABASE_URL:
    _DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}"
if _DATABASE_URL.startswith("postgres://"):
    _DATABASE_URL = _DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(_DATABASE_URL, echo=False)


def _rfirst(conn, stmt: str, params: dict):
    r = conn.execute(text(stmt), params)
    return r.mappings().first()


def _has_table(conn, table_name: str) -> bool:
    r = conn.execute(
        text(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :n
            """
        ),
        {"n": table_name},
    ).fetchone()
    return r is not None


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.purge_user_by_email <email>", file=sys.stderr)
        raise SystemExit(1)
    email = sys.argv[1].strip().lower()

    with engine.begin() as conn:
        u = _rfirst(
            conn,
            'SELECT id, organization_id, email FROM "user" WHERE lower(email) = :e',
            {"e": email},
        )
        if not u:
            print(f"No hay usuario con email: {email}")
            return
        uid = int(u["id"])
        org_id = u["organization_id"]
        print(f"Usuario id={uid} email={u['email']!r} organization_id={org_id!r}")

        if org_id is None:
            conn.execute(
                text("DELETE FROM pending_registration WHERE lower(email) = :e"),
                {"e": email},
            )
            conn.execute(text('DELETE FROM "user" WHERE id = :i'), {"i": uid})
            print("Usuario sin organización: eliminado.")
            return

        org_id = int(org_id)
        rows = conn.execute(
            text('SELECT id FROM "user" WHERE organization_id = :o'),
            {"o": org_id},
        ).fetchall()
        id_list = [int(r[0]) for r in rows] if rows else [uid]
        if uid not in id_list:
            id_list.append(uid)
        id_list = sorted(set(id_list))
        print(f"IDs usuario(s) a borrar: {id_list} | org {org_id}")

        conn.execute(
            text("DELETE FROM appointment WHERE organization_id = :o"), {"o": org_id}
        )
        if _has_table(conn, "staffschedule"):
            for sid in id_list:
                conn.execute(
                    text("DELETE FROM staffschedule WHERE staff_id = :s"), {"s": sid}
                )
        conn.execute(
            text("DELETE FROM service WHERE organization_id = :o"), {"o": org_id}
        )
        conn.execute(
            text("DELETE FROM client WHERE organization_id = :o"), {"o": org_id}
        )
        conn.execute(
            text("DELETE FROM pending_registration WHERE lower(email) = :e"), {"e": email}
        )
        conn.execute(
            text("UPDATE organization SET owner_id = NULL WHERE id = :o"), {"o": org_id}
        )
        conn.execute(
            text('UPDATE "user" SET organization_id = NULL WHERE organization_id = :o'),
            {"o": org_id},
        )
        conn.execute(text("DELETE FROM organization WHERE id = :o"), {"o": org_id})
        for i in id_list:
            conn.execute(text('DELETE FROM "user" WHERE id = :i'), {"i": i})

    print(
        f"Listo. Eliminada organización {org_id} y {len(id_list)} usuario(s). "
        "Puedes volver a registrarte desde cero."
    )


if __name__ == "__main__":
    main()
