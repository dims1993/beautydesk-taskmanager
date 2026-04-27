from datetime import datetime
from typing import List, Optional
from enum import Enum

from sqlalchemy import Column
from sqlalchemy import Enum as SAEnum
from sqlmodel import SQLModel, Field, Relationship

from app.billing.subscription import PaymentMethod, SubscriptionPlan


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

    # Plan comercial y cobro (alineado con landing; pago efectivo vía pasarela en fase posterior)
    # VARCHAR + enum values (esencial, …) — not PG native enum labels (ESENCIAL, …).
    subscription_plan: SubscriptionPlan = Field(
        default=SubscriptionPlan.ESENCIAL,
        sa_column=Column(
            SAEnum(
                SubscriptionPlan,
                native_enum=False,
                values_callable=lambda obj: [m.value for m in obj],
                length=32,
            )
        ),
    )
    payment_method: PaymentMethod = Field(
        default=PaymentMethod.UNSPECIFIED,
        sa_column=Column(
            SAEnum(
                PaymentMethod,
                native_enum=False,
                values_callable=lambda obj: [m.value for m in obj],
                length=32,
            )
        ),
    )

    # Stripe (Checkout + Customer Portal + webhooks)
    stripe_customer_id: Optional[str] = Field(default=None, index=True)
    stripe_subscription_id: Optional[str] = Field(default=None, index=True)
    # Tras un checkout de suscripción completado, no se ofrece otra prueba (una sola por org)
    billing_trial_consumed: bool = Field(default=False)
    # Sincronizados desde Stripe (suscripción); evitan llamar a la API en cada /users/me
    stripe_sub_status: Optional[str] = Field(default=None)  # trialing, active, past_due, ...
    stripe_trial_ends_at: Optional[datetime] = Field(default=None)
    stripe_current_period_ends_at: Optional[datetime] = Field(default=None)

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

    # Wizard onboarding (beauty vertical categories)
    salon_category_primary: Optional[str] = Field(default=None)
    salon_categories_json: Optional[str] = Field(default=None)
    # UI theme for the whole org (frontend uses CSS vars). None => default theme.
    ui_theme: Optional[str] = Field(default=None)

    # Salon opening hours (JSON, 7 days). Used by booking agent and availability.
    salon_hours_json: Optional[str] = Field(default=None)
    # Closed dates (holidays/vacation) as JSON list of YYYY-MM-DD.
    salon_closed_dates_json: Optional[str] = Field(default=None)

    # Cierre de caja (solo el titular la define; todo el personal la usa para validar)
    cash_close_password_hash: Optional[str] = Field(default=None)

    # Agent API key (stored hashed). Used by external orchestrators (WhatsApp/IG) to call /agent/*
    agent_key_hash: Optional[str] = Field(default=None, index=True)
    agent_key_last4: Optional[str] = Field(default=None)
    agent_key_created_at: Optional[datetime] = Field(default=None)

    # WhatsApp inbound routing (multi-tenant). Store digits-only E.164 without '+' (e.g. "14155238886").
    whatsapp_to_digits: Optional[str] = Field(default=None, index=True)
