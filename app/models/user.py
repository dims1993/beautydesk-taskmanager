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
    appointments: List["Appointment"] = Relationship(back_populates="staff")
