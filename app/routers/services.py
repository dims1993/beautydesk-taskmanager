from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List

from app.core.db.session import get_session
from app.models import Service, User
from app.models.user import UserRole
from app.dependencies import get_current_user

router = APIRouter(prefix="/services", tags=["services"])


@router.get("/", response_model=List[Service])
def list_services(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.SUPER_ADMIN:
        return db.exec(select(Service)).all()
    if current_user.organization_id is None:
        return []
    return db.exec(
        select(Service).where(Service.organization_id == current_user.organization_id)
    ).all()


@router.post("/", response_model=Service)
def create_service(
    service: Service,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.OWNER, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="No autorizado")
    if current_user.role != UserRole.SUPER_ADMIN and not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Completa los datos fiscales de tu negocio en Ajustes antes de crear servicios.",
        )
    org_id = (
        current_user.organization_id
        if current_user.role != UserRole.SUPER_ADMIN
        else service.organization_id
    )
    if org_id is None:
        raise HTTPException(status_code=400, detail="organization_id requerido")
    service.organization_id = org_id
    db.add(service)
    db.commit()
    db.refresh(service)
    return service
