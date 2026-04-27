from datetime import datetime
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


class ClientImportItem(BaseModel):
    """Fila para importación / sincronización desde agenda o fichero vCard."""

    nombre: str = ""
    apellidos: Optional[str] = None
    telefono: str
    email: Optional[EmailStr] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none_import(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v


class ClientImportRequest(BaseModel):
    clients: list[ClientImportItem]


class ClientImportResult(BaseModel):
    created: int
    updated: int
    skipped: int


class ClientServiceDoneStat(BaseModel):
    service_id: int
    service_name: str
    count: int


class ClientNoteCreate(BaseModel):
    text: str


class ClientNoteUpdate(BaseModel):
    text: str


class ClientNoteOut(BaseModel):
    id: int
    text: str
    created_at: datetime


class ClientInsightsOut(BaseModel):
    client: ClientOut
    last_visit: datetime | None = None
    services_done: list[ClientServiceDoneStat]
    notes: list[ClientNoteOut]

    class Config:
        from_attributes = True