from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# Lo que recibimos de React al crear una cita
class AppointmentCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    service_id: int
    staff_id: Optional[int] = 1

# Actualización parcial desde el modal de edición
class AppointmentUpdate(BaseModel):
    service_id: Optional[int] = None
    start_time: Optional[datetime] = None


# Lo que enviamos a React (incluyendo los nuevos campos para la gráfica)
class AppointmentOut(BaseModel):
    id: int
    client_name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    service_id: int
    staff_id: int
    # Cambiamos estos dos para que acepten valores nulos de la base de datos
    final_price: Optional[float] = 0.0
    payment_method: Optional[str] = "efectivo" 

    class Config:
        from_attributes = True