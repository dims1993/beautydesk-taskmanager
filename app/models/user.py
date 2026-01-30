from typing import Optional, List, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .appointment import Appointment


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True)
    email: str
    password_hash: str
    role: str = Field(default="client")

    # Relación
    appointments: List["Appointment"] = Relationship(back_populates="staff")
    
