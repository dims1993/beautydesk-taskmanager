from typing import Optional, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from .service import Service


class ServiceCategory(SQLModel, table=True):
    __tablename__ = "service_category"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    name: str = Field(index=True)
    sort_order: int = Field(default=0)

    services: list["Service"] = Relationship(back_populates="category")
