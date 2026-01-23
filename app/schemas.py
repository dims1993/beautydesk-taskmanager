# app/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

# 1. Esquema para CREAR un usuario (lo que recibimos)


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    role: str  # "admin" o "staff"
    password: str

# 2. Esquema para DEVOLVER un usuario (lo que enviamos al exterior)


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str

    # Esto es vital para que Pydantic pueda leer modelos de SQLAlchemy
    class Config:
        from_attributes = True

# --- Esquemas para SERVICIOS (Los usaremos pronto) ---


class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int


class ServiceOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: float
    duration_minutes: int

    class Config:
        from_attributes = True

# --- Esquemas para CITAS (Los usaremos pronto) ---


class AppointmentCreate(BaseModel):
    client_name: str
    start_time: datetime
    end_time: datetime
    staff_id: int
    service_id: int
    client_phone: Optional[str] = None
    notes: Optional[str] = None
    # No incluimos "status" porque tiene un valor por defecto ("scheduled")


class AppointmentOut(BaseModel):
    id: int
    start_time: datetime
    end_time: datetime
    staff_id: int
    service_id: int
    client_name: str

    class Config:
        from_attributes = True
