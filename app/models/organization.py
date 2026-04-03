from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship
from enum import Enum

class BusinessType(Enum):
    SALON = "salon"
    LAWYER = "lawyer"
    MECHANIC = "mechanic"
    GYM = "gym"
    OTHER = "other"

class Organization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    subscription_active: bool = Field(default=True) # <-- Control de pagos
    owner_id: Optional[int] = Field(default=None) # ID del dueño
    business_type: BusinessType = Field(default=BusinessType.SALON)

    # Datos de facturación / negocio
    legal_name: Optional[str] = Field(default=None)
    billing_address_line1: Optional[str] = Field(default=None)
    billing_address_line2: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    postal_code: Optional[str] = Field(default=None)
    province: Optional[str] = Field(default=None)
    country: Optional[str] = Field(default=None)
    tax_id: Optional[str] = Field(default=None)
    billing_phone: Optional[str] = Field(default=None)
    billing_email: Optional[str] = Field(default=None)
