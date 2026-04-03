from fastapi import APIRouter, Depends, HTTPException, Body
from starlette.responses import Response
from sqlmodel import Session, select
from typing import List

from app.core.db.session import get_session
from app.models.client import Client
from app.models.appointment import Appointment
from app.schemas.client import ClientCreate, ClientOut
from app.models.user import User, UserRole
from app.dependencies import get_current_user

router = APIRouter(prefix="/clients", tags=["clients"])


def _require_org(current_user: User) -> int:
    if current_user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Gestión de clientes desde el panel de cada organización.",
        )
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Completa los datos fiscales de tu negocio en Ajustes antes de gestionar clientes.",
        )
    return current_user.organization_id


@router.post("/", response_model=ClientOut)
def create_client(
    client_data: ClientCreate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    org_id = _require_org(current_user)
    existing = db.exec(
        select(Client).where(
            Client.telefono == client_data.telefono,
            Client.organization_id == org_id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este teléfono ya está registrado")

    new_client = Client(**client_data.model_dump(), organization_id=org_id)
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    return new_client


@router.get("/", response_model=List[ClientOut])
def list_clients(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.SUPER_ADMIN:
        return db.exec(select(Client)).all()
    if not current_user.organization_id:
        return []
    return db.exec(
        select(Client).where(Client.organization_id == current_user.organization_id)
    ).all()


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    client_data: dict = Body(...),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    for key, value in client_data.items():
        if key != "id":
            setattr(client, key, value)

    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(
    client_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        return Response(status_code=204)
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    for appo in db.exec(
        select(Appointment).where(Appointment.client_id == client_id)
    ).all():
        appo.client_id = None
        db.add(appo)

    db.delete(client)
    db.commit()
    return Response(status_code=204)
