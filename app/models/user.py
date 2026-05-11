from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .appointment import Appointment

# 1. Definimos los roles de forma profesional
class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"  # Yo (control total, gestion de suscripciones)
    OWNER = "OWNER"              # El dueño del salón (gestiona su equipo)
    STAFF = "STAFF"              # Los empleados (ven sus propias citas)
    CLIENT = "CLIENT"            # El cliente final (opcional, si permites autoregistro)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(unique=True)
    password_hash: str
    
    # Usamos el Enum para mayor seguridad
    role: UserRole = Field(default=UserRole.CLIENT)
    
    # 2. El "Tenant" (A qué negocio pertenece este usuario)
    # Si es None, podría ser un usuario sin salón asignado aún
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")

    # Relaciones
    # There are two FKs from appointment → user (staff_id + created_by_id).
    # We must disambiguate relationships with foreign_keys to avoid mapper init errors.
    appointments: List["Appointment"] = Relationship(
        back_populates="staff",
        sa_relationship_kwargs={"foreign_keys": "Appointment.staff_id"},
    )
    created_appointments: List["Appointment"] = Relationship(
        back_populates="creator",
        sa_relationship_kwargs={"foreign_keys": "Appointment.created_by_id"},
    )
    
    # Nuevos campos para almacenar los tokens de Google
    google_access_token: str | None = Field(default=None)
    google_refresh_token: str | None = Field(default=None)

    # Calendar / WhatsApp y otras integraciones (planes superiores o SUPER_ADMIN)
    integrations_access: bool = Field(default=True)

    phone: Optional[str] = Field(default=None)
    terms_accepted_at: Optional[datetime] = Field(default=None)

    first_name: Optional[str] = Field(default=None)
    last_name: Optional[str] = Field(default=None)
