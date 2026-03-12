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
        
@router.get("/organizations", response_model=List[dict])
async def get_all_organizations(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Solo el Super Admin puede ver la lista global de salones
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    # Esta consulta trae el nombre de la organización y cuenta sus usuarios
    # (Asegúrate de tener la relación 'users' en tu modelo Organization)
    statement = select(Organization)
    results = db.exec(statement).all()
    
    return [
        {
            "id": org.id,
            "name": org.name,
            "created_at": org.created_at if hasattr(org, 'created_at') else None,
            "user_count": len(org.users) # Esto requiere relationship("User", back_populates="organization")
        } for org in results
    ]