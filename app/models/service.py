from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .appointment import Appointment


class Service(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    duration: int  # Duración en minutos
    price: float

    # Relación inversa con Appointment
    appointments: list["Appointment"] = Relationship(back_populates="service")
