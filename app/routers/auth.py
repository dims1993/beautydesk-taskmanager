import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select # Añadimos select
from google.oauth2 import id_token
from google.auth.transport import requests
from app.core.db.session import get_session
from app.models import User # Importación limpia desde el __init__ de ayer
from app.schemas.token import Token 
from app.core.security import create_access_token 

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

@router.post("/google", response_model=Token)
async def auth_google(data: dict, db: Session = Depends(get_session)):
    token = data.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token no proporcionado")
        
    try:
        # 1. Validar con Google
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        
        # 2. Buscar usuario (Sintaxis SQLModel)
        statement = select(User).where(User.email == email)
        user = db.exec(statement).first()
        
      # 3. CAMBIO CLAVE: Si no existe, lanzamos error en lugar de crear
        if not user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado. Este correo no está registrado como profesional en BeautyTask."
            )
        # 4. Generar el JWT (usando el email como 'sub')
        access_token = create_access_token(data={"sub": user.email})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role,
            "organization_id": user.organization_id
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Token de Google inválido")
    except HTTPException as e:
        # Si ya es una HTTPException (como nuestro 403), la lanzamos tal cual
        raise e
    except Exception as e:
        # Solo lo que sea realmente un error inesperado (fallo de DB, etc.) cae aquí
        print(f"Error inesperado en Auth: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")