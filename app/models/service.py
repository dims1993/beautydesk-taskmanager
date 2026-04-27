from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .appointment import Appointment
    from .service_category import ServiceCategory


class Service(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    duration: int  # Duración en minutos
    price: float
    is_active: bool = Field(default=True, index=True)
    category_id: Optional[int] = Field(
        default=None, foreign_key="service_category.id", index=True
    )
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organization.id", index=True
    )

    # Relación inversa con Appointment
    appointments: list["Appointment"] = Relationship(back_populates="service")
    category: Optional["ServiceCategory"] = Relationship(back_populates="services")
