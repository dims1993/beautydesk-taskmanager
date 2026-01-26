from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import SQLModel, Session, select
from typing import List
from contextlib import asynccontextmanager
from sqlalchemy import or_

# Importaciones de la nueva estructura
from app.models import User, Service, Appointment
from app.schemas import AppointmentCreate, AppointmentOut, UserCreate, UserOut
from app.db.session import engine, get_session, init_db
from app.core.security import get_password_hash

# Importaciones para autenticación (si es necesario)
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from app.core.security import verify_password, create_access_token, SECRET_KEY, ALGORITHM
from app.schemas.token import Token
from jose import JWTError, jwt

# 1. Esto habilita el botón "Authorize" en Swagger
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 1. Gestión del ciclo de vida (Arranque y Cierre)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Iniciando la base de datos...")
    init_db()
    yield
    print("Cerrando recursos...")

# 2. Instancia de FastAPI
app = FastAPI(
    title="BeautyTask API",
    version="0.1.0",
    lifespan=lifespan
)

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


@app.post("/users/", response_model=UserOut)
def create_user(user_data: UserCreate, db: Session = Depends(get_session)):
    # Verificar si ya existe el email
    existing_user = db.query(User).filter(
        User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="El email ya está registrado"
        )

    # Extraemos el password del esquema ANTES de enviarlo a la función
    password_plano = str(user_data.password)
    # Encriptamos
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


@app.post("/appointments/", response_model=AppointmentOut)
def create_appointment(data: AppointmentCreate, db: Session = Depends(get_session)):

    new_appointment = Appointment(
        start_time=data.start_time,
        end_time=data.end_time,
        staff_id=data.staff_id,
        service_id=data.service_id,
        client_name=data.client_name,
        client_phone=data.client_phone,
        notes=data.notes
    )

    db.add(new_appointment)
    db.commit()
    db.refresh(new_appointment)
    return new_appointment

# --- ENDPOINTS DE AUTENTICACIÓN ---


@app.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_session)
):
    # Buscamos al usuario que coincida el EMAIL o el USERNAME con lo que puso en el primer cuadro de Swagger
    user = db.query(User).filter(
        or_(User.email == form_data.username,
            User.username == form_data.username)
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

# Endpoint de bienvenida básico


@app.get("/")
def read_root():
    return {"message": "Bienvenido a BeautyTask API"}

# --- ENDPOINTS DE CITAS ---


@app.patch("/appointments/{appointment_id}/status", response_model=AppointmentOut)
def update_appointment_status(appointment_id: int, new_status: str, db: Session = Depends(get_session)):
    # 1. Buscamos la cita por ID
    db_appointment = db.get(Appointment, appointment_id)
    if not db_appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    # 2. Actualizamos solo el campo status
    db_appointment.status = new_status

    # 3. Guardamos los cambios
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
