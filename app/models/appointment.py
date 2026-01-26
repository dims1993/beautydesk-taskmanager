from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime

if TYPE_CHECKING:
    from .user import User
    from .service import Service


class Appointment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    client_name: str
    start_time: datetime
    end_time: datetime
    status: str = Field(default="scheduled")
    client_phone: Optional[str] = None
    notes: Optional[str] = None

    staff_id: int = Field(foreign_key="user.id")
    service_id: int = Field(foreign_key="service.id")

    # Relaciones
    staff: Optional["User"] = Relationship(back_populates="appointments")
