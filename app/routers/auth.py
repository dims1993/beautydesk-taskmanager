import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from google.oauth2 import id_token
from google.auth.transport import requests
from app.core.db.session import get_session
from app.models import User 
from app.schemas.token import Token 
from app.core.security import create_access_token 

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
ALLOWED_EMAILS = os.getenv("ALLOWED_EMAILS").split(',')

@router.post("/google", response_model=Token)
async def auth_google(data: dict, db: Session = Depends(get_session)):
    token = data.get("token")
    
    if not token:
        raise HTTPException(status_code=400, detail="Token no proporcionado")
        
    try:
        # 1. Validar el token con los servidores de Google
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        
        # 2. Buscar si el usuario existe en nuestra base de datos
        # (Ya sea porque lo creaste como SuperAdmin o como Admin de salón)
        statement = select(User).where(User.email == email)
        user = db.exec(statement).first()
        
        # 3. CONTROL DE ACCESO: Si no está en la DB, no entra.
        if not user:
            print(f"🚫 Intento de acceso denegado para: {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado. Este correo no está registrado como profesional en BeautyTask."
            )

        # 4. CONTROL DE ACCESO: Verificar si el email está en la lista blanca
        if email not in ALLOWED_EMAILS:
            print(f"🚫 Intento de acceso denegado para: {email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado. Este correo no está en la lista blanca."
            )

        # 5. Guardar el access_token del usuario
        user.google_access_token = data.get("access_token")
        
        # 6. Generar el JWT de nuestra propia App
        access_token = create_access_token(data={"sub": user.email})
        
        print(f"✅ Login exitoso: {user.email} (Rol: {user.role})")
        
        # 7. Guardar los cambios en la base de datos
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role,
            "organization_id": user.organization_id
        }

    except ValueError:
        raise HTTPException(status_code=400, detail="Token de Google inválido")
    except HTTPException as e:
        # Re-lanzamos el 403 para que el frontend lo reciba bien
        raise e
    except Exception as e:
        print(f"❌ Error inesperado en Auth: {str(e)}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")
