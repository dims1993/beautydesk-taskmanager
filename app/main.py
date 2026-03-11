from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session
from contextlib import asynccontextmanager
from sqlalchemy import or_

# Importacion interna de models
from app.models import User, Organization, Service, Appointment
# Importaciones internas de schemas
from app import (
    Token, get_session, init_db, seed_services,
    verify_password, create_access_token, 
)

# 1. Importación del router
from app.routers import clients, users, appointments, services, auth

# --- CONFIGURACIÓN Y CICLO DE VIDA LIFESPAN---

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

app.include_router(auth.router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # El puerto de tu Vite/React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware para Google (COOP)
@app.middleware("http")
async def add_coop_header(request: Request, call_next):
    response = await call_next(request)
    # Esto es lo que permite que el popup de Google hable con tu App
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response

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

    return {"access_token": access_token, 
            "token_type": "bearer",
            "role": user.role,
            "organization_id": user.organization_id
            }


@app.get("/")
def read_root():
    return {"status": "BeautyTask API is running"}