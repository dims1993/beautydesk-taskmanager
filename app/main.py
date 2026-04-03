import os
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
from app.routers import clients, users, appointments, services, auth, organizations

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


# CORS — With allow_credentials=True, origins must be explicit (never "*").
# Set CORS_ORIGINS="http://localhost:5173,https://app.example.com" in production.
_cors_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ALLOW_ORIGINS = [
    o.strip().rstrip("/")
    for o in _cors_raw.split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Optional security headers (see note in README / deployment docs).
# COOP mainly affects HTML documents; for a JSON API it is usually redundant.
@app.middleware("http")
async def add_cross_origin_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault(
        "Cross-Origin-Opener-Policy",
        "same-origin-allow-popups",
    )
    response.headers.setdefault(
        "Cross-Origin-Resource-Policy",
        "cross-origin",
    )
    # COEP require-corp breaks many third-party scripts; enable only if you need it.
    if os.getenv("ENABLE_COEP_REQUIRE_CORP", "").lower() in ("1", "true", "yes"):
        response.headers.setdefault(
            "Cross-Origin-Embedder-Policy",
            "require-corp",
        )
    return response

# Registrar los routers
app.include_router(clients.router)
app.include_router(users.router)
app.include_router(appointments.router)
app.include_router(services.router)
app.include_router(organizations.router, prefix="/users")
app.include_router(auth.router)

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

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "organization_id": user.organization_id,
        "integrations_access": getattr(user, "integrations_access", True),
    }


@app.get("/")
def read_root():
    return {"status": "BeautyTask API is running"}