from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List
from sqlalchemy import or_

from app.core.db.session import get_session
from app.models.user import User
from app.models.organization import Organization
from app.schemas.user import UserCreate, UserOut
from app.dependencies import get_current_user
from app.core.security import get_password_hash

# Definimos el prefijo para no tener que escribir "/users" en cada función
router = APIRouter(prefix="/users", tags=["users"])

@router.post("/register", response_model=UserOut)
def register_user(user_data: UserCreate, db: Session = Depends(get_session)):
    # Comprobar si ya existe
    existing_user = db.query(User).filter(
        or_(User.email == user_data.email, User.username == user_data.username)
    ).first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or Email already registered")

    new_user = User(
        username=user_data.username.lower(),
        email=user_data.email.lower(),
        role=user_data.role,
        password_hash=get_password_hash(str(user_data.password))
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return db.query(User).all()

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_session)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()


@router.get("/team", response_model=list[User])
async def get_team(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # Solo devolvemos los usuarios que pertenecen a la misma organización
    statement = select(User).where(User.organization_id == current_user.organization_id)
    team = db.exec(statement).all()
    return team

@router.post("/team", response_model=User)
async def add_team_member(
    user_in: dict, 
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    # 1. Comprobar si el email ya existe
    statement = select(User).where(User.email == user_in["email"])
    if db.exec(statement).first():
        raise HTTPException(status_code=400, detail="Este correo ya está registrado")

    # 2. Crear el nuevo miembro vinculado a la misma organización
    new_user = User(
        email=user_in["email"],
        username=user_in.get("username") or user_in["email"].split('@')[0],
        role=user_in.get("role", "staff"),
        organization_id=current_user.organization_id, # El "pegamento" que los une
        password_hash="google_auth" # Placeholder para Google
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: str,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="No autorizado")

    statement = select(Organization).where(Organization.id == org_id)
    org = db.exec(statement).first()
    
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
        
    db.delete(org)
    db.commit()
    return {"message": "Organización eliminada"}