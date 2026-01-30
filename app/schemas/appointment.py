from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AppointmentBase(BaseModel):
    client_name: str
    start_time: datetime
    end_time: datetime
    staff_id: int
    service_id: int


if TYPE_CHECKING:
    from .user import User
    from .services import Service


class AppointmentCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: Optional[str] = "scheduled"
    notes: Optional[str] = None
    staff_id: int = 1  # Por defecto, asignamos al primer profesional
    service_id: int

    # No incluimos "status" porque tiene un valor por defecto ("scheduled")


class AppointmentOut(SQLModel):
    id: int
    client_name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    service_id: int

    class Config:
        from_attributes = True
