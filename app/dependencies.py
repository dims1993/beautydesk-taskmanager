from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session
from app.core.db.session import get_session
from app.models.user import User
from app.core.security import SECRET_KEY, ALGORITHM
from app.billing.org_access import organization_blocks_app_access

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

def get_current_user(db: Session = Depends(get_session), token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Error al validar credenciales")

    # Usamos .exec(select(User)...) si quieres ser 100% fiel a SQLModel 
    # o mantenemos tu query de SQLAlchemy que también funciona:
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def get_current_user_optional(
    db: Session = Depends(get_session),
    token: str | None = Depends(oauth2_scheme_optional),
) -> User | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except JWTError:
        return None
    user = db.query(User).filter(User.email == email).first()
    return user


def get_current_user_for_app(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> User:
    """JWT + organización con suscripción Stripe (si el entorno exige pago)."""
    if organization_blocks_app_access(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ORG_BILLING_REQUIRED",
        )
    return user