# app/db/session.py
import os
from sqlmodel import create_engine, SQLModel, Session
from sqlalchemy import text
from dotenv import load_dotenv

# Forzamos la carga del archivo .env
load_dotenv()

# 1. PRIORIDAD: Intentamos leer la URL completa (la que configuramos en Render)
DATABASE_URL = os.getenv("DATABASE_URL")

# 2. Si NO existe DATABASE_URL (caso de tu local), la construimos por piezas
if not DATABASE_URL:
    POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "beautytask_password")
    POSTGRES_SERVER = os.getenv("POSTGRES_SERVER", "localhost") # "localhost" para desarrollo sin docker
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "beautytask_db")
    
    DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}"

# Imprime para depurar
print(f"DEBUG: Conectando a {DATABASE_URL}")

# IMPORTANTE: Para Render/Postgres estándar, a veces es necesario esto:
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, echo=False)


def _normalize_org_plan_payment_enums_to_varchar(conn) -> None:
    """
    Legacy DBs may have PostgreSQL native enums whose labels are Python member
    names (ESENCIAL, UNSPECIFIED). The app persists str Enum *values* (esencial,
    unspecified). Convert those columns to VARCHAR when still USER-DEFINED.
    """
    if conn.engine.dialect.name != "postgresql":
        return
    for column, default_sql in (
        ("subscription_plan", "'esencial'"),
        ("payment_method", "'unspecified'"),
    ):
        row = conn.execute(
            text(
                """
                SELECT data_type
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'organization'
                  AND column_name = :col
                """
            ),
            {"col": column},
        ).fetchone()
        if not row or row[0] != "USER-DEFINED":
            continue
        try:
            conn.execute(
                text(
                    f"ALTER TABLE organization ALTER COLUMN {column} DROP DEFAULT"
                )
            )
        except Exception:
            pass
        conn.execute(
            text(
                f"""
                ALTER TABLE organization
                ALTER COLUMN {column} TYPE VARCHAR(32)
                USING lower({column}::text)
                """
            )
        )
        conn.execute(
            text(
                f"ALTER TABLE organization ALTER COLUMN {column} "
                f"SET DEFAULT {default_sql}"
            )
        )


def _sync_postgres_serial_sequences(conn) -> None:
    """
    Realign SERIAL/IDENTITY sequences with MAX(id) after restores, manual SQL,
    or volume snapshots. Prevents duplicate key on organization_pkey / user_pkey, etc.
    """
    if conn.engine.dialect.name != "postgresql":
        return
    statements = [
        (
            "organization",
            'SELECT setval(pg_get_serial_sequence(\'organization\', \'id\'), COALESCE((SELECT MAX(id) FROM organization), 1), (SELECT MAX(id) FROM organization) IS NOT NULL)',
        ),
        (
            "user",
            'SELECT setval(pg_get_serial_sequence(\'public."user"\', \'id\'), COALESCE((SELECT MAX(id) FROM "user"), 1), (SELECT MAX(id) FROM "user") IS NOT NULL)',
        ),
        (
            "appointment",
            'SELECT setval(pg_get_serial_sequence(\'appointment\', \'id\'), COALESCE((SELECT MAX(id) FROM appointment), 1), (SELECT MAX(id) FROM appointment) IS NOT NULL)',
        ),
        (
            "service",
            'SELECT setval(pg_get_serial_sequence(\'service\', \'id\'), COALESCE((SELECT MAX(id) FROM service), 1), (SELECT MAX(id) FROM service) IS NOT NULL)',
        ),
        (
            "client",
            'SELECT setval(pg_get_serial_sequence(\'client\', \'id\'), COALESCE((SELECT MAX(id) FROM client), 1), (SELECT MAX(id) FROM client) IS NOT NULL)',
        ),
        (
            "pending_registration",
            'SELECT setval(pg_get_serial_sequence(\'pending_registration\', \'id\'), COALESCE((SELECT MAX(id) FROM pending_registration), 1), (SELECT MAX(id) FROM pending_registration) IS NOT NULL)',
        ),
    ]
    for label, sql in statements:
        try:
            conn.execute(text(sql))
        except Exception as e:
            print(f"⚠️ init_db: sequence sync skipped for {label}: {e}")


def init_db():
    # Importante: Importar modelos aquí para que SQLModel los reconozca
    from app import models
    SQLModel.metadata.create_all(engine)

    # Best-effort schema patching for legacy DBs (no Alembic here).
    # Ensures Google token columns exist even if the table was created before
    # the fields were added to the SQLModel.
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS google_access_token TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS google_refresh_token TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "appointment" ADD COLUMN IF NOT EXISTS organization_id INTEGER'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "appointment" ADD COLUMN IF NOT EXISTS additional_service_ids_json TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS integrations_access BOOLEAN DEFAULT TRUE'
                )
            )
            conn.execute(
                text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS phone TEXT')
            )
            conn.execute(
                text(
                    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE'
                )
            )
            conn.execute(
                text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS first_name TEXT')
            )
            conn.execute(
                text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_name TEXT')
            )
            conn.execute(
                text('ALTER TABLE "service" ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE')
            )
            for col, typ in (
                ("legal_name", "TEXT"),
                ("billing_address_line1", "TEXT"),
                ("billing_address_line2", "TEXT"),
                ("city", "TEXT"),
                ("postal_code", "TEXT"),
                ("province", "TEXT"),
                ("country", "TEXT"),
                ("tax_id", "TEXT"),
                ("billing_phone", "TEXT"),
                ("billing_email", "TEXT"),
            ):
                conn.execute(
                    text(
                        f'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS {col} {typ}'
                    )
                )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS salon_category_primary TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS salon_categories_json TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS ui_theme TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS salon_hours_json TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS salon_closed_dates_json TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS cash_close_password_hash TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS agent_key_hash TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS agent_key_last4 TEXT'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS agent_key_created_at TIMESTAMP WITH TIME ZONE'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS whatsapp_to_digits TEXT'
                )
            )
            _normalize_org_plan_payment_enums_to_varchar(conn)
            conn.execute(
                text(
                    'ALTER TABLE organization ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(32)'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE organization ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32)'
                )
            )
            conn.execute(
                text(
                    "UPDATE organization SET subscription_plan = 'esencial' "
                    "WHERE subscription_plan IS NULL OR TRIM(subscription_plan) = ''"
                )
            )
            conn.execute(
                text(
                    "UPDATE organization SET payment_method = 'unspecified' "
                    "WHERE payment_method IS NULL OR TRIM(payment_method) = ''"
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE organization ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)'
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE organization ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)'
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE organization ADD COLUMN IF NOT EXISTS billing_trial_consumed BOOLEAN DEFAULT FALSE"
                )
            )
            conn.execute(
                text(
                    "UPDATE organization SET billing_trial_consumed = FALSE "
                    "WHERE billing_trial_consumed IS NULL"
                )
            )
            # Quien ya tenía cliente Stripe no recibe otra "primera" prueba gratuita
            conn.execute(
                text(
                    "UPDATE organization SET billing_trial_consumed = TRUE "
                    "WHERE stripe_customer_id IS NOT NULL AND trim(stripe_customer_id) <> ''"
                )
            )
            for col, typ in (
                ("stripe_sub_status", "VARCHAR(32)"),
                ("stripe_trial_ends_at", "TIMESTAMPTZ"),
                ("stripe_current_period_ends_at", "TIMESTAMPTZ"),
            ):
                conn.execute(
                    text(
                        f"ALTER TABLE organization ADD COLUMN IF NOT EXISTS {col} {typ}"
                    )
                )
            conn.execute(
                text(
                    "ALTER TABLE service ADD COLUMN IF NOT EXISTS organization_id INTEGER"
                )
            )
            conn.execute(
                text(
                    'ALTER TABLE client ADD COLUMN IF NOT EXISTS organization_id INTEGER'
                )
            )
            if conn.engine.dialect.name == "postgresql":
                try:
                    conn.execute(
                        text(
                            "ALTER TABLE client DROP CONSTRAINT IF EXISTS client_telefono_key"
                        )
                    )
                except Exception:
                    pass
                try:
                    conn.execute(
                        text(
                            "UPDATE service SET organization_id = (SELECT MIN(id) FROM organization) "
                            "WHERE organization_id IS NULL AND EXISTS (SELECT 1 FROM organization)"
                        )
                    )
                    conn.execute(
                        text(
                            "UPDATE client SET organization_id = (SELECT MIN(id) FROM organization) "
                            "WHERE organization_id IS NULL AND EXISTS (SELECT 1 FROM organization)"
                        )
                    )
                except Exception as ex:
                    print(f"⚠️ init_db: org backfill for service/client: {ex}")
            _sync_postgres_serial_sequences(conn)
    except Exception as e:
        print(f"⚠️ init_db: could not ensure legacy columns: {e}")


def get_session():
    with Session(engine) as session:
        yield session
