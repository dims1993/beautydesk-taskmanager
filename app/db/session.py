# app/db/session.py
import os
from sqlmodel import create_engine, SQLModel, Session
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

engine = create_engine(DATABASE_URL, echo=True)


def init_db():
    # Importante: Importar modelos aquí para que SQLModel los reconozca
    from app import models
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
