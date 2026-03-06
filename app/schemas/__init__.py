from .user import UserCreate, UserOut
from .appointment import AppointmentCreate, AppointmentOut
from .client import ClientOut, ClientCreate
from .token import Token

__all__ = ["UserCreate", "UserOut",
           "AppointmentCreate", "AppointmentOut", "Token",
           ClientCreate, ClientOut]

AppointmentCreate.model_rebuild()
AppointmentOut.model_rebuild()
ClientOut.model_rebuild()

