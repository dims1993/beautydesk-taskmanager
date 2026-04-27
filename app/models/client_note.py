from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


class ClientNote(SQLModel, table=True):
    __tablename__ = "client_note"
    __table_args__ = {"extend_existing": True}

    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id", index=True)
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organization.id", index=True
    )

    text: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), nullable=False
    )

