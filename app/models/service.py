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
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organization.id", index=True
    )

    # Relación inversa con Appointment
    appointments: list["Appointment"] = Relationship(back_populates="service")
