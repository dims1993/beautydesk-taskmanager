# app/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional

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
