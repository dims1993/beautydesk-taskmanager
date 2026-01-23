# app/models.py
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(unique=True, index=True)
    role: str  # "admin" o "staff"
    hashed_password: str

    # Relación: Un usuario (staff) puede tener muchas citas
    appointments: List["Appointment"] = Relationship(back_populates="staff")


class Service(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int  # Importante para el calendario


class Appointment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_name: str
    start_time: datetime
    end_time: datetime
    status: str = Field(default="scheduled")  # scheduled, completed, cancelled

    # Claves foráneas
    staff_id: int = Field(foreign_key="user.id")
    service_id: int = Field(foreign_key="service.id")

    # Relaciones para acceder fácil: cita.staff.name
    staff: Optional[User] = Relationship(back_populates="appointments")
    # Relación inversa: user.
    appointments: List["Appointment"] = Relationship(back_populates="staff")
