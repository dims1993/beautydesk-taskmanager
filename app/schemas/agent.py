from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field


class AvailabilityRequest(BaseModel):
    day: date = Field(..., description="Target day in local salon timezone")
    service_ids: list[int] = Field(..., min_length=1)
    staff_id: Optional[int] = None
    open_time: str = Field("09:00", description="HH:MM local opening time")
    close_time: str = Field("20:00", description="HH:MM local closing time")
    slot_step_minutes: int = Field(15, ge=5, le=60)
    min_notice_minutes: int = Field(30, ge=0, le=24 * 60)


class AvailabilitySlot(BaseModel):
    staff_id: int
    start_time: datetime
    end_time: datetime


class AvailabilityResponse(BaseModel):
    total_minutes: int
    slots: list[AvailabilitySlot]


class QuoteRequest(BaseModel):
    service_ids: list[int] = Field(..., min_length=1)


class QuoteResponse(BaseModel):
    total_minutes: int
    total_price: float
    deposit_percent: int = 25
    deposit_amount: float


class BookRequest(BaseModel):
    # Client
    first_name: str
    last_name: Optional[str] = None
    phone: str
    email: Optional[str] = None

    # Appointment
    service_ids: list[int] = Field(..., min_length=1)
    start_time: datetime
    preferred_staff_id: Optional[int] = None
    notes: Optional[str] = None

    # Rules
    min_notice_minutes: int = Field(30, ge=0, le=24 * 60)


class BookResponse(BaseModel):
    appointment_id: int
    staff_id: int
    client_id: int
    start_time: datetime
    end_time: datetime
    total_minutes: int
    total_price: float
    deposit_percent: int = 25
    deposit_amount: float
    payment_url: Optional[str] = None
    deposit_expires_at: Optional[datetime] = None

