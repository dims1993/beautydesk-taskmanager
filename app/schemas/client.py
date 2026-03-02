from pydantic import BaseModel, EmailStr
from typing import Optional

# Lo que el Frontend nos envía
class ClientCreate(BaseModel):
    nombre: str
    apellidos: Optional[str] = None
    telefono: str
    email: Optional[EmailStr] = None

# Lo que la API devuelve (incluye el ID que asignó la DB)
class ClientOut(ClientCreate):
    id: int

    class Config:
        from_attributes = True