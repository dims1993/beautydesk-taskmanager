from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List

# Importas la sesión y la seguridad
from app.core.db.session import get_session
from app.dependencies import get_current_user 

# Importas tus modelos
from app.models import User, Organization, UserRole, BusinessType

# Ojo: si esto va en app/routers/users.py, el prefix suele ser "/users"
router = APIRouter(tags=["organizations"])

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
        new_org = Organization(name=data["salon_name"], business_type=BusinessType[data.get("business_type", "SALON").upper()])
        db.add(new_org)
        db.flush() #Usamos flush para tener el ID sin cerrar la transacción aún

        # 3. Crear el Usuario Admin vinculado a esa Org
        new_admin = User(
            email=data["email"],
            username=data.get("username") or data["email"].split('@')[0],
            role=UserRole.OWNER,
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
        
@router.get("/organizations", response_model=List[dict])
async def get_all_organizations(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    statement = select(Organization)
    results = db.exec(statement).all()
    
    org_list = []
    for org in results:
        # Hacemos una cuenta manual rápida para evitar el error de relación
        # Si no tienes la relación configurada, esto no fallará
        user_statement = select(User).where(User.organization_id == org.id)
        users_in_org = db.exec(user_statement).all()
        
        org_list.append({
            "id": org.id,
            "name": org.name,
            "user_count": len(users_in_org),
            "business_type": org.business_type.value
        })
    
    return org_list
