from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

# Configuración
SECRET_KEY = "tu_clave_secreta_super_segura"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configuración de Passlib para Argon2
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# --- LAS FUNCIONES QUE NECESITAS ---


def get_password_hash(password: str):
    """Encripta la contraseña plana (Usada en el registro)"""
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    """Verifica si la contraseña coincide (Usada en el login)"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict):
    """Genera el token JWT"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
