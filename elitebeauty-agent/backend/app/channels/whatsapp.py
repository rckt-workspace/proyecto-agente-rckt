import logging
import time
import httpx
from fastapi import APIRouter, Request, HTTPException
from twilio.twiml.messaging_response import MessagingResponse

from app.agent.core import run_agent
from app.db import supabase_client as db
from app.db.models import WAIncomingMessage
from app.config import settings
from app.api.ws import broadcast

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/channels/whatsapp", tags=["whatsapp"])

# Cooldown anti-spam: {contact_id: last_response_timestamp}
_cooldowns: dict[str, float] = {}


def _is_cooldown(contact_id: str, cooldown_ms: int) -> bool:
    last = _cooldowns.get(contact_id, 0)
    if (time.time() * 1000 - last) < cooldown_ms:
        return True
    _cooldowns[contact_id] = time.time() * 1000
    return False


async def _send_to_bridge(to: str, message: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{settings.wa_bridge_url}/send",
                json={"to": to, "message": message},
            )
    except Exception as e:
        logger.error(f"No se pudo enviar a WA Bridge: {e}")


async def _process_message(from_number: str, body: str) -> str:
    cooldown_ms = int(await db.get_config_value("cooldown_ms") or settings.cooldown_ms)
    if _is_cooldown(from_number, cooldown_ms):
        logger.info(f"Cooldown activo para {from_number}")
        return ""

    require_auth = (await db.get_config_value("require_auth") or "false").lower() == "true"

    conv = await db.get_or_create_conversation("whatsapp", from_number)
    conversation_id = str(conv["id"])

    reply, tokens, latency, rag_chunks = await run_agent(
        message=body,
        channel="whatsapp",
        conversation_id=conversation_id,
        contact_id=from_number,
    )

    await broadcast({
        "type": "new_message",
        "data": {
            "channel": "whatsapp",
            "from": from_number,
            "body": body,
            "response": reply,
            "conversation_id": conversation_id,
            "latency_ms": latency,
            "rag_chunks": rag_chunks,
        },
    })

    return reply


# ─── Endpoint: WA Bridge (Node.js) → backend ─────────────────────────────────
@router.post("/message")
async def receive_from_bridge(payload: WAIncomingMessage):
    from_number = payload.from_number
    body = payload.body.strip()

    if not body:
        return {"ok": True}

    logger.info(f"[WA Bridge] Mensaje de {from_number}: {body[:80]}")
    reply = await _process_message(from_number, body)

    if reply:
        await _send_to_bridge(from_number, reply)

    return {"ok": True, "reply": reply}


# ─── Endpoint: Twilio Sandbox WhatsApp ───────────────────────────────────────
@router.post("/twilio")
async def receive_from_twilio(request: Request):
    form = await request.form()
    from_number = str(form.get("From", "")).replace("whatsapp:", "")
    body = str(form.get("Body", "")).strip()

    if not body or not from_number:
        resp = MessagingResponse()
        return str(resp)

    logger.info(f"[Twilio WA] Mensaje de {from_number}: {body[:80]}")
    reply = await _process_message(from_number, body)

    twiml = MessagingResponse()
    if reply:
        twiml.message(reply)

    from fastapi.responses import Response
    return Response(content=str(twiml), media_type="application/xml")
