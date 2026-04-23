from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional

# Lo que el Frontend nos envía
class ClientCreate(BaseModel):
    nombre: str
    apellidos: Optional[str] = None
    telefono: str
    email: Optional[EmailStr] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v

# Lo que la API devuelve (incluye el ID que asignó la DB)
class ClientOut(ClientCreate):
    id: int

    class Config:
        from_attributes = True