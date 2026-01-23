# app/main.py
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager

# Importaciones de nuestro propio código
from app.db import init_db, get_session
from app.models import User, Service, Appointment
from app.schemas import UserCreate, UserOut, ServiceCreate, ServiceOut, AppointmentCreate, AppointmentOut
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


@app.post("/appointments/", response_model=AppointmentOut)
def create_appointment(data: AppointmentCreate, db: Session = Depends(get_session)):
    # Podríamos añadir validaciones extra aquí (ej: ¿existe el usuario?)

    new_appointment = Appointment(
        start_time=data.start_time,
        end_time=data.end_time,
        staff_id=data.staff_id,
        service_id=data.service_id,
        client_name=data.client_name,
        client_phone=data.client_phone,
        notes=data.notes
    )

    db.add(new_appointment)
    db.commit()
    db.refresh(new_appointment)
    return new_appointment


@app.get("/users/", response_model=List[UserOut])
def read_users(db: Session = Depends(get_session)):
    # Retorna todos los usuarios de la tabla
    users = db.query(User).all()
    return users

# Endpoint de bienvenida básico


@app.get("/")
def read_root():
    return {"message": "Bienvenido a BeautyTask API"}

# --- ENDPOINTS DE CITAS ---


@app.patch("/appointments/{appointment_id}/status", response_model=AppointmentOut)
def update_appointment_status(appointment_id: int, new_status: str, db: Session = Depends(get_session)):
    # 1. Buscamos la cita por ID
    db_appointment = db.get(Appointment, appointment_id)
    if not db_appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # 2. Actualizamos solo el campo status
    db_appointment.status = new_status

    # 3. Guardamos los cambios
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)

    return db_appointment
