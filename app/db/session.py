# app/db/session.py
import os
from sqlmodel import create_engine, SQLModel, Session
from dotenv import load_dotenv

# Forzamos la carga del archivo .env
load_dotenv()

# --- CONFIGURACIÓN MANUAL DE EMERGENCIA ---
# Si os.getenv devuelve None, usaremos los valores después de la coma
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "beautytask_password")
POSTGRES_SERVER = "db"
# Aquí está el truco: si el puerto es None, ponemos "5432" por defecto como texto
POSTGRES_PORT = os.getenv("POSTGRES_PORT") or "5432"
POSTGRES_DB = os.getenv("POSTGRES_DB", "beautytask_db")

# Construimos la URL
DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_SERVER}:{POSTGRES_PORT}/{POSTGRES_DB}"

# Imprime esto en tu consola para que veas qué está intentando conectar
print(f"DEBUG: Conectando a {DATABASE_URL}")

engine = create_engine(DATABASE_URL, echo=True)


def init_db():
    # Importante: Importar modelos aquí para que SQLModel los reconozca
    from app import models
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
