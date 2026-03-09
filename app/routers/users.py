from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List
from sqlalchemy import or_

from app.core.db.session import get_session
from app.models.user import User
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