from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlmodel import Session, select
from typing import List
from contextlib import asynccontextmanager
from sqlalchemy import or_
from app.db.session import engine
from sqlmodel import SQLModel


# 1. Librerías externas que faltaban
from jose import JWTError, jwt

# 2. Importación maestra desde tu __init__.py
from app import (
    User, Service, Appointment,
    UserCreate, UserOut, AppointmentCreate, AppointmentOut, Token,
    get_session, init_db, seed_services,
    verify_password, create_access_token,
    send_appointment_confirmation,
    get_password_hash
)

# 3. Importar constantes de seguridad (suelen estar en core.security)
from app.core.security import SECRET_KEY, ALGORITHM

# Archivos directamente
from app.schemas.appointment import AppointmentCreate, AppointmentOut
from app.schemas.user import UserCreate, UserOut
from app.schemas.token import Token

# 4. Librerías estándar
from datetime import timedelta, datetime

# 1. Gestión del ciclo de vida (Arranque y Cierre)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando la base de datos...")
    init_db()
    try:
        seed_services()  # <--- Llamamos a la función aquí
        print("Servicios cargados/verificados.")
    except Exception as e:
        print(f"Nota: No se pudieron cargar semillas: {e}")
    yield
    print("Cerrando recursos...")

# 2. Instancia de FastAPI
app = FastAPI(
    title="BeautyTask API",
    version="0.1.0",
    lifespan=lifespan
)

# 3. Configurar quién tiene permiso para llamar a la API

app.add_middleware(
    CORSMiddleware,
    # El asterisco permite CUALQUIER origen. Solo para desarrollo.
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],

)

# Esto habilita el botón "Authorize" en Swagger
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Esto fuerza a Pydantic a terminar de procesar los modelos
AppointmentCreate.model_rebuild()
AppointmentOut.model_rebuild()

# --- ENDPOINTS DE USUARIOS ---

# Función servirá para proteger cualquier ruta en el futuro


def get_current_user(db: Session = Depends(get_session), token: str = Depends(oauth2_scheme)):
    # Solo vemos el inicio por seguridad
    print(f"DEBUG: Token recibido -> {token[:10]}...")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        print(f"DEBUG: Email extraído del token -> {email}")

        if email is None:
            print("DEBUG: El campo 'sub' está vacío")
            raise HTTPException(status_code=401, detail="Token inválido")

    except JWTError as e:
        print(f"DEBUG: Error de JWT -> {str(e)}")  # <--- ESTO ES CLAVE
        raise HTTPException(
            status_code=401, detail="Error al validar credenciales")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        print(f"DEBUG: Usuario {email} no encontrado en la DB")
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    print(f"DEBUG: Usuario {user.email} autenticado con éxito")
    return user

# Endpoint protegido de ejemplo


@app.get("/users/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Este endpoint solo funciona si el candado está cerrado (usuario logueado)
    """
    return current_user

# Crear un nuevo usuario


@app.post("/users/", response_model=UserOut)
def create_user(user_data: UserCreate, db: Session = Depends(get_session)):
    # 1. Verificar si el email O el username ya existen
    existing_user = db.query(User).filter(
        or_(User.email == user_data.email, User.username == user_data.username)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="El email o el nombre de usuario ya están registrados"
        )

    # 2. Encriptar y crear
    password_plano = str(user_data.password)
    hashed_pwd = get_password_hash(password_plano)

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        password_hash=hashed_pwd
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# 1. LISTAR TODAS LAS CITAS (Añadido el decorador que faltaba)


@app.get("/appointments/", response_model=List[AppointmentOut])
def get_appointments(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)  # <-- Esto es obligatorio
):
    # Solo filtramos las que pertenecen al ID del usuario logueado
    statement = select(Appointment).where(
        Appointment.staff_id == current_user.id)
    return db.exec(statement).all()


# Crear una nueva cita y enviar notificación por email


@app.post("/appointments/", response_model=AppointmentOut)
async def create_appointment(
    data: AppointmentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # 1. Preparar datos base
    appointment_data = data.model_dump()
    appointment_data["staff_id"] = current_user.id

    # 2. Crear instancia temporal para calcular
    new_appointment = Appointment(**appointment_data)

    # 3. Calcular el final de la cita (Necesario para la validación)
    service = db.get(Service, data.service_id)
    if service:
        new_appointment.end_time = new_appointment.start_time + \
            timedelta(minutes=service.duration)
    else:
        new_appointment.end_time = new_appointment.start_time + \
            timedelta(hours=1)

    # --- 4. VALIDACIÓN DE COLISIONES (EL BLOQUEO) ---
    # Buscamos si existe alguna cita que:
    # - Sea del mismo profesional
    # - Esté programada (status == 'scheduled')
    # - Se solape: (Nueva_Inicio < Existente_Fin) Y (Nueva_Fin > Existente_Inicio)
    statement = select(Appointment).where(
        Appointment.staff_id == current_user.id,
        Appointment.status == "scheduled",
        new_appointment.start_time < Appointment.end_time,
        new_appointment.end_time > Appointment.start_time
    )

    collision = db.exec(statement).first()

    if collision:
        # Si hay choque, lanzamos error y detenemos todo
        raise HTTPException(
            status_code=400,
            detail=f"Horario ocupado por una cita de {collision.client_name} ({collision.start_time.strftime('%H:%M')} - {collision.end_time.strftime('%H:%M')})"
        )
    # -----------------------------------------------

    # 5. Guardar en base de datos
    db.add(new_appointment)
    db.commit()
    db.refresh(new_appointment)

    # 6. Notificación (Solo ocurre si no hubo colisión)
    background_tasks.add_task(
        send_appointment_confirmation,
        email=new_appointment.client_email,
        client_name=new_appointment.client_name,
        date=new_appointment.start_time.strftime("%d/%m/%Y a las %H:%M")
    )

    return new_appointment


def get_appointments(db: Session = Depends(get_session)):
    # Traemos todas las citas de la base de datos
    return db.exec(select(Appointment)).all()

# --- ENDPOINTS DE AUTENTICACIÓN ---


@app.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_session)
):
    # Buscamos al usuario que coincida el EMAIL o el USERNAME con lo que puso en el primer cuadro de Swagger
    user = db.query(User).filter(
        or_(User.email == form_data.username.lower(),
            User.username == form_data.username.lower())
    ).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        print(f"DEBUG: Fallo de login para: {form_data.username}")
        raise HTTPException(
            status_code=401,
            detail="Email/Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    print(f"DEBUG: Login exitoso para: {user.email}")
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# Endpoint protegido que lista todos los usuarios


@app.get("/users/", response_model=list[UserOut])
def read_users(
    db: Session = Depends(get_session),
    # <--- ESTA LÍNEA ES LA LLAVE
    current_user: User = Depends(get_current_user)
):
    users = db.query(User).all()
    return users


# Borrar un usuario específico por ID
@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_session)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db.delete(user)
    db.commit()
    return {"message": f"Usuario {user_id} eliminado con éxito"}

# Borrar todos los usuarios (Úsalo con cuidado)


@app.delete("/users/danger/all", status_code=204)
def delete_all_users(db: Session = Depends(get_session)):
    db.query(User).delete()
    db.commit()
    return {"message": "Todos los usuarios han sido eliminados"}

# Endpoint de bienvenida básico


@app.get("/")
def read_root():
    return {"message": "Bienvenido a BeautyTask API"}

# --- ENDPOINTS DE CITAS ---

# Actualizar el estado de una cita (Protegido)


@app.patch("/appointments/{appointment_id}/status", response_model=AppointmentOut)
def update_appointment_status(appointment_id: int, new_status: str, db: Session = Depends(get_session)):
    db_appointment = db.get(Appointment, appointment_id)
    if not db_appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    db_appointment.status = new_status
    db.add(db_appointment)
    db.commit()
    db.refresh(db_appointment)
    return db_appointment

# --- ENDPOINTS DE SERVICIOS ---


@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

# Listar todos los servicios (Público)


@app.get("/services/", response_model=list[Service])
def read_services(db: Session = Depends(get_session)):
    services = db.exec(select(Service)).all()
    return services

# Crear un nuevo servicio (Protegido: requiere Login)


@app.post("/services/", response_model=Service)
def create_service(
    service: Service,
    db: Session = Depends(get_session),
    # Solo usuarios autenticados
    current_user: User = Depends(get_current_user)
):
    db.add(service)
    db.commit()
    db.refresh(service)
    return service

# Obtener la agenda diaria filtrada por Servicio y Profesional


@app.get("/appointments/daily/", response_model=List[AppointmentOut])
def get_daily_agenda(
    date: str,  # Formato "2026-01-27"
    service_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    from datetime import datetime, timedelta

    try:
        # Convertimos el string a objeto datetime
        target_date = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Fecha inválida. Formato esperado: YYYY-MM-DD"
        )

    start_of_day = target_date
    end_of_day = target_date + timedelta(days=1)

    # Consulta filtrando por Servicio, Rango de Fecha y Profesional (Saray)
    statement = select(Appointment).where(
        Appointment.service_id == service_id,
        # <--- Importante para su agenda personal
        Appointment.staff_id == current_user.id,
        Appointment.start_time >= start_of_day,
        Appointment.start_time < end_of_day
    )

    appointments = db.exec(statement).all()

    return appointments


@app.get("/appointments/availability")
def get_all_availability(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Filtramos:
    # 1. Solo status "scheduled" (pendiente)
    # 2. Solo citas cuya hora de inicio sea mayor o igual a "ahora"
    now = datetime.now()
    statement = select(Appointment).where(
        Appointment.status == "scheduled",
        Appointment.start_time >= now
    )
    all_appointments = db.exec(statement).all()

    return all_appointments


@app.get("/staff/availability-map")
def get_availability_map(db: Session = Depends(get_session)):
    # Traemos citas futuras y horarios de todas
    appointments = db.exec(select(Appointment).where(
        Appointment.status == "scheduled")).all()
    return appointments


@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    # Retorna la info del usuario logueado (incluyendo su ID)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email
    }
