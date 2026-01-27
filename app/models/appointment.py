from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime

if TYPE_CHECKING:
    from .user import User
    from .service import Service


class Appointment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    start_time: datetime
    end_time: datetime
    status: str = Field(default="scheduled")
    notes: Optional[str] = None

    # Claves foráneas (IDs)
    staff_id: int = Field(foreign_key="user.id")
    service_id: int = Field(foreign_key="service.id")

    # Relaciones (Permiten acceder a objetos completos)
    # Ejemplo: mi_cita.staff.username o mi_cita.service.name
    staff: Optional["User"] = Relationship(back_populates="appointments")
    service: Optional["Service"] = Relationship(
        back_populates="appointments")  # Nueva relación
