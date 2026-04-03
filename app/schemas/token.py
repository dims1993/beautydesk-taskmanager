from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    organization_id: Optional[int] = None
    integrations_access: Optional[bool] = None
    requires_billing_step: Optional[bool] = None


class TokenData(BaseModel):
    email: Optional[str] = None
