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

# Lo que enviamos a React (incluyendo los nuevos campos para la gráfica)
class AppointmentOut(BaseModel):
    id: int
    client_name: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    service_id: int
    staff_id: int
    final_price: float = 0.0
    payment_method: str = "efectivo"

    class Config:
        from_attributes = True