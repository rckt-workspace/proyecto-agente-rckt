import logging
import re
import time
import httpx
from fastapi import APIRouter, Request, HTTPException
from twilio.twiml.messaging_response import MessagingResponse

from app.agent.core import run_agent
from app.channels import voice as voice_channel
from app.db import supabase_client as db
from app.db.models import WAIncomingMessage
from app.config import settings
from app.api.ws import broadcast

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/channels/whatsapp", tags=["whatsapp"])

# Cooldown anti-spam: {contact_id: last_response_timestamp}
_cooldowns: dict[str, float] = {}

# ─── Oferta de llamada de voz ─────────────────────────────────────────────────
# conversation_id → True mientras Sofia ya ofreció la llamada y espera respuesta.
# Estado en memoria, mismo patrón que _cooldowns; se pierde en cada reinicio,
# lo cual solo implica que en el peor caso se vuelve a ofrecer la llamada.
_voice_offer_pending: set[str] = set()

_POSITIVE_INTENT_PATTERNS = [
    r"agendar", r"agenda\b", r"cita\b", r"reservar", r"valoraci[oó]n",
    r"quiero (ir|hacerme|tomar|programar)", r"cu[aá]ndo puedo",
    r"inscribirme", r"me interesa", r"quiero (el|la|hacerme)",
]

_CALL_ACCEPTANCE_PATTERNS = [
    r"\bs[ií]\b", r"\bdale\b", r"\bclaro\b", r"\blisto\b", r"\bbueno\b",
    r"\bde una\b", r"\bok(ay)?\b", r"\bvale\b", r"ll[aá]mame", r"ll[aá]menme",
]

_PHONE_PATTERN = re.compile(r"\b(?:\+?57)?\s*3\d{9}\b")


def is_positive_lead_intent(text: str, agent_result: str, lead_data: dict) -> bool:
    """Heurística simple: intención de agendar/comprar + un interés (mensaje o lead) ya identificado."""
    combined = f"{text} {agent_result}".lower()
    has_intent = any(re.search(p, combined) for p in _POSITIVE_INTENT_PATTERNS)
    has_interest = bool((lead_data or {}).get("interest"))
    return has_intent and has_interest


def is_call_acceptance(text: str) -> bool:
    t = text.lower().strip()
    return any(re.search(p, t) for p in _CALL_ACCEPTANCE_PATTERNS)


def _extract_phone_from_text(text: str) -> str | None:
    match = _PHONE_PATTERN.search(text)
    return match.group(0).replace(" ", "") if match else None


def maybe_offer_voice_call(conversation_id: str, reply: str, text: str, lead: dict | None) -> str | None:
    """Devuelve un sufijo de oferta de llamada para anexar a `reply`, o None si no aplica."""
    if not settings.voice_agent_enabled:
        return None
    if conversation_id in _voice_offer_pending:
        return None
    if not is_positive_lead_intent(text, reply, lead or {}):
        return None

    _voice_offer_pending.add(conversation_id)
    return "\n\n¿Quieres que Sofía te llame ahora para orientarte mejor? 📞"


async def maybe_start_voice_call(
    conversation_id: str, contact_id: str, text: str, lead: dict | None,
) -> str | None:
    """
    Si había una oferta de llamada pendiente y el usuario acepta, dispara la
    llamada saliente internamente. Devuelve un mensaje de respuesta (reemplaza
    la respuesta normal del agente) o None si no aplica.
    """
    if conversation_id not in _voice_offer_pending:
        return None
    if not is_call_acceptance(text):
        return None
    if not settings.voice_agent_enabled:
        _voice_offer_pending.discard(conversation_id)
        return None

    phone = (lead or {}).get("phone") or _extract_phone_from_text(contact_id) or contact_id
    if not phone:
        return "Claro, ¿me compartes tu número de celular para llamarte?"

    _voice_offer_pending.discard(conversation_id)

    try:
        await voice_channel.create_voice_call_request(
            lead_id=(lead or {}).get("id"),
            conversation_id=conversation_id,
            contact_id=contact_id,
            phone=phone,
            treatment_interest=(lead or {}).get("interest"),
            reason="lead_positive",
        )
    except Exception as e:
        logger.error(f"[WA] No se pudo iniciar llamada saliente para {conversation_id}: {e}")
        return "Intenté llamarte pero hubo un problema técnico. Seguimos por aquí mientras tanto 🙂"

    return "Listo, te llamaré en unos segundos."


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

    # ─── Oferta / disparo de llamada de voz (no bloquea el flujo si falla) ────
    try:
        lead = await db.get_lead_by_conversation(conversation_id)
        call_override = await maybe_start_voice_call(conversation_id, from_number, body, lead)
        if call_override:
            reply = call_override
        else:
            offer_suffix = maybe_offer_voice_call(conversation_id, reply, body, lead)
            if offer_suffix:
                reply = reply + offer_suffix
    except Exception as e:
        logger.warning(f"[WA] Lógica de oferta de llamada falló (no crítico): {e}")

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
