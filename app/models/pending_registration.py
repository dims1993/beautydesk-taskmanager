from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PendingRegistration(SQLModel, table=True):
    """OWNER freemium signup: holds hashed verification code until email is confirmed."""

    __tablename__ = "pending_registration"

    id: Optional[int] = Field(default=None, primary_key=True)
    registration_token: str = Field(index=True, unique=True)
    email: str = Field(index=True)
    code_hash: str
    expires_at: datetime
    created_at: datetime
    payload_json: str  # JSON: business + categories + user fields + password_hash (never plain text)
