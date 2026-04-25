from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, computed_field, field_validator, model_validator

from app.constants.onboarding import ALLOWED_SALON_CATEGORIES


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


class RegisterOwnerWizardRequest(BaseModel):
    """Freemium OWNER: negocio + categorías + cuenta; el acceso es tras verificar el correo."""

    business_name: str
    address: str
    city: str
    postal_code: str
    country: str
    primary_category: str
    categories: list[str]
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    password: str
    accept_terms_and_privacy: bool = False

    @field_validator(
        "business_name",
        "address",
        "city",
        "postal_code",
        "country",
        "primary_category",
        "first_name",
        "last_name",
        "phone",
        "password",
        mode="before",
    )
    @classmethod
    def strip_text(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("categories", mode="before")
    @classmethod
    def normalize_categories(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("categories debe ser una lista")
        return v

    @model_validator(mode="after")
    def validate_password_and_categories(self):
        if len(self.password or "") < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        p = (self.primary_category or "").strip().upper()
        if p not in ALLOWED_SALON_CATEGORIES:
            raise ValueError("Servicio principal no válido")
        for c in self.categories:
            if (c or "").strip().upper() not in ALLOWED_SALON_CATEGORIES:
                raise ValueError(f"Categoría no válida: {c}")
        return self


class RegisterOwnerWizardConfirmRequest(BaseModel):
    registration_token: str
    code: str

    @field_validator("registration_token", "code", mode="before")
    @classmethod
    def strip_fields(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return v.strip()
        return v


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
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @computed_field
    @property
    def needs_fiscal_completion(self) -> bool:
        r = (self.role or "").strip().upper()
        return r == "OWNER" and self.organization_id is None

    class Config:
        from_attributes = True


class UserMeOut(UserOut):
    """GET /users/me: includes salon display fields when the user belongs to an organization."""

    organization_name: Optional[str] = None
    organization_city: Optional[str] = None
    organization_billing_address_line1: Optional[str] = None
    organization_billing_address_line2: Optional[str] = None
    cash_close_password_configured: bool = False
    has_services_configured: bool = False
    salon_hours_configured: bool = False
    # Plan de la organización (suscripción) y permisos efectivos según ese plan
    subscription_plan: Optional[str] = None
    payment_method: Optional[str] = None
    plan_entitlements: Optional[dict] = None
    has_stripe_subscription: bool = False
    # Stripe (suscripción; cache en organización, actualizado vía webhooks)
    billing_trial_consumed: bool = False
    stripe_subscription_status: Optional[str] = None
    stripe_trial_ends_at: Optional[datetime] = None
    stripe_current_period_ends_at: Optional[datetime] = None
    # True: la org debe completar checkout Stripe antes de usar la app (citas, etc.)
    app_access_locked: bool = False


class SetCashClosePasswordBody(BaseModel):
    password: str
    confirm_password: str

    @model_validator(mode="after")
    def match_and_length(self):
        p = (self.password or "").strip()
        c = (self.confirm_password or "").strip()
        if len(p) < 4:
            raise ValueError("La contraseña de cierre debe tener al menos 4 caracteres")
        if p != c:
            raise ValueError("Las contraseñas no coinciden")
        return self


class VerifyCashCloseBody(BaseModel):
    password: str


class SalonHoursDay(BaseModel):
    day_of_week: int  # 0=Mon ... 6=Sun
    is_open: bool = True
    open_time: str = "09:00"  # HH:MM
    close_time: str = "20:00"  # HH:MM

    @model_validator(mode="after")
    def validate_times(self):
        if self.day_of_week < 0 or self.day_of_week > 6:
            raise ValueError("day_of_week must be 0..6")
        if not self.is_open:
            return self
        for f in ("open_time", "close_time"):
            v = (getattr(self, f) or "").strip()
            parts = v.split(":")
            if len(parts) != 2:
                raise ValueError("Time must be HH:MM")
            hh = int(parts[0])
            mm = int(parts[1])
            if hh < 0 or hh > 23 or mm < 0 or mm > 59:
                raise ValueError("Time must be HH:MM")
        if self.open_time >= self.close_time:
            raise ValueError("open_time must be before close_time")
        return self


class SetSalonHoursBody(BaseModel):
    days: list[SalonHoursDay]

    @model_validator(mode="after")
    def validate_days(self):
        if len(self.days) != 7:
            raise ValueError("days must have 7 entries (Mon..Sun)")
        seen = set()
        for d in self.days:
            if d.day_of_week in seen:
                raise ValueError("Duplicate day_of_week")
            seen.add(d.day_of_week)
        if seen != set(range(7)):
            raise ValueError("days must include day_of_week 0..6")
        return self
