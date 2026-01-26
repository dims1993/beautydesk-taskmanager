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
