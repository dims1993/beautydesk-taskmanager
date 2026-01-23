# app/security.py
from passlib.context import CryptContext

# Cambiamos bcrypt por argon2
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def get_password_hash(password: str) -> str:
    # Convertimos a string por seguridad y encriptamos
    return pwd_context.hash(str(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
