from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List

# Importas la sesión y la seguridad
from app.core.db.session import get_session
from app.core.security import get_current_user 

# Importas tus modelos
from app.models import User, Organization

# Ojo: si esto va en app/routers/users.py, el prefix suele ser "/users"
router = APIRouter(prefix="/users", tags=["users"])

@router.post("/create-tenant")
async def create_new_salon_admin(
    data: dict, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # 1. Seguridad: Solo el super_admin puede crear organizaciones y admins
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="No tienes permisos para crear salones"
        )

    try:
        # 2. Crear la Organización
        new_org = Organization(name=data["salon_name"])
        db.add(new_org)
        db.commit()
        db.refresh(new_org)

        # 3. Crear el Usuario Admin vinculado a esa Org
        new_admin = User(
            email=data["email"],
            username=data.get("username") or data["email"].split('@')[0],
            role="admin",
            organization_id=new_org.id,
            password_hash="google_auth"
        )
        
        db.add(new_admin)
        db.commit()
        db.refresh(new_admin)
        
        return {
            "message": "Salón y Admin creados correctamente", 
            "admin": new_admin,
            "organization_id": new_org.id
        }
        
    except Exception as e:
        db.rollback() # Si algo falla, limpiamos la base de datos
        print(f"Error creando salón/admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))