from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .appointment import Appointment

class Client(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    nombre: str = Field(index=True)
    apellidos: Optional[str] = None
    telefono: str = Field(index=True)
    email: Optional[str] = None
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organization.id", index=True
    )
    
    # Relación: Un cliente puede tener muchas citas
    appointments: list["Appointment"] = Relationship(back_populates="client")