from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class Organization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    subscription_active: bool = Field(default=True) # <-- Control de pagos
    owner_id: Optional[int] = Field(default=None) # ID del dueño

