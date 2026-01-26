from pydantic import BaseModel
from typing import Optional

# --- Esquemas para SERVICIOS (Los usaremos pronto) ---


class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    duration_minutes: int


class ServiceOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: float
    duration_minutes: int

    class Config:
        from_attributes = True
