from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Conversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    organization_id: int = Field(index=True)
    channel: str = Field(index=True)  # e.g. "whatsapp"
    from_addr: str = Field(index=True)  # e.g. "whatsapp:+34..."
    to_addr: str = Field(index=True)  # e.g. "whatsapp:+1415..."

    state_json: str = Field(default="{}")

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

