from typing import Optional
from sqlmodel import SQLModel, Field


class Service(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    duration: int  # Duración en minutos
    price: float
