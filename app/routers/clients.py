from fastapi import APIRouter, Depends, HTTPException, Body
from starlette.responses import Response
from sqlmodel import Session, select
from typing import List
from app.core.db.session import get_session
from app.models.client import Client
from app.models.appointment import Appointment
from app.schemas.client import ClientCreate, ClientOut
from app.models.user import User
# Importamos la dependencia de seguridad que tienes en main.py
# (Si la movieras a un archivo core sería más fácil, pero puedes importarla de main)
from app.dependencies import get_current_user

router = APIRouter(prefix="/clients", tags=["clients"])

@router.post("/", response_model=ClientOut)
def create_client(
    client_data: ClientCreate, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user) # Protegido
):
    existing = db.exec(select(Client).where(Client.telefono == client_data.telefono)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este teléfono ya está registrado")
    
    new_client = Client(**client_data.model_dump())
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    return new_client

@router.get("/", response_model=List[ClientOut])
def list_clients(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user) # Protegido
):
    return db.exec(select(Client)).all()

@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    client_data: dict = Body(...), 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Actualizamos solo los campos que vienen en el body
    for key, value in client_data.items():
        # Evitamos actualizar el ID por accidente
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
    # Idempotente: segundo DELETE (doble clic / carrera) no devuelve 404
    if not client:
        return Response(status_code=204)

    for appo in db.exec(
        select(Appointment).where(Appointment.client_id == client_id)
    ).all():
        appo.client_id = None
        db.add(appo)

    db.delete(client)
    db.commit()
    return Response(status_code=204)