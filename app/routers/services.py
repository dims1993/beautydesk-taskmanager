from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from typing import List
from app.core.db.session import get_session
from app.models import Service, User
from app.dependencies import get_current_user

router = APIRouter(prefix="/services", tags=["services"])

@router.get("/", response_model=List[Service])
def list_services(db: Session = Depends(get_session)):
    return db.exec(select(Service)).all()

@router.post("/", response_model=Service)
def create_service(
    service: Service, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    db.add(service)
    db.commit()
    db.refresh(service)
    return service