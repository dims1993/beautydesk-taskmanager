from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlmodel import Session
from contextlib import asynccontextmanager
from sqlalchemy import or_

# Importaciones internas de schemas
from app import (
    User, Token,
    get_session, init_db, seed_services,
    verify_password, create_access_token, get_password_hash,
)
from app.core.security import SECRET_KEY, ALGORITHM


# 1. Importa el router
from app.routers import clients, users, appointments, services

from app.dependencies import get_current_user

# --- CONFIGURACIÓN Y CICLO DE VIDA LIFESPAN---

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Iniciando BeautyTask API...")
    init_db()
    
    # IMPORTANTE: Importa Session y engine aquí si no están
    from sqlmodel import Session
    from app.db.session import engine # Asegúrate de que la ruta sea correcta

    # --- LÓGICA PARA USUARIO DEMO CORREGIDA ---
    with Session(engine) as db: 
        demo_exists = db.query(User).filter(User.username == "demo").first()
        if not demo_exists:
            print("👤 Creando usuario demo...")
            new_demo = User(
                username="demo",
                email="demo@beautytask.com",
                role="admin",
                password_hash=get_password_hash("demo123")
            )
            db.add(new_demo)
            db.commit()
            print("✅ Usuario demo creado: demo / demo123")
    # ------------------------------------------

    try:
        seed_services()
        print("✅ Servicios base verificados.")
    except Exception as e:
        print(f"⚠️ Error en semillas: {e}")
    yield
    print("🛑 Cerrando recursos...")

app = FastAPI(title="BeautyTask API", version="0.1.0", lifespan=lifespan)

# Middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar los routers
app.include_router(clients.router)
app.include_router(users.router)
app.include_router(appointments.router)
app.include_router(services.router)

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


@app.get("/")
def read_root():
    return {"status": "BeautyTask API is running"}