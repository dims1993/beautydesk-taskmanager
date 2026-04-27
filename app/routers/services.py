from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy import or_, and_
from datetime import datetime, timezone
from typing import List, Optional

from app.core.db.session import get_session
from app.models import Appointment, Service, ServiceCategory, User
from app.models.user import UserRole
from app.dependencies import get_current_user_for_app

router = APIRouter(prefix="/services", tags=["services"])


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    price: Optional[float] = None
    category_id: Optional[int] = None


class ServiceCreateBody(BaseModel):
    name: str
    description: Optional[str] = None
    duration: int
    price: float
    category_id: Optional[int] = None


class ServiceCategoryCreateBody(BaseModel):
    name: str
    sort_order: int = 0


class ServiceCategoryUpdateBody(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


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


def _ensure_default_category(db: Session, *, org_id: int) -> ServiceCategory:
    existing = db.exec(
        select(ServiceCategory).where(
            ServiceCategory.organization_id == org_id,
            ServiceCategory.name == "General",
        )
    ).first()
    if existing:
        return existing
    cat = ServiceCategory(organization_id=org_id, name="General", sort_order=0)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def _normalize_uncategorized_services(db: Session, *, org_id: int) -> None:
    default_cat = _ensure_default_category(db, org_id=org_id)
    rows = db.exec(
        select(Service).where(
            Service.organization_id == org_id,
            Service.is_active == True,  # noqa: E712
            Service.category_id == None,  # noqa: E711
        )
    ).all()
    if not rows:
        return
    for s in rows:
        s.category_id = default_cat.id
        db.add(s)
    db.commit()


def _get_category_for_org(
    db: Session, category_id: int, current_user: User
) -> ServiceCategory:
    cat = db.get(ServiceCategory, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if current_user.role == UserRole.SUPER_ADMIN:
        return cat
    if current_user.organization_id is None:
        raise HTTPException(status_code=403, detail="Sin organización")
    if int(cat.organization_id) != int(current_user.organization_id):
        raise HTTPException(status_code=403, detail="No autorizado")
    return cat


@router.get("/categories", response_model=List[ServiceCategory])
def list_categories(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if current_user.role == UserRole.SUPER_ADMIN:
        return db.exec(select(ServiceCategory)).all()
    if current_user.organization_id is None:
        return []
    _ensure_default_category(db, org_id=int(current_user.organization_id))
    return db.exec(
        select(ServiceCategory)
        .where(ServiceCategory.organization_id == current_user.organization_id)
        .order_by(ServiceCategory.sort_order.asc(), ServiceCategory.name.asc())
    ).all()


@router.post("/categories", response_model=ServiceCategory, status_code=201)
def create_category(
    body: ServiceCategoryCreateBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if not _can_manage_services(current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    if current_user.organization_id is None:
        raise HTTPException(status_code=400, detail="Sin organización")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    exists = db.exec(
        select(ServiceCategory.id).where(
            ServiceCategory.organization_id == current_user.organization_id,
            ServiceCategory.name == name,
        )
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre.")
    cat = ServiceCategory(
        organization_id=int(current_user.organization_id),
        name=name,
        sort_order=int(body.sort_order or 0),
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/categories/{category_id}", response_model=ServiceCategory)
def update_category(
    category_id: int,
    body: ServiceCategoryUpdateBody,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if not _can_manage_services(current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    cat = _get_category_for_org(db, category_id, current_user)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        cat.name = name
    if "sort_order" in data and data["sort_order"] is not None:
        cat.sort_order = int(data["sort_order"])
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if not _can_manage_services(current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    cat = _get_category_for_org(db, category_id, current_user)
    if (cat.name or "").strip().lower() == "general":
        raise HTTPException(status_code=400, detail="No se puede eliminar la categoría General.")
    has_services = db.exec(
        select(Service.id).where(
            Service.category_id == cat.id,
            Service.is_active == True,  # noqa: E712
        ).limit(1)
    ).first()
    if has_services:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar: hay servicios dentro de esta categoría.",
        )
    db.delete(cat)
    db.commit()
    return None


@router.get("/", response_model=List[Service])
def list_services(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if current_user.role == UserRole.SUPER_ADMIN:
        return db.exec(select(Service)).all()
    if current_user.organization_id is None:
        return []
    _normalize_uncategorized_services(db, org_id=int(current_user.organization_id))
    return db.exec(
        select(Service).where(
            Service.organization_id == current_user.organization_id,
            Service.is_active == True,  # noqa: E712
        )
    ).all()


@router.post("/", response_model=Service)
def create_service(
    body: ServiceCreateBody,
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
    _ensure_default_category(db, org_id=int(org_id))
    _normalize_uncategorized_services(db, org_id=int(org_id))

    category_id = body.category_id
    if category_id is None:
        category_id = _ensure_default_category(db, org_id=int(org_id)).id
    else:
        cat = db.get(ServiceCategory, int(category_id))
        if not cat or int(cat.organization_id) != int(org_id):
            raise HTTPException(status_code=400, detail="Categoría inválida.")

    service = Service(
        name=str(body.name or "").strip(),
        description=(str(body.description).strip() if body.description else None),
        duration=int(body.duration),
        price=float(body.price),
        organization_id=int(org_id),
        category_id=int(category_id) if category_id is not None else None,
    )
    if not service.name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    if service.duration < 5:
        raise HTTPException(status_code=400, detail="La duración mínima es 5 minutos")
    if service.price < 0:
        raise HTTPException(status_code=400, detail="El precio no puede ser negativo")

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
        elif key == "category_id":
            if value is None:
                # never allow uncategorized; fallback to default category
                if svc.organization_id is None:
                    raise HTTPException(status_code=400, detail="Sin organización")
                svc.category_id = _ensure_default_category(
                    db, org_id=int(svc.organization_id)
                ).id
            else:
                cat = db.get(ServiceCategory, int(value))
                if not cat or svc.organization_id is None or int(cat.organization_id) != int(
                    svc.organization_id
                ):
                    raise HTTPException(status_code=400, detail="Categoría inválida.")
                svc.category_id = int(value)
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
            or_(
                Appointment.status == "scheduled",
                and_(
                    Appointment.status == "pending_deposit",
                    Appointment.deposit_expires_at.is_not(None),
                    Appointment.deposit_expires_at > datetime.now(timezone.utc),
                ),
            ),
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
