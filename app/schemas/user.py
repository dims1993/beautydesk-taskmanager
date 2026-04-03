from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, computed_field, field_validator, model_validator


class UserCreate(BaseModel):
    """Esquema legado; preferir RegisterAccountRequest para nuevos clientes."""

    username: str
    email: EmailStr
    password: str
    role: str = "CLIENT"


class RegisterAccountRequest(BaseModel):
    """Paso 1: cuenta. Sin datos fiscales. Con Google: sin username ni password (username = email en servidor)."""

    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    google_credential: Optional[str] = None

    role: str
    phone: str
    accept_terms_and_privacy: bool = False
    super_admin_registration_secret: Optional[str] = None

    @field_validator("google_credential", "password", "username", mode="before")
    @classmethod
    def strip_optional(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @model_validator(mode="after")
    def google_or_password(self):
        if self.google_credential:
            return self
        if not self.email or not self.password:
            raise ValueError("Correo y contraseña son obligatorios sin Google")
        if not self.username:
            raise ValueError("Nombre de usuario obligatorio sin Google")
        return self


class RegisterBillingRequest(BaseModel):
    """Paso 2: titulares (OWNER) con JWT del paso 1."""

    business_type: str
    organization_name: str
    legal_name: str
    billing_address_line1: str
    billing_address_line2: Optional[str] = None
    city: str
    postal_code: str
    province: Optional[str] = None
    country: str
    tax_id: Optional[str] = None
    billing_phone: Optional[str] = None
    billing_email: Optional[EmailStr] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str
    organization_id: Optional[int] = None
    integrations_access: bool = True
    phone: Optional[str] = None
    terms_accepted_at: Optional[datetime] = None

    @computed_field
    @property
    def needs_fiscal_completion(self) -> bool:
        r = (self.role or "").strip().upper()
        return r == "OWNER" and self.organization_id is None

    class Config:
        from_attributes = True
