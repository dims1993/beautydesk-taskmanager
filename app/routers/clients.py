import json
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from starlette.responses import Response
from sqlmodel import Session, select
from typing import List

from app.core.db.session import get_session
from app.models.client import Client
from app.models.client_note import ClientNote
from app.models.appointment import Appointment
from app.models.service import Service
from app.schemas.client import (
    ClientCreate,
    ClientOut,
    ClientImportRequest,
    ClientImportResult,
    ClientInsightsOut,
    ClientNoteCreate,
    ClientNoteUpdate,
    ClientNoteOut,
    ClientServiceDoneStat,
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
    request: Request = None,
):
    org_scope = None
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

    if org_scope is None:
        # SUPER_ADMIN without a specific org context should not browse the full
        # client directory from here.
        return []

    return db.exec(select(Client).where(Client.organization_id == org_scope)).all()


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


@router.get("/{client_id}/insights", response_model=ClientInsightsOut)
def client_insights(
    client_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    org_id = client.organization_id

    stmt = select(Appointment).where(
        Appointment.client_id == client_id,
        Appointment.status == "completed",
    )
    if org_id is not None:
        stmt = stmt.where(Appointment.organization_id == org_id)
    rows = list(db.exec(stmt).all())

    last_visit = None
    service_counts: dict[int, int] = {}
    for a in rows:
        if last_visit is None or a.start_time > last_visit:
            last_visit = a.start_time

        if a.service_id:
            service_counts[a.service_id] = service_counts.get(a.service_id, 0) + 1

        if a.additional_service_ids_json:
            try:
                extra_ids = json.loads(a.additional_service_ids_json) or []
            except Exception:
                extra_ids = []
            for sid in extra_ids:
                try:
                    sid_i = int(sid)
                except Exception:
                    continue
                service_counts[sid_i] = service_counts.get(sid_i, 0) + 1

    service_ids = sorted(service_counts.keys())
    services_by_id: dict[int, Service] = {}
    if service_ids:
        svc_stmt = select(Service).where(Service.id.in_(service_ids))
        if org_id is not None:
            svc_stmt = svc_stmt.where(Service.organization_id == org_id)
        for s in db.exec(svc_stmt).all():
            services_by_id[int(s.id)] = s

    services_done: list[ClientServiceDoneStat] = []
    for sid in service_ids:
        s = services_by_id.get(sid)
        services_done.append(
            ClientServiceDoneStat(
                service_id=sid,
                service_name=(s.name if s else f"Servicio {sid}"),
                count=service_counts[sid],
            )
        )
    services_done.sort(key=lambda x: (-x.count, x.service_name.lower()))

    notes_stmt = select(ClientNote).where(ClientNote.client_id == client_id)
    if org_id is not None:
        notes_stmt = notes_stmt.where(ClientNote.organization_id == org_id)
    notes_stmt = notes_stmt.order_by(ClientNote.created_at.desc())
    notes_rows = list(db.exec(notes_stmt).all())
    notes = [
        ClientNoteOut(id=n.id, text=n.text, created_at=n.created_at) for n in notes_rows
    ]

    return ClientInsightsOut(
        client=client,
        last_visit=last_visit,
        services_done=services_done,
        notes=notes,
    )


@router.post("/{client_id}/notes", response_model=ClientNoteOut, status_code=201)
def add_client_note(
    client_id: int,
    body: ClientNoteCreate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    txt = str(body.text or "").strip()
    if not txt:
        raise HTTPException(status_code=400, detail="La nota no puede estar vacía.")

    note = ClientNote(client_id=client_id, organization_id=client.organization_id, text=txt)
    db.add(note)
    db.commit()
    db.refresh(note)
    return ClientNoteOut(id=note.id, text=note.text, created_at=note.created_at)


@router.patch("/{client_id}/notes/{note_id}", response_model=ClientNoteOut)
def update_client_note(
    client_id: int,
    note_id: int,
    body: ClientNoteUpdate,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    note = db.exec(
        select(ClientNote).where(ClientNote.id == note_id, ClientNote.client_id == client_id)
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    if current_user.role != UserRole.SUPER_ADMIN:
        if note.organization_id != client.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    txt = str(body.text or "").strip()
    if not txt:
        raise HTTPException(status_code=400, detail="La nota no puede estar vacía.")

    note.text = txt
    db.add(note)
    db.commit()
    db.refresh(note)
    return ClientNoteOut(id=note.id, text=note.text, created_at=note.created_at)


@router.delete("/{client_id}/notes/{note_id}", status_code=204)
def delete_client_note(
    client_id: int,
    note_id: int,
    db: Session = Depends(get_session),
    current_user: User = Depends(get_current_user_for_app),
):
    client = db.exec(select(Client).where(Client.id == client_id)).first()
    if not client:
        return Response(status_code=204)
    if current_user.role != UserRole.SUPER_ADMIN:
        if client.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    note = db.exec(
        select(ClientNote).where(ClientNote.id == note_id, ClientNote.client_id == client_id)
    ).first()
    if not note:
        return Response(status_code=204)
    if current_user.role != UserRole.SUPER_ADMIN:
        if note.organization_id != client.organization_id:
            raise HTTPException(status_code=403, detail="No autorizado")

    db.delete(note)
    db.commit()
    return Response(status_code=204)
