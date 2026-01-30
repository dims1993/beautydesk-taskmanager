from pydantic import BaseModel, EmailStr
from typing import Optional


# 1. Esquema para CREAR un usuario (lo que recibimos)


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    role: str  # "admin" o "staff"
    password: str
    role: str = "user"  # Valor por defecto si no se proporciona

# 2. Esquema para DEVOLVER un usuario (lo que enviamos al exterior)


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str

    # Esto es vital para que Pydantic pueda leer modelos de SQLAlchemy
    class Config:
        from_attributes = True
