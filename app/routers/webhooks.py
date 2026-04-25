import base64
import hashlib
import hmac
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlmodel import Session, select

from app.core.db.session import get_session
from app.models.organization import Organization
from app.models.service import Service


router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _twilio_signature_valid(
    *,
    url: str,
    form: dict,
    twilio_signature: Optional[str],
    auth_token: str,
) -> bool:
    """
    Validate Twilio signature for application/x-www-form-urlencoded webhook.
    Twilio signs: url + concatenated sorted(paramName + paramValue)
    """
    if not twilio_signature:
        return False
    msg = url
    for k in sorted(form.keys()):
        v = form.get(k)
        if v is None:
            continue
        msg += f"{k}{v}"
    digest = hmac.new(auth_token.encode("utf-8"), msg.encode("utf-8"), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, twilio_signature.strip())


def _twiml(message: str) -> str:
    safe = (message or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{safe}</Message></Response>'


def _pick_org_for_twilio(db: Session) -> Organization:
    """
    Sandbox/early-stage helper:
    - If exactly 1 org has an agent key configured, use it.
    - Otherwise require multi-tenant routing (to be implemented once you have 1 WA number per org).
    """
    orgs = db.exec(
        select(Organization).where(Organization.agent_key_hash.is_not(None))
    ).all()
    orgs = [o for o in orgs if (o.agent_key_hash or "").strip()]
    if len(orgs) == 1:
        return orgs[0]
    raise HTTPException(
        status_code=409,
        detail="Multiple organizations detected. Configure per-org WhatsApp number routing first.",
    )


@router.post("/twilio/whatsapp")
async def twilio_whatsapp_inbound(
    request: Request,
    db: Session = Depends(get_session),
):
    """
    Twilio WhatsApp inbound webhook (Sandbox or production).
    Responds with TwiML.
    """
    form = dict(await request.form())
    incoming_text = (form.get("Body") or "").strip()

    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    if auth_token:
        sig = request.headers.get("X-Twilio-Signature")
        # Twilio uses the full URL (scheme + host + path) as it sees it.
        # Use request.url (includes querystring if any).
        if not _twilio_signature_valid(
            url=str(request.url),
            form=form,
            twilio_signature=sig,
            auth_token=auth_token,
        ):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    org = _pick_org_for_twilio(db)

    # MVP commands
    txt_upper = incoming_text.upper()
    if txt_upper in ("HI", "HOLA", "HELP", "AYUDA", "MENU", "MENÚ", "START"):
        msg = (
            f"Hola, soy el asistente de {org.name}.\n"
            "Escribe:\n"
            "- SERVICIOS (ver catálogo)\n"
            "- CITA (empezar una reserva)\n"
        )
        return Response(content=_twiml(msg), media_type="application/xml")

    if txt_upper.startswith("SERVICIOS"):
        rows = db.exec(select(Service).where(Service.organization_id == org.id)).all()
        if not rows:
            return Response(
                content=_twiml("Aún no hay servicios configurados en el salón."),
                media_type="application/xml",
            )
        lines = []
        for s in rows[:30]:
            price = getattr(s, "price", None)
            mins = getattr(s, "duration_minutes", None)
            meta = []
            if mins is not None:
                meta.append(f"{mins}min")
            if price is not None:
                meta.append(f"{price}€")
            suffix = f" ({' · '.join(meta)})" if meta else ""
            lines.append(f"- {s.name}{suffix}")
        msg = "Servicios disponibles:\n" + "\n".join(lines) + "\n\nDi: CITA"
        return Response(content=_twiml(msg), media_type="application/xml")

    # Placeholder until we implement full booking conversation
    return Response(
        content=_twiml(
            "Te leo. Para empezar, escribe SERVICIOS o AYUDA.\n"
            "En breve podrás reservar directamente por aquí."
        ),
        media_type="application/xml",
    )

