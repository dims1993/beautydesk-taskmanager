from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import List, Optional

from app.core.db.session import get_session
from app.models import Appointment, Service, User
from app.models.user import UserRole
from app.dependencies import get_current_user_for_app

router = APIRouter(prefix="/services", tags=["services"])


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    price: Optional[float] = None


def _can_manage_services(user: User) -> bool:
    return user.role in (UserRole.OWNER, UserRole.SUPER_ADMIN)


def _get_service_for_org(
    db: Session, service_id: int, current_user: User
) -> Service:
    svc = db.get(Service, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if current_user.role == UserRole.SUPER_ADMIN:
        return svc
    if current_user.organization_id is None:
        raise HTTPException(status_code=403, detail="Sin organización")
    if svc.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="No autorizado")
    return svc


@router.get("/", response_model=List[Service])
def list_services(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if current_user.role == UserRole.SUPER_ADMIN:
        return db.exec(select(Service)).all()
    if current_user.organization_id is None:
        return []
    return db.exec(
        select(Service).where(
            Service.organization_id == current_user.organization_id,
            Service.is_active == True,  # noqa: E712
        )
    ).all()


@router.post("/", response_model=Service)
def create_service(
    service: Service,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
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


@router.patch("/{service_id}", response_model=Service)
def update_service(
    service_id: int,
    body: ServiceUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if not _can_manage_services(current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    svc = _get_service_for_org(db, service_id, current_user)

    data = body.model_dump(exclude_unset=True)
    if "name" in data and (data["name"] is None or not str(data["name"]).strip()):
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    if "duration" in data and data["duration"] is not None and data["duration"] < 5:
        raise HTTPException(status_code=400, detail="La duración mínima es 5 minutos")
    if "price" in data and data["price"] is not None and data["price"] < 0:
        raise HTTPException(status_code=400, detail="El precio no puede ser negativo")

    for key, value in data.items():
        if key == "name" and value is not None:
            setattr(svc, key, str(value).strip())
        elif key == "description":
            setattr(svc, key, (str(value).strip() if value else None))
        elif value is not None:
            setattr(svc, key, value)

    db.add(svc)
    db.commit()
    db.refresh(svc)
    return svc


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    service_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if not _can_manage_services(current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    svc = _get_service_for_org(db, service_id, current_user)

    has_scheduled = db.exec(
        select(Appointment.id)
        .where(
            Appointment.service_id == service_id,
            Appointment.status == "scheduled",
        )
        .limit(1)
    ).first()
    if has_scheduled:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: hay citas pendientes con este servicio.",
        )

    # "Delete" means archive to keep historical appointments intact.
    svc.is_active = False
    db.add(svc)
    db.commit()
    return None
