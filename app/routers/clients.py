from fastapi import APIRouter, Depends, HTTPException, Body
from starlette.responses import Response
from sqlmodel import Session, select
from typing import List

from app.core.db.session import get_session
from app.models.client import Client
from app.models.appointment import Appointment
from app.schemas.client import (
    ClientCreate,
    ClientOut,
    ClientImportRequest,
    ClientImportResult,
)
from app.models.user import User, UserRole
from app.dependencies import get_current_user_for_app

router = APIRouter(prefix="/clients", tags=["clients"])


def _norm_phone(raw: str | None) -> str:
    """Digits only for matching; strip leading Spanish country code when present."""
    if not raw:
        return ""
    digits = "".join(c for c in raw if c.isdigit())
    if len(digits) >= 12 and digits.startswith("0034"):
        digits = digits[4:]
    if len(digits) >= 11 and digits.startswith("34"):
        digits = digits[2:]
    return digits


def _require_org(current_user: User) -> int:
    if current_user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Gestión de clientes desde el panel de cada organización.",
        )
    if not current_user.organization_id:
        raise HTTPException(
            status_code=400,
            detail="Completa los datos fiscales de tu negocio en Ajustes antes de gestionar clientes.",
        )
    return current_user.organization_id


@router.post("/", response_model=ClientOut)
def create_client(
    client_data: ClientCreate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    org_id = _require_org(current_user)
    existing = db.exec(
        select(Client).where(
            Client.telefono == client_data.telefono,
            Client.organization_id == org_id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este teléfono ya está registrado")

    new_client = Client(**client_data.model_dump(), organization_id=org_id)
    db.add(new_client)
    db.commit()
    db.refresh(new_client)
    return new_client


@router.get("/", response_model=List[ClientOut])
def list_clients(
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    if current_user.role == UserRole.SUPER_ADMIN:
        return db.exec(select(Client)).all()
    if not current_user.organization_id:
        return []
    return db.exec(
        select(Client).where(Client.organization_id == current_user.organization_id)
    ).all()


def _find_client_by_norm_phone(
    existing_rows: list[Client], key: str, cache: dict[str, Client]
) -> Client | None:
    if not key:
        return None
    if key in cache:
        return cache[key]
    for row in existing_rows:
        if _norm_phone(row.telefono) == key:
            cache[key] = row
            return row
    return None


@router.post("/import", response_model=ClientImportResult)
def import_clients(
    body: ClientImportRequest,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    """
    Importa o fusiona clientes por teléfono (misma lógica que duplicados en alta).
    Útil para sincronizar con la agenda del teléfono (vCard / Contact Picker).
    """
    org_id = _require_org(current_user)

    existing_rows = list(
        db.exec(select(Client).where(Client.organization_id == org_id)).all()
    )
    norm_cache: dict[str, Client] = {}

    created = 0
    updated = 0
    skipped = 0

    for item in body.clients:
        key = _norm_phone(item.telefono)
        if not key:
            skipped += 1
            continue

        nombre = (item.nombre or "").strip() or "Cliente"
        telefono = (item.telefono or "").strip() or item.telefono
        ap_for_new = (
            item.apellidos.strip() or None
            if item.apellidos is not None
            else None
        )

        row = _find_client_by_norm_phone(existing_rows, key, norm_cache)
        if row:
            changed = False
            if nombre and nombre != row.nombre:
                row.nombre = nombre
                changed = True
            if item.apellidos is not None:
                val = item.apellidos.strip() or None
                if val != row.apellidos:
                    row.apellidos = val
                    changed = True
            if item.email and item.email != row.email:
                row.email = item.email
                changed = True
            if telefono and telefono != row.telefono:
                row.telefono = telefono
                changed = True
            if changed:
                db.add(row)
                updated += 1
            continue

        new_client = Client(
            nombre=nombre,
            apellidos=ap_for_new,
            telefono=telefono,
            email=item.email,
            organization_id=org_id,
        )
        db.add(new_client)
        db.flush()
        db.refresh(new_client)
        existing_rows.append(new_client)
        norm_cache[key] = new_client
        created += 1

    db.commit()
    return ClientImportResult(created=created, updated=updated, skipped=skipped)


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    client_data: dict = Body(...),
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    # Prevent phone collisions (DB may enforce unique phone).
    if "telefono" in client_data and client_data.get("telefono") is not None:
        new_phone_raw = str(client_data.get("telefono") or "").strip()
        if new_phone_raw and new_phone_raw != (client.telefono or ""):
            key = _norm_phone(new_phone_raw)
            if key:
                org_id = client.organization_id
                if org_id is not None:
                    siblings = db.exec(
                        select(Client).where(
                            Client.organization_id == org_id,
                            Client.id != client_id,
                        )
                    ).all()
                else:
                    siblings = db.exec(
                        select(Client).where(Client.id != client_id)
                    ).all()
                for other in siblings:
                    if _norm_phone(other.telefono) == key:
                        raise HTTPException(
                            status_code=400,
                            detail="Este teléfono ya está registrado en otro cliente.",
                        )

    for key, value in client_data.items():
        if key != "id":
            setattr(client, key, value)

    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(
    client_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        return Response(status_code=204)
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    for appo in db.exec(
        select(Appointment).where(Appointment.client_id == client_id)
    ).all():
        appo.client_id = None
        db.add(appo)

    db.delete(client)
    db.commit()
    return Response(status_code=204)
