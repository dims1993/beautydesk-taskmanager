from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from typing import List, Optional  # Añadimos Optional
from datetime import timedelta
from pydantic import BaseModel      # Añadimos BaseModel
from app.core.db.session import get_session
from app.models.appointment import Appointment
from app.models.user import User
from app.models.service import Service
from app.schemas.appointment import AppointmentCreate, AppointmentOut
# Eliminamos la importación de schemas.misc si vas a definir StatusUpdate aquí abajo
from app.dependencies import get_current_user
from app.core.notifications import send_appointment_confirmation 

router = APIRouter(prefix="/appointments", tags=["appointments"])

# --- ESQUEMAS (Definidos arriba para que los endpoints los reconozcan) ---
class StatusUpdate(BaseModel):
    new_status: str
    final_price: Optional[float] = 0.0
    payment_method: Optional[str] = "none"

# --- ENDPOINTS ---

@router.get("/")
async def get_appointments(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    try:
        statement = select(Appointment)
        
        # Filtro multi-tenant
        if current_user.role != "super_admin":
            # Si el admin no tiene org_id, no devolvemos error, devolvemos vacío
            if not current_user.organization_id:
                return []
            statement = statement.where(Appointment.organization_id == current_user.organization_id)
        
        results = db.exec(statement).all()
        return results
        
    except Exception as e:
        print(f"❌ Error en GET appointments: {e}")
        # Devolvemos una lista vacía en lugar de un 500 para no romper el CORS
        return []
    
@router.post("/", response_model=AppointmentOut)
async def create_appointment(
    data: AppointmentCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    appointment_data = data.model_dump()
    appointment_data["staff_id"] = current_user.id
    new_appo = Appointment(**appointment_data)

    service = db.get(Service, data.service_id)
    duration = service.duration if service else 60
    new_appo.end_time = new_appo.start_time + timedelta(minutes=duration)

    collision = db.exec(select(Appointment).where(
        Appointment.staff_id == current_user.id,
        Appointment.status == "scheduled",
        new_appo.start_time < Appointment.end_time,
        new_appo.end_time > Appointment.start_time
    )).first()

    if collision:
        raise HTTPException(status_code=400, detail=f"Schedule occupied by {collision.client_name}")

    db.add(new_appo)
    db.commit()
    db.refresh(new_appo)

    background_tasks.add_task(
        send_appointment_confirmation, 
        email=new_appo.client_email, 
        client_name=new_appo.client_name, 
        date=new_appo.start_time.strftime("%d/%m/%Y %H:%M")
    )
    return new_appo

@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
def update_status(
    appointment_id: int, 
    data: StatusUpdate, 
    db: Session = Depends(get_session)
):
    appo = db.get(Appointment, appointment_id)
    if not appo: raise HTTPException(status_code=404)
    
    appo.status = data.new_status
    if data.new_status == "completed":
        appo.final_price = data.final_price
        appo.payment_method = data.payment_method
    else:
        appo.final_price = 0.0
        appo.payment_method = None
        
    db.add(appo)
    db.commit()
    db.refresh(appo)
    return appo

@router.get("/archived", response_model=List[AppointmentOut])
def get_archived(
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    return db.exec(select(Appointment).where(
        Appointment.staff_id == current_user.id, 
        Appointment.status == "deleted"
    )).all()