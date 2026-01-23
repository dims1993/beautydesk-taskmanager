# app/main.py
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager

# Importaciones de nuestro propio código
from app.db import init_db, get_session
from app.models import User
from app.schemas import UserCreate, UserOut
from app.security import get_password_hash

# 1. Gestión del ciclo de vida (Arranque y Cierre)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando la base de datos...")
    init_db()
    yield
    print("Cerrando recursos...")

# 2. Instancia de FastAPI
app = FastAPI(
    title="BeautyTask API",
    version="0.1.0",
    lifespan=lifespan
)

# --- ENDPOINTS DE USUARIOS ---


@app.post("/users/", response_model=UserOut)
def create_user(user_data: UserCreate, db: Session = Depends(get_session)):
    # Verificar si ya existe el email
    existing_user = db.query(User).filter(
        User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="El email ya está registrado"
        )

    # Extraemos el password del esquema ANTES de enviarlo a la función
    password_plano = str(user_data.password)
    # Encriptamos
    hashed_pwd = get_password_hash(password_plano)

    new_user = User(
        name=user_data.name,
        email=user_data.email,
        role=user_data.role,
        hashed_password=hashed_pwd
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/users/", response_model=List[UserOut])
def read_users(db: Session = Depends(get_session)):
    # Retorna todos los usuarios de la tabla
    users = db.query(User).all()
    return users

# Endpoint de bienvenida básico


@app.get("/")
def read_root():
    return {"message": "Bienvenido a BeautyTask API"}
