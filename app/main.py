from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlmodel import Session, select
from typing import List, Optional
from contextlib import asynccontextmanager
from sqlalchemy import or_
from datetime import timedelta, datetime
from pydantic import BaseModel

# Importaciones internas de schemas
from app import (
    User, Service, Appointment,
    UserCreate, UserOut, AppointmentCreate, AppointmentOut, Token,
    ClientCreate, ClientOut,
    get_session, init_db, seed_services,
    verify_password, create_access_token, get_password_hash,
    send_appointment_confirmation
)
from app.core.security import SECRET_KEY, ALGORITHM


# 1. Importa el router de clientes
from app.routers import clients

from app.dependencies import get_current_user

# --- ESQUEMAS PARA RECEPCIÓN DE DATOS ---
class StatusUpdate(BaseModel):
    new_status: str
    final_price: Optional[float] = 0.0
    payment_method: Optional[str] = "ninguno"
# --- CONFIGURACIÓN Y CICLO DE VIDA ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Iniciando BeautyTask API...")
    init_db()
    try:
        seed_services()
        print("✅ Servicios base verificados.")
    except Exception as e:
        print(f"⚠️ Error en semillas: {e}")
    yield
    print("🛑 Cerrando recursos...")

app = FastAPI(title="BeautyTask API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar el router de clientes
app.include_router(clients.router)

# Reconstrucción de modelos para evitar errores de forward-reference
AppointmentCreate.model_rebuild()
AppointmentOut.model_rebuild()
ClientOut.model_rebuild()


# --- ENDPOINTS DE AUTENTICACIÓN ---

@app.post("/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_session)):
    user = db.query(User).filter(
        or_(User.email == form_data.username.lower(),
            User.username == form_data.username.lower())
    ).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# --- ENDPOINTS DE USUARIOS ---

@app.get("/users/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/users/", response_model=UserOut)
def create_user(user_data: UserCreate, db: Session = Depends(get_session)):
    existing_user = db.query(User).filter(
        or_(User.email == user_data.email, User.username == user_data.username)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email o usuario ya registrado")

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        password_hash=get_password_hash(str(user_data.password))
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.get("/users/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return db.query(User).all()

@app.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_session)):
    user = db.get(User, user_id)
    if not user: raise HTTPException(status_code=404)
    db.delete(user)
    db.commit()

# --- ENDPOINTS DE CITAS (AGENDA) ---

@app.get("/appointments/", response_model=List[AppointmentOut])
def get_appointments(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    # Filtramos para que NO traiga las borradas
    statement = select(Appointment).where(
        Appointment.staff_id == current_user.id,
        Appointment.status != "deleted"
    )
    return db.exec(statement).all()

# Nuevo endpoint para ver los archivados (Opcional por ahora)
@app.get("/appointments/archived", response_model=List[AppointmentOut])
def get_archived(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return db.exec(select(Appointment).where(
        Appointment.staff_id == current_user.id, 
        Appointment.status == "deleted"
    )).all()

@app.post("/appointments/", response_model=AppointmentOut)
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
        raise HTTPException(status_code=400, detail=f"Horario ocupado por {collision.client_name}")

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


@app.patch("/appointments/{appointment_id}/status", response_model=AppointmentOut)
def update_status(appointment_id: int, data: StatusUpdate, db: Session = Depends(get_session)):
    appo = db.get(Appointment, appointment_id)
    if not appo: raise HTTPException(status_code=404)
    
    appo.status = data.new_status
    # Si completamos, guardamos dinero. Si no, reseteamos a 0.
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

@app.get("/staff/availability-map")
def get_global_availability(db: Session = Depends(get_session)):
    return db.exec(select(Appointment).where(Appointment.status == "scheduled")).all()

# --- ENDPOINTS DE SERVICIOS ---

@app.get("/services/", response_model=List[Service])
def list_services(db: Session = Depends(get_session)):
    return db.exec(select(Service)).all()

@app.post("/services/", response_model=Service)
def create_service(service: Service, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    db.add(service)
    db.commit()
    db.refresh(service)
    return service

@app.get("/")
def read_root():
    return {"status": "BeautyTask API is running"}