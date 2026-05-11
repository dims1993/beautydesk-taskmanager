from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .user import User
    from .service import Service
    from .client import Client

class Appointment(SQLModel, table=True):
    __tablename__ = "appointment"
    __table_args__ = {"extend_existing": True}
    
    id: Optional[int] = Field(default=None, primary_key=True)

    # RELACIÓN CON EL CLIENTE FIDELIZADO
    client_id: Optional[int] = Field(default=None, foreign_key="client.id")
    client: Optional["Client"] = Relationship(back_populates="appointments")

    
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = Field(default="scheduled")
    notes: Optional[str] = None
    
    # Campos para el cobro
    final_price: Optional[float] = Field(default=0.0)
    payment_method: Optional[str] = Field(default="efectivo")

    # Deposit flow (Stripe Connect + Checkout)
    deposit_percent: Optional[float] = Field(default=None)  # e.g. 0.25
    deposit_amount: Optional[float] = Field(default=None)
    deposit_paid: bool = Field(default=False)
    deposit_expires_at: Optional[datetime] = Field(default=None)
    stripe_checkout_session_id: Optional[str] = Field(default=None, index=True)
    stripe_payment_intent_id: Optional[str] = Field(default=None, index=True)

    # Claves foráneas
    staff_id: int = Field(foreign_key="user.id")
    # Who created the appointment (owner/staff). Optional for legacy/public bookings.
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    service_id: int = Field(foreign_key="service.id")
    # JSON array of extra service IDs (same order as booked), e.g. "[2,3]"
    additional_service_ids_json: Optional[str] = Field(default=None)

    # Multi-tenant
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organization.id", index=True
    )

    # Relationships must disambiguate which FK is used (staff_id vs created_by_id).
    staff: Optional["User"] = Relationship(
        back_populates="appointments",
        sa_relationship_kwargs={"foreign_keys": "Appointment.staff_id"},
    )
    creator: Optional["User"] = Relationship(
        back_populates="created_appointments",
        sa_relationship_kwargs={"foreign_keys": "Appointment.created_by_id"},
    )
    service: Optional["Service"] = Relationship(back_populates="appointments")