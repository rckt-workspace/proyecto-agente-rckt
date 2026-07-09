import logging
import re
import time
import httpx
from fastapi import APIRouter, Request, HTTPException
from twilio.twiml.messaging_response import MessagingResponse

from app.agent.core import run_agent
from app.agent.prompts import CALL_TRIGGER_MARKER
from app.channels import voice as voice_channel
from app.db import supabase_client as db
from app.db.models import WAIncomingMessage
from app.config import settings
from app.api.ws import broadcast

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/channels/whatsapp", tags=["whatsapp"])

# Cooldown anti-spam: {contact_id: last_response_timestamp}
_cooldowns: dict[str, float] = {}

# ─── Disparo de llamada de voz ────────────────────────────────────────────────
# Sofia (el LLM) decide, en lenguaje natural, cuándo el cliente quiere que lo
# llamen, y lo señala terminando su respuesta con CALL_TRIGGER_MARKER (ver
# agent/prompts.py). Aquí solo se detecta esa marca, se limpia del texto
# visible y se origina la llamada real por Twilio — no hay listas de palabras
# clave que adivinar.

_MARKER_RE = re.compile(r"\*{0,2}\[\[LLAMAR_AHORA\]\]\*{0,2}\.?", re.IGNORECASE)

# conversation_id → timestamp (ms) de la última llamada disparada, para evitar
# originar dos llamadas seguidas si el LLM repite la marca en turnos consecutivos.
_recent_call_triggers: dict[str, float] = {}
_CALL_TRIGGER_COOLDOWN_MS = 120_000  # 2 minutos


def _strip_call_marker(reply: str) -> tuple[str, bool]:
    """Quita la marca de disparo del texto visible. Devuelve (texto_limpio, había_marca)."""
    if CALL_TRIGGER_MARKER not in reply:
        return reply, False
    cleaned = _MARKER_RE.sub("", reply).rstrip()
    return cleaned, True


async def maybe_trigger_voice_call(conversation_id: str, from_number: str, reply: str) -> str:
    """
    Si Sofia incluyó la marca de disparo en su respuesta, la elimina del texto
    y origina la llamada saliente real por Twilio. Devuelve el texto final a
    enviar al cliente (con la marca SIEMPRE removida, pase lo que pase abajo).
    """
    cleaned_reply, has_marker = _strip_call_marker(reply)
    if not has_marker:
        return reply

    if not settings.voice_agent_enabled or not settings.has_twilio_voice:
        logger.warning(f"[WA] Marca de llamada detectada pero voz no está configurada (conv={conversation_id})")
        return cleaned_reply

    now_ms = time.time() * 1000
    last_trigger = _recent_call_triggers.get(conversation_id, 0)
    if (now_ms - last_trigger) < _CALL_TRIGGER_COOLDOWN_MS:
        return cleaned_reply
    _recent_call_triggers[conversation_id] = now_ms

    try:
        lead = await db.get_lead_by_conversation(conversation_id)
        phone = (lead or {}).get("phone") or from_number
        await voice_channel.create_voice_call_request(
            lead_id=(lead or {}).get("id"),
            conversation_id=conversation_id,
            contact_id=from_number,
            phone=phone,
            treatment_interest=(lead or {}).get("interest"),
            reason="lead_positive",
        )
    except Exception as e:
        logger.error(f"[WA] No se pudo iniciar llamada saliente para {conversation_id}: {e}")
        return cleaned_reply + "\n\nIntenté llamarte pero hubo un problema técnico. Seguimos por aquí mientras tanto 🙂"

    return cleaned_reply


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

    # ─── Disparo de llamada de voz si Sofia lo decidió (nunca deja la marca cruda) ─
    try:
        reply = await maybe_trigger_voice_call(conversation_id, from_number, reply)
    except Exception as e:
        logger.warning(f"[WA] Lógica de disparo de llamada falló (no crítico): {e}")
        reply, _ = _strip_call_marker(reply)

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
