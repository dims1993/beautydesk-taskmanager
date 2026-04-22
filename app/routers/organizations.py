from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from typing import List, Optional

# Importas la sesión y la seguridad
from app.core.db.session import get_session
from app.dependencies import get_current_user_for_app 

# Importas tus modelos
from app.models import User, Organization, UserRole, BusinessType
from app.billing.subscription import (
    org_subscription_and_payment_str,
    parse_payment_method,
    parse_subscription_plan,
)

# Ojo: si esto va en app/routers/users.py, el prefix suele ser "/users"
router = APIRouter(tags=["organizations"])


class OrganizationBillingUpdate(BaseModel):
    """Actualizar plan y método de cobro (solo SUPER_ADMIN; cobro real vía pasarela en fase posterior)."""

    subscription_plan: Optional[str] = Field(
        None, description="esencial | profesional | premium"
    )
    payment_method: Optional[str] = Field(
        None,
        description="unspecified | card | sepa_debit | bank_transfer | manual_invoice",
    )


@router.patch("/organizations/{org_id}/billing")
def patch_organization_billing(
    org_id: int,
    body: OrganizationBillingUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el super administrador puede cambiar el plan de una organización.",
        )
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    if body.subscription_plan is not None:
        org.subscription_plan = parse_subscription_plan(body.subscription_plan)
    if body.payment_method is not None:
        org.payment_method = parse_payment_method(body.payment_method)
    db.add(org)
    db.commit()
    db.refresh(org)
    sp, pm = org_subscription_and_payment_str(org)
    return {"subscription_plan": sp, "payment_method": pm, "organization_id": org.id}


@router.post("/create-tenant")
async def create_new_salon_admin(
    data: dict, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app)
):
    # 1. Seguridad: Solo el super_admin puede crear organizaciones y admins
    if current_user.role != UserRole.SUPER_ADMIN:
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
    current_user: User = Depends(get_current_user_for_app)
):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="No autorizado")

    statement = select(Organization)
    results = db.exec(statement).all()
    
    org_list = []
    for org in results:
        # Hacemos una cuenta manual rápida para evitar el error de relación
        # Si no tienes la relación configurada, esto no fallará
        user_statement = select(User).where(User.organization_id == org.id)
        users_in_org = db.exec(user_statement).all()
        
        sp, pm = org_subscription_and_payment_str(org)
        org_list.append({
            "id": org.id,
            "name": org.name,
            "user_count": len(users_in_org),
            "business_type": org.business_type.value,
            "subscription_plan": sp,
            "payment_method": pm,
        })
    
    return org_list
