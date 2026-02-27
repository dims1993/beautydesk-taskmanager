# 1. Base de datos y Sesión
from .db.session import engine, get_session, init_db

# 2. Modelos (Las TABLAS que van a la Base de Datos)
# Importamos directamente desde los archivos dentro de la carpeta models
from .models.user import User
from .models.service import Service
from .models.appointment import Appointment

# 3. Esquemas (Los objetos que viajan por la API)
# Importamos directamente desde los archivos dentro de la carpeta schemas
from .schemas.user import UserCreate, UserOut
from .schemas.appointment import AppointmentCreate, AppointmentOut
from .schemas.token import Token

# 4. Seguridad
from .core.security import (
    get_password_hash,
    verify_password,
    create_access_token
)

# 5. Utilidades
from .core.notifications import send_appointment_confirmation
from .seed import seed_services

# 6. Registro de exportaciones
__all__ = [
    "engine", "get_session", "init_db",
    "User", "Service", "Appointment",
    "UserCreate", "UserOut", "AppointmentCreate", "AppointmentOut", "Token",
    "get_password_hash", "verify_password", "create_access_token",
    "send_appointment_confirmation", "seed_services"
]