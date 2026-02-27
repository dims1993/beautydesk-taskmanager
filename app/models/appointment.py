from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .user import User
    from .service import Service

class Appointment(SQLModel, table=True):
    __tablename__ = "appointment"
    __table_args__ = {"extend_existing": True}
    
    id: Optional[int] = Field(default=None, primary_key=True)
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = Field(default="scheduled")
    notes: Optional[str] = None
    
    # Campos para el cobro
    final_price: Optional[float] = Field(default=0.0)
    payment_method: Optional[str] = Field(default="efectivo")

    # Claves foráneas
    staff_id: int = Field(foreign_key="user.id")
    service_id: int = Field(foreign_key="service.id")

    # RELACIONES (Esto es lo que faltaba y causaba el error)
    staff: Optional["User"] = Relationship(back_populates="appointments")
    service: Optional["Service"] = Relationship(back_populates="appointments")