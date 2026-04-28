import base64
import hashlib
import hmac
import json
import logging
import os
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, JSONResponse
from sqlmodel import Session, select

from app.core.db.session import get_session
from app.models.organization import Organization
from app.services.whatsapp_agent import handle_inbound_whatsapp


logger = logging.getLogger(__name__)

# Twilio treats empty <Message> body as failed delivery (HTTP can still be 200).
_TWIML_FALLBACK_TEXT = (
    "No he podido generar una respuesta válida. Escribe MENÚ para reiniciar o inténtalo de nuevo."
)

# Meta/Cloud API fallback (webhook must return 200 quickly).
_META_FALLBACK_TEXT = "Ha ocurrido un error técnico. Escribe MENÚ para reiniciar o inténtalo más tarde."

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _public_url_for_signature(request: Request) -> str:
    """
    Twilio signature validation is sensitive to the exact URL.
    Behind proxies (Render), request.url may not match the public https URL Twilio used.
    """
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.hostname or "").split(",")[0].strip()
    path = request.url.path
    qs = request.url.query
    base = f"{proto}://{host}{path}"
    return f"{base}?{qs}" if qs else base


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


def _twiml_sanitize_text(message: str) -> str:
    """Drop NUL and other control chars that break XML / Twilio parsing."""
    out: list[str] = []
    for c in message or "":
        o = ord(c)
        if c in "\t\n\r" or o >= 32:
            out.append(c)
    return "".join(out)


def _twiml_escape(message: str) -> str:
    s = _twiml_sanitize_text(message)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _twiml(messages: list[str]) -> str:
    """
    One or more <Message> nodes — Twilio sends each as a separate WhatsApp bubble.
    Empty bodies are never sent (Twilio would not deliver them).
    """
    max_len = 1500
    parts: list[str] = []
    for m in messages:
        if m is None:
            continue
        s = _twiml_sanitize_text(str(m)).strip()
        if not s:
            continue
        if len(s) > max_len:
            s = s[: max_len - 1] + "…"
        parts.append(f"<Message>{_twiml_escape(s)}</Message>")
    if not parts:
        parts.append(f"<Message>{_twiml_escape(_TWIML_FALLBACK_TEXT)}</Message>")
    inner = "".join(parts)
    return f'<?xml version="1.0" encoding="UTF-8"?><Response>{inner}</Response>'


def _pick_org_for_twilio(db: Session) -> Organization:
    """
    Sandbox/early-stage helper:
    - If TWILIO_DEFAULT_ORG_ID is set, route to that org.
    - If exactly 1 org has an agent key configured, use it.
    - Otherwise require multi-tenant routing (to be implemented once you have 1 WA number per org).
    """
    # Prefer routing by inbound 'To' number if orgs are configured with whatsapp_to_digits.
    # In Twilio WhatsApp, To is typically like "whatsapp:+14155238886"
    # (Sandbox uses the shared sandbox number).
    # Caller passes the To digits via env for now; production should configure org.whatsapp_to_digits per org.

    orgs = db.exec(
        select(Organization).where(Organization.agent_key_hash.is_not(None))
    ).all()
    orgs = [o for o in orgs if (o.agent_key_hash or "").strip()]

    env_org_id = (os.getenv("TWILIO_DEFAULT_ORG_ID") or "").strip()
    if env_org_id:
        try:
            oid = int(env_org_id)
        except ValueError:
            raise HTTPException(status_code=500, detail="TWILIO_DEFAULT_ORG_ID must be an integer")
        org = db.get(Organization, oid)
        if not org:
            raise HTTPException(status_code=500, detail="TWILIO_DEFAULT_ORG_ID org not found")
        return org

    if len(orgs) == 1:
        return orgs[0]
    raise HTTPException(
        status_code=409,
        detail="Unable to pick organization for Twilio. Set TWILIO_DEFAULT_ORG_ID or configure per-org WhatsApp number routing.",
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
    from_addr = (form.get("From") or "").strip()
    to_addr = (form.get("To") or "").strip()

    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    validate_sig = (os.getenv("TWILIO_VALIDATE_SIGNATURE", "true").strip().lower() not in ("0", "false", "no"))
    if auth_token and validate_sig:
        sig = request.headers.get("X-Twilio-Signature")
        # Twilio uses the full URL (scheme + host + path) as it sees it.
        # Use request.url (includes querystring if any).
        candidates = [str(request.url), _public_url_for_signature(request)]
        ok = any(
            _twilio_signature_valid(
                url=u,
                form=form,
                twilio_signature=sig,
                auth_token=auth_token,
            )
            for u in candidates
        )
        if not ok:
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    try:
        org = _pick_org_for_twilio(db)
    except HTTPException as e:
        # Twilio expects 2xx + TwiML; JSON errors look like a broken bot to users.
        if e.status_code == 409:
            xml = _twiml(
                [
                    "Este WhatsApp no está enlazado a un salón en el servidor. "
                    "Indica a la administración que configure TWILIO_DEFAULT_ORG_ID "
                    "o que solo un salón tenga clave de agente."
                ]
            )
            return Response(content=xml.encode("utf-8"), media_type="text/xml; charset=utf-8")
        if e.status_code == 500:
            xml = _twiml(
                [
                    "Error de configuración del salón (TWILIO_DEFAULT_ORG_ID u organización). "
                    "Contacta con soporte."
                ]
            )
            return Response(content=xml.encode("utf-8"), media_type="text/xml; charset=utf-8")
        raise

    try:
        reply = handle_inbound_whatsapp(
            db,
            org=org,
            from_addr=from_addr,
            to_addr=to_addr,
            body=incoming_text,
        )
    except Exception:
        logger.exception(
            "twilio_whatsapp_inbound handler failed from=%s to=%s",
            from_addr,
            to_addr,
        )
        reply = (
            "Ha ocurrido un error técnico. Escribe MENÚ para reiniciar o inténtalo más tarde."
        )

    if reply is None:
        logger.error(
            "twilio_whatsapp_inbound returned None from=%s to=%s step_context=check_handler",
            from_addr,
            to_addr,
        )
        bubbles = [_TWIML_FALLBACK_TEXT]
    elif isinstance(reply, list):
        if len(reply) == 0:
            logger.error(
                "twilio_whatsapp_inbound returned empty list from=%s to=%s",
                from_addr,
                to_addr,
            )
            bubbles = [_TWIML_FALLBACK_TEXT]
        else:
            bubbles = reply
    else:
        bubbles = [reply]

    xml = _twiml(bubbles)
    return Response(
        content=xml.encode("utf-8"),
        media_type="text/xml; charset=utf-8",
    )


def _pick_org_for_meta(db: Session) -> Organization:
    """
    Cloud API helper:
    - Use WHATSAPP_DEFAULT_ORG_ID if set
    - Else, if exactly 1 org has an agent key configured, use it
    """
    orgs = db.exec(
        select(Organization).where(Organization.agent_key_hash.is_not(None))
    ).all()
    orgs = [o for o in orgs if (o.agent_key_hash or "").strip()]

    env_org_id = (os.getenv("WHATSAPP_DEFAULT_ORG_ID") or "").strip()
    if env_org_id:
        try:
            oid = int(env_org_id)
        except ValueError:
            raise HTTPException(status_code=500, detail="WHATSAPP_DEFAULT_ORG_ID must be an integer")
        org = db.get(Organization, oid)
        if not org:
            raise HTTPException(status_code=500, detail="WHATSAPP_DEFAULT_ORG_ID org not found")
        return org

    if len(orgs) == 1:
        return orgs[0]
    raise HTTPException(
        status_code=409,
        detail="Unable to pick organization for Meta WhatsApp. Set WHATSAPP_DEFAULT_ORG_ID or configure routing.",
    )


def _meta_send_text(
    *,
    access_token: str,
    phone_number_id: str,
    to_digits: str,
    text: str,
) -> None:
    """
    Send a WhatsApp text message via Meta Cloud API.
    """
    version = (os.getenv("WHATSAPP_GRAPH_VERSION") or "v20.0").strip()
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": str(to_digits),
        "type": "text",
        "text": {"body": str(text)},
    }
    r = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=10,
    )
    if not r.ok:
        raise RuntimeError(f"Meta send failed ({r.status_code}): {r.text[:400]}")


@router.get("/meta/whatsapp")
async def meta_whatsapp_verify(request: Request):
    """
    Webhook verification endpoint for Meta WhatsApp Cloud API.
    """
    qp = request.query_params
    mode = (qp.get("hub.mode") or "").strip()
    token = (qp.get("hub.verify_token") or "").strip()
    challenge = (qp.get("hub.challenge") or "").strip()
    expected = (os.getenv("WHATSAPP_VERIFY_TOKEN") or "").strip()
    if mode == "subscribe" and expected and token == expected and challenge:
        return Response(content=challenge, media_type="text/plain; charset=utf-8")
    raise HTTPException(status_code=403, detail="Webhook verification failed")


@router.post("/meta/whatsapp")
async def meta_whatsapp_inbound(
    request: Request,
    db: Session = Depends(get_session),
):
    """
    WhatsApp Cloud API inbound webhook.
    Must return 200 quickly; replies are sent via Graph API.
    """
    access_token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    if not access_token:
        logger.error("WHATSAPP_ACCESS_TOKEN is not set")
        return JSONResponse({"status": "error", "detail": "missing access token"}, status_code=200)

    try:
        payload = await request.json()
    except Exception:
        logger.exception("Meta webhook invalid JSON")
        return JSONResponse({"status": "ok"}, status_code=200)

    try:
        org = _pick_org_for_meta(db)
    except HTTPException as e:
        logger.error("Meta org routing error: %s", getattr(e, "detail", ""))
        return JSONResponse({"status": "ok"}, status_code=200)

    # Meta payload: entry[].changes[].value.messages[]
    entries = payload.get("entry") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return JSONResponse({"status": "ok"}, status_code=200)

    for entry in entries:
        changes = (entry or {}).get("changes")
        if not isinstance(changes, list):
            continue
        for ch in changes:
            value = (ch or {}).get("value") or {}
            metadata = value.get("metadata") or {}
            phone_number_id = str(metadata.get("phone_number_id") or "").strip()
            msgs = value.get("messages")
            if not isinstance(msgs, list):
                continue
            for m in msgs:
                try:
                    from_digits = str((m or {}).get("from") or "").strip()
                    mtype = str((m or {}).get("type") or "").strip().lower()
                    body = ""
                    if mtype == "text":
                        body = str(((m or {}).get("text") or {}).get("body") or "").strip()
                    else:
                        # Ignore non-text for now (can be extended later).
                        continue
                    if not from_digits or not body:
                        continue

                    # Run agent
                    reply = handle_inbound_whatsapp(
                        db,
                        org=org,
                        from_addr=f"whatsapp:+{from_digits}",
                        to_addr=f"whatsapp:{phone_number_id}" if phone_number_id else "whatsapp:cloud",
                        body=body,
                    )
                    bubbles = reply if isinstance(reply, list) else [reply]
                    bubbles = [str(x).strip() for x in bubbles if x is not None and str(x).strip()]
                    if not bubbles:
                        bubbles = [_META_FALLBACK_TEXT]

                    # Send replies
                    # If phone_number_id missing, fall back to env
                    pnid = phone_number_id or (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
                    if not pnid:
                        logger.error("Missing phone_number_id (metadata + WHATSAPP_PHONE_NUMBER_ID)")
                        continue
                    for b in bubbles:
                        try:
                            _meta_send_text(
                                access_token=access_token,
                                phone_number_id=pnid,
                                to_digits=from_digits,
                                text=b,
                            )
                        except Exception:
                            logger.exception("Meta send failed to=%s", from_digits)
                except Exception:
                    logger.exception("Meta message processing failed")

    return JSONResponse({"status": "ok"}, status_code=200)

