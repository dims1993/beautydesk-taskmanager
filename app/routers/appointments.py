import json

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi import Request
from sqlmodel import Session, select
from typing import List, Optional  # Añadimos Optional
from datetime import timedelta, datetime
from sqlalchemy import or_, and_
from datetime import timezone
from pydantic import BaseModel      # Añadimos BaseModel
from app.core.db.session import get_session
from app.models.appointment import Appointment
from app.models.user import User, UserRole
from app.models.service import Service
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
)
# Eliminamos la importación de schemas.misc si vas a definir StatusUpdate aquí abajo
from app.dependencies import get_current_user_for_app
from app.core.notifications import send_appointment_confirmation 
from app.core.google_calendar import sync_with_google_calendar  # Importamos la nueva función
from app.billing.subscription import calendar_sync_allowed

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _parse_extra_service_ids_json(raw: Optional[str]) -> list[int]:
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        return [int(x) for x in data]
    except (ValueError, TypeError, json.JSONDecodeError):
        return []


def appointment_to_out(a: Appointment) -> AppointmentOut:
    def _name(u: Optional[User]) -> Optional[str]:
        if not u:
            return None
        raw = " ".join([str(getattr(u, "first_name", "") or "").strip(), str(getattr(u, "last_name", "") or "").strip()]).strip()
        if raw:
            return raw
        return (getattr(u, "username", None) or getattr(u, "email", None) or None)

    creator_id = getattr(a, "created_by_id", None)
    if creator_id is None:
        creator_id = a.staff_id
    return AppointmentOut(
        id=a.id,
        client_id=a.client_id,
        client_name=a.client_name,
        client_phone=a.client_phone,
        client_email=a.client_email,
        start_time=a.start_time,
        end_time=a.end_time,
        status=a.status,
        service_id=a.service_id,
        staff_id=a.staff_id,
        created_by_id=creator_id,
        staff_name=_name(getattr(a, "staff", None)),
        created_by_name=_name(getattr(a, "creator", None))
        if getattr(a, "creator", None) is not None
        else _name(getattr(a, "staff", None)),
        additional_service_ids=_parse_extra_service_ids_json(
            getattr(a, "additional_service_ids_json", None)
        ),
        final_price=a.final_price,
        payment_method=a.payment_method,
    )


# --- ESQUEMAS (Definidos arriba para que los endpoints los reconozcan) ---
class StatusUpdate(BaseModel):
    new_status: str
    final_price: Optional[float] = 0.0
    payment_method: Optional[str] = "none"

# --- ENDPOINTS ---

@router.get("/", response_model=List[AppointmentOut])
async def get_appointments(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
    request: Request = None,
):
    try:
        print(f"DEBUG: Current User ID: {current_user.id}")
        statement = select(Appointment).order_by(Appointment.start_time.asc())

        org_scope: Optional[int] = None
        if current_user.role == UserRole.SUPER_ADMIN:
            raw = None
            if request is not None:
                raw = request.headers.get("x-organization-id")
            if raw and str(raw).strip().isdigit():
                org_scope = int(str(raw).strip())
        else:
            if not current_user.organization_id:
                return []
            org_scope = int(current_user.organization_id)

        if org_scope is not None:
            statement = statement.where(Appointment.organization_id == org_scope)
        
        results = db.exec(statement).all()
        print(f"DEBUG: Appointments in DB: {len(results)}")
        return [appointment_to_out(a) for a in results]
        
    except Exception as e:
        print(f"❌ Error en GET appointments: {e}")
        # Devolvemos una lista vacía en lugar de un 500 para no romper el CORS
        return []

@router.get("/upcoming", response_model=List[AppointmentOut])
async def get_upcoming(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
    request: Request = None,
):
    try:
        today = datetime.now().date()
        statement = select(Appointment).where(
            Appointment.start_time >= datetime.combine(today, datetime.min.time())
        ).order_by(Appointment.start_time.asc())

        org_scope: Optional[int] = None
        if current_user.role == UserRole.SUPER_ADMIN:
            raw = None
            if request is not None:
                raw = request.headers.get("x-organization-id")
            if raw and str(raw).strip().isdigit():
                org_scope = int(str(raw).strip())
        else:
            if not current_user.organization_id:
                return []
            org_scope = int(current_user.organization_id)

        if org_scope is not None:
            statement = statement.where(Appointment.organization_id == org_scope)
        
        results = db.exec(statement).all()
        return [appointment_to_out(a) for a in results]
        
    except Exception as e:
        print(f"❌ Error en GET upcoming appointments: {e}")
        # Devolvemos una lista vacía en lugar de un 500 para no romper el CORS
        return []

@router.post("/", response_model=AppointmentOut, status_code=201)
async def create_appointment(
    data: AppointmentCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user_for_app)
):
    if current_user.role != UserRole.SUPER_ADMIN and not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Completa los datos fiscales de tu negocio en Ajustes antes de crear citas.",
        )

    service_ids = list(data.service_ids)
    ordered_services: list[Service] = []
    for sid in service_ids:
        svc = db.get(Service, sid)
        if not svc:
            raise HTTPException(status_code=400, detail="Servicio no encontrado")
        if current_user.role != UserRole.SUPER_ADMIN:
            if svc.organization_id != current_user.organization_id:
                raise HTTPException(
                    status_code=400,
                    detail="El servicio no pertenece a tu organización.",
                )
        ordered_services.append(svc)

    primary = ordered_services[0]
    extras = service_ids[1:]

    # Assigned staff (who will perform the service) can differ from creator.
    assigned_staff_id = int(data.staff_id or current_user.id)
    assigned_staff = db.get(User, assigned_staff_id)
    if not assigned_staff:
        raise HTTPException(status_code=400, detail="Profesional no válido")
    if current_user.role != UserRole.SUPER_ADMIN:
        if not current_user.organization_id or assigned_staff.organization_id != current_user.organization_id:
            raise HTTPException(
                status_code=400,
                detail="El profesional no pertenece a tu organización.",
            )

    appointment_data = data.model_dump(exclude={"service_ids"})
    appointment_data["service_id"] = primary.id
    appointment_data["staff_id"] = assigned_staff_id
    appointment_data["additional_service_ids_json"] = (
        json.dumps(extras) if extras else None
    )
    new_appo = Appointment(**appointment_data)
    new_appo.created_by_id = current_user.id
    new_appo.organization_id = (
        current_user.organization_id
        if current_user.organization_id is not None
        else primary.organization_id
    )
    if new_appo.organization_id is None:
        raise HTTPException(
            status_code=400,
            detail="No se puede determinar la organización de la cita.",
        )

    total_minutes = sum((s.duration or 60) for s in ordered_services)
    new_appo.end_time = new_appo.start_time + timedelta(minutes=total_minutes)

    collision_stmt = select(Appointment).where(
        Appointment.staff_id == assigned_staff_id,
        or_(
            Appointment.status == "scheduled",
            and_(
                Appointment.status == "pending_deposit",
                Appointment.deposit_expires_at.is_not(None),
                Appointment.deposit_expires_at > datetime.now(timezone.utc),
            ),
        ),
        new_appo.start_time < Appointment.end_time,
        new_appo.end_time > Appointment.start_time,
    )
    # Avoid cross-tenant collisions
    if current_user.organization_id is not None:
        collision_stmt = collision_stmt.where(
            Appointment.organization_id == current_user.organization_id
        )

    collision = db.exec(collision_stmt).first()

    if collision:
        print(
            "⚠️ Collision detected:",
            {
                "staff_id": assigned_staff_id,
                "org_id": current_user.organization_id,
                "requested_start": str(new_appo.start_time),
                "requested_end": str(new_appo.end_time),
                "existing_id": collision.id,
                "existing_client": collision.client_name,
                "existing_start": str(collision.start_time),
                "existing_end": str(collision.end_time),
            },
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Schedule occupied by {collision.client_name} "
                f"({collision.start_time} - {collision.end_time})"
            ),
        )

    db.add(new_appo)
    db.commit()
    db.refresh(new_appo)

    # Sincronizar con Google Calendar solo si el plan de la organización lo permite
    if calendar_sync_allowed(db, current_user):
        try:
            sync_with_google_calendar(new_appo, current_user)
        except Exception as e:
            print(f"⚠️ Google Calendar sync failed for appointment {new_appo.id}: {e}")

    service_label = " + ".join(s.name for s in ordered_services)
    background_tasks.add_task(
        send_appointment_confirmation,
        email=new_appo.client_email,
        client_name=new_appo.client_name,
        date=new_appo.start_time.strftime("%d/%m/%Y %H:%M"),
        service_name=service_label,
    )
    return appointment_to_out(new_appo)


def _user_can_access_appointment(user: User, appo: Appointment) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if not user.organization_id:
        return False
    return appo.organization_id == user.organization_id


@router.patch("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: int,
    data: AppointmentUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if data.service_id is None and data.service_ids is None and data.start_time is None:
        raise HTTPException(
            status_code=400,
            detail="Envía al menos service_id, service_ids o start_time para actualizar.",
        )

    appo = db.get(Appointment, appointment_id)
    if not appo:
        raise HTTPException(status_code=404, detail="Cita no encontrada")

    if not _user_can_access_appointment(current_user, appo):
        raise HTTPException(status_code=403, detail="Sin acceso a esta cita")

    requested_service_ids: Optional[list[int]] = None
    if data.service_ids is not None:
        requested_service_ids = [int(x) for x in list(data.service_ids)]
        if len(requested_service_ids) < 1:
            raise HTTPException(status_code=400, detail="Selecciona al menos un servicio.")
    elif data.service_id is not None:
        requested_service_ids = [int(data.service_id)]
    else:
        requested_service_ids = None

    current_ids = [int(appo.service_id)] + _parse_extra_service_ids_json(
        getattr(appo, "additional_service_ids_json", None)
    )
    new_ids = requested_service_ids if requested_service_ids is not None else current_ids
    if len(new_ids) < 1:
        raise HTTPException(status_code=400, detail="Selecciona al menos un servicio.")

    new_service_id = int(new_ids[0])
    new_start = data.start_time if data.start_time is not None else appo.start_time

    ordered_services: list[Service] = []
    for sid in new_ids:
        svc = db.get(Service, sid)
        if not svc:
            raise HTTPException(status_code=400, detail="Servicio no válido")
        if current_user.role != UserRole.SUPER_ADMIN:
            if not current_user.organization_id or svc.organization_id != current_user.organization_id:
                raise HTTPException(
                    status_code=400,
                    detail="El servicio no pertenece a tu organización.",
                )
        ordered_services.append(svc)

    total_minutes = sum((s.duration or 60) for s in ordered_services)
    if total_minutes <= 0:
        total_minutes = 60
    new_end = new_start + timedelta(minutes=total_minutes)

    if appo.status == "scheduled":
        collision_stmt = select(Appointment).where(
            Appointment.staff_id == appo.staff_id,
            or_(
                Appointment.status == "scheduled",
                and_(
                    Appointment.status == "pending_deposit",
                    Appointment.deposit_expires_at.is_not(None),
                    Appointment.deposit_expires_at > datetime.now(timezone.utc),
                ),
            ),
            Appointment.id != appointment_id,
            new_start < Appointment.end_time,
            new_end > Appointment.start_time,
        )
        if current_user.organization_id is not None:
            collision_stmt = collision_stmt.where(
                Appointment.organization_id == current_user.organization_id
            )
        collision = db.exec(collision_stmt).first()
        if collision:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Horario ocupado por {collision.client_name} "
                    f"({collision.start_time} - {collision.end_time})"
                ),
            )

    appo.service_id = new_service_id
    appo.start_time = new_start
    appo.end_time = new_end
    extras = [int(x) for x in new_ids[1:]]
    appo.additional_service_ids_json = json.dumps(extras) if extras else None

    db.add(appo)
    db.commit()
    db.refresh(appo)
    return appointment_to_out(appo)


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
def update_status(
    appointment_id: int, 
    data: StatusUpdate, 
    db: Session = Depends(get_session)
):
    appo = db.get(Appointment, appointment_id)
    if not appo: raise HTTPException(status_code=404)
    
    appo.status = data.new_status
    if data.new_status == "completed":
        appo.final_price = data.final_price
        appo.payment_method = data.payment_method
    else:
        appo.final_price = 0.0
        appo.payment_method = None
        
    db.add(appo)
    db.commit()
    db.refresh(appo)
    return appointment_to_out(appo)

@router.get("/archived", response_model=List[AppointmentOut])
def get_archived(
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user_for_app)
):
    rows = db.exec(
        select(Appointment).where(
            Appointment.staff_id == current_user.id,
            Appointment.status == "deleted",
        )
    ).all()
    return [appointment_to_out(a) for a in rows]
