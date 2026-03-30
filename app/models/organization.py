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
