from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.db.session import get_session
from app.models.client import Client
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