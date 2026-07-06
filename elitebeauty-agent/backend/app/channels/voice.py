import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from twilio.twiml.voice_response import VoiceResponse, Gather

from app.agent.core import run_agent
from app.agent import openrouter
from app.agent.prompts import build_voice_prompt
from app.config import settings
from app.db import supabase_client as db
from app.db.models import VoiceCallRequestIn
from app.channels import twilio_voice_service
from app.api.ws import broadcast

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])

# call_sid → conversation_id en memoria (se persiste en DB al colgar)
_active_calls: dict[str, str] = {}
# call_sid → start_time (unix timestamp)
_call_start: dict[str, float] = {}

# ─── Estado en memoria del flujo saliente (voice_call_id como clave) ──────────
# Espejo del patrón _active_calls/_call_start ya usado arriba para el flujo entrante.
_call_turns: dict[str, int] = {}
_no_speech_retry: set[str] = set()

_MAX_VOICE_TURNS = 8
_CLOSING_PHRASES = [
    "gracias", "chao", "adiós", "adios", "hasta luego",
    "no más", "no mas", "eso es todo", "nada más", "nada mas",
]


def _twiml_gather(say_text: str, action: str) -> str:
    resp = VoiceResponse()
    gather = Gather(
        input="speech",
        language="es-MX",
        action=action,
        speech_timeout="auto",
        speech_model="experimental_conversations",
    )
    gather.say(say_text, voice="Polly.Lupe", language="es-US")
    resp.append(gather)
    resp.say("No escuché nada. Llámanos al +57 301 444 6646. ¡Hasta pronto!", voice="Polly.Lupe", language="es-US")
    return str(resp)


# ─── TwiML del flujo saliente (usa idioma/voz configurables por settings) ─────
def _twiml_outbound_gather(say_text: str, action: str) -> str:
    resp = VoiceResponse()
    gather = Gather(
        input="speech",
        language=settings.twilio_voice_language,
        action=action,
        speech_timeout="auto",
        timeout=6,
    )
    gather.say(say_text, voice=settings.twilio_voice_name, language=settings.twilio_voice_language)
    resp.append(gather)
    resp.say(
        "No logré escucharte. Seguimos por WhatsApp. ¡Hasta pronto!",
        voice=settings.twilio_voice_name, language=settings.twilio_voice_language,
    )
    resp.hangup()
    return str(resp)


def _twiml_say_hangup(say_text: str) -> str:
    resp = VoiceResponse()
    resp.say(say_text, voice=settings.twilio_voice_name, language=settings.twilio_voice_language)
    resp.hangup()
    return str(resp)


def _is_closing_utterance(text: str) -> bool:
    t = text.lower()
    return any(p in t for p in _CLOSING_PHRASES)


async def _check_twilio_signature(request: Request, form) -> None:
    """No-op si TWILIO_VALIDATE_SIGNATURE está desactivado (default en dev)."""
    if not settings.twilio_validate_signature:
        return
    full_url = f"{settings.public_base_url.rstrip('/')}{request.url.path}"
    if request.url.query:
        full_url += f"?{request.url.query}"
    signature = request.headers.get("X-Twilio-Signature")
    params = {k: v for k, v in form.items()}
    if not twilio_voice_service.verify_twilio_signature(full_url, params, signature):
        logger.warning(f"[Voice] Firma Twilio inválida en {request.url.path}")
        raise HTTPException(status_code=403, detail="Firma Twilio inválida")


# ─── Creación de llamada saliente (reutilizable desde /voice/call-request ─────
# y desde whatsapp.py cuando el usuario acepta la oferta de llamada) ──────────
async def create_voice_call_request(
    *,
    lead_id: str | None,
    conversation_id: str | None,
    contact_id: str | None,
    phone: str,
    treatment_interest: str | None = None,
    reason: str = "lead_positive",
) -> dict:
    to_number = twilio_voice_service.normalize_phone_for_twilio(phone)

    voice_call = await db.create_voice_call({
        "lead_id": lead_id,
        "conversation_id": conversation_id,
        "contact_id": contact_id,
        "phone": to_number,
        "direction": "outbound",
        "status": "requested",
        "reason": reason,
        "treatment_interest": treatment_interest,
    })
    voice_call_id = str(voice_call["id"])

    try:
        call_sid = twilio_voice_service.create_outbound_call(to=to_number, voice_call_id=voice_call_id)
    except Exception as e:
        logger.error(f"[Voice] Fallo creando llamada saliente para {voice_call_id}: {e}")
        await db.update_voice_call_by_id(voice_call_id, {"status": "failed"})
        raise

    await db.update_voice_call_by_id(voice_call_id, {"call_sid": call_sid, "status": "queued"})

    await broadcast({
        "type": "call_event",
        "data": {
            "event": "outbound_requested",
            "voice_call_id": voice_call_id,
            "call_sid": call_sid,
            "phone": to_number,
        },
    })

    return {"voice_call_id": voice_call_id, "call_sid": call_sid}


# ─── Llamada entrante ─────────────────────────────────────────────────────────
@router.post("/incoming")
async def voice_incoming(request: Request):
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    from_number = str(form.get("From", ""))

    logger.info(f"[Voice] Llamada entrante {call_sid} de {from_number}")

    conv = await db.get_or_create_conversation("voice", from_number or call_sid)
    _active_calls[call_sid] = str(conv["id"])

    import time
    _call_start[call_sid] = time.time()

    await broadcast({
        "type": "call_event",
        "data": {"event": "incoming", "call_sid": call_sid, "from": from_number},
    })

    base_url = request.base_url
    action_url = f"{base_url}voice/process"
    xml = _twiml_gather(
        "Bienvenido a Elite Beauty. Soy Sofía. ¿En qué te puedo ayudar?",
        action_url,
    )
    return Response(content=xml, media_type="application/xml")


# ─── Turno de conversación ────────────────────────────────────────────────────
@router.post("/process")
async def voice_process(request: Request):
    form = await request.form()
    call_sid = str(form.get("CallSid", ""))
    speech_result = str(form.get("SpeechResult", "")).strip()
    from_number = str(form.get("From", ""))

    logger.info(f"[Voice] {call_sid} dijo: {speech_result[:80]}")

    if not speech_result:
        base_url = request.base_url
        xml = _twiml_gather(
            "Perdona, no te escuché bien. ¿Puedes repetir?",
            f"{base_url}voice/process",
        )
        return Response(content=xml, media_type="application/xml")

    conversation_id = _active_calls.get(call_sid)
    if not conversation_id:
        conv = await db.get_or_create_conversation("voice", from_number or call_sid)
        conversation_id = str(conv["id"])
        _active_calls[call_sid] = conversation_id

    reply, tokens, latency, rag_chunks = await run_agent(
        message=speech_result,
        channel="voice",
        conversation_id=conversation_id,
        contact_id=from_number or call_sid,
    )

    await broadcast({
        "type": "call_event",
        "data": {
            "event": "turn",
            "call_sid": call_sid,
            "user_said": speech_result,
            "agent_said": reply,
            "latency_ms": latency,
        },
    })

    base_url = request.base_url
    xml = _twiml_gather(reply, f"{base_url}voice/process")
    return Response(content=xml, media_type="application/xml")


# ─── Fin de llamada ───────────────────────────────────────────────────────────
@router.post("/status")
async def voice_status(request: Request):
    import time as time_module

    form = await request.form()
    await _check_twilio_signature(request, form)

    call_sid = str(form.get("CallSid", ""))
    call_status = str(form.get("CallStatus", ""))
    duration = int(form.get("CallDuration", 0) or 0)

    logger.info(f"[Voice] {call_sid} status={call_status} duration={duration}s")

    # ─── Llamadas salientes (voice_calls) — no afecta el flujo entrante ───────
    try:
        outbound_call = await db.get_voice_call_by_sid(call_sid) if call_sid else None
    except Exception as e:
        outbound_call = None
        logger.warning(f"[Voice] No se pudo consultar voice_call por sid: {e}")

    if outbound_call:
        voice_call_id = str(outbound_call["id"])
        updates: dict = {"status": call_status}
        if duration:
            updates["duration_seconds"] = duration
        if call_status == "completed":
            updates["ended_at"] = datetime.now(timezone.utc).isoformat()
        try:
            await db.update_voice_call_by_id(voice_call_id, updates)
        except Exception as e:
            logger.warning(f"[Voice] No se pudo actualizar voice_call {voice_call_id}: {e}")

        _call_turns.pop(voice_call_id, None)
        _no_speech_retry.discard(voice_call_id)

        await broadcast({
            "type": "call_event",
            "data": {
                "event": "outbound_status",
                "voice_call_id": voice_call_id,
                "call_sid": call_sid,
                "status": call_status,
                "duration": duration,
            },
        })

    conversation_id = _active_calls.pop(call_sid, None)
    _call_start.pop(call_sid, None)

    if conversation_id and call_status == "completed":
        # Actualizar conversación
        await db.update_conversation(conversation_id, {"status": "closed"})

        # Generar resumen con IA
        history = await db.get_history(conversation_id, limit=20)
        if history:
            summary_messages = [
                {"role": "system", "content": "Resume en 3 oraciones la siguiente conversación de llamada. Incluye: nombre del cliente si lo mencionó, procedimiento de interés, y próximo paso acordado. Responde solo en español."},
                {"role": "user", "content": "\n".join([f"{h['role'].upper()}: {h['content']}" for h in history])},
            ]
            summary, _, _ = await openrouter.ask(summary_messages, max_tokens=150)

            await db.upsert_lead(conversation_id, {
                "channel": "voice",
                "call_duration": duration,
                "summary": summary,
            })

        await broadcast({
            "type": "call_event",
            "data": {
                "event": "completed",
                "call_sid": call_sid,
                "duration": duration,
                "conversation_id": conversation_id,
            },
        })

    return Response(content="", media_type="text/plain")


# ═══════════════════════════════════════════════════════════════════════════
# ─── Flujo saliente (Twilio Voice) ─────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════

# ─── Disparo de llamada saliente ──────────────────────────────────────────────
@router.post("/call-request")
async def voice_call_request(payload: VoiceCallRequestIn):
    if not settings.voice_agent_enabled:
        raise HTTPException(status_code=400, detail="VOICE_AGENT_ENABLED está desactivado")
    if not settings.has_twilio_voice:
        raise HTTPException(status_code=400, detail="Twilio no está configurado (SID/token/número)")
    if not payload.phone:
        raise HTTPException(status_code=400, detail="phone es requerido")

    try:
        result = await create_voice_call_request(
            lead_id=payload.lead_id,
            conversation_id=payload.conversation_id,
            contact_id=payload.contact_id,
            phone=payload.phone,
            treatment_interest=payload.treatment_interest,
            reason=payload.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Voice] /voice/call-request falló: {e}")
        raise HTTPException(status_code=502, detail="No se pudo crear la llamada en Twilio")

    return {"ok": True, **result}


# ─── Llamada saliente contestada ──────────────────────────────────────────────
@router.post("/outbound")
async def voice_outbound(request: Request, voice_call_id: str = Query(...)):
    form = await request.form()
    await _check_twilio_signature(request, form)
    call_sid = str(form.get("CallSid", ""))

    voice_call = await db.get_voice_call_by_id(voice_call_id)
    if not voice_call:
        logger.warning(f"[Voice] /voice/outbound: voice_call_id no encontrado: {voice_call_id}")
        xml = _twiml_say_hangup("Lo siento, ocurrió un error. Hasta pronto.")
        return Response(content=xml, media_type="application/xml")

    updates: dict = {"status": "in-progress", "started_at": datetime.now(timezone.utc).isoformat()}
    if call_sid and not voice_call.get("call_sid"):
        updates["call_sid"] = call_sid
    await db.update_voice_call_by_id(voice_call_id, updates)

    _call_turns[voice_call_id] = 0
    _no_speech_retry.discard(voice_call_id)

    lead = await db.get_lead_by_id(voice_call["lead_id"]) if voice_call.get("lead_id") else None
    name = (lead or {}).get("name")
    treatment = voice_call.get("treatment_interest") or (lead or {}).get("interest")

    if name and treatment:
        greeting = (
            f"Hola {name}, soy Sofía de Elite Beauty. Te llamo porque aceptaste que te "
            f"orientara sobre {treatment}. ¿Tienes un minuto?"
        )
    elif treatment:
        greeting = f"Hola, soy Sofía de Elite Beauty. Te llamo por tu interés en {treatment}. ¿Tienes un minuto?"
    elif name:
        greeting = f"Hola {name}, soy Sofía de Elite Beauty. ¿Tienes un minuto para orientarte?"
    else:
        greeting = "Hola, soy Sofía de Elite Beauty. Te llamo para orientarte sobre nuestros tratamientos. ¿Tienes un minuto?"

    await broadcast({
        "type": "call_event",
        "data": {"event": "outbound_answered", "voice_call_id": voice_call_id, "call_sid": call_sid},
    })

    action = f"{request.base_url}voice/gather?voice_call_id={voice_call_id}"
    xml = _twiml_outbound_gather(greeting, action)
    return Response(content=xml, media_type="application/xml")


# ─── Turno de conversación en llamada saliente ───────────────────────────────
@router.post("/gather")
async def voice_gather_outbound(request: Request, voice_call_id: str = Query(...)):
    form = await request.form()
    await _check_twilio_signature(request, form)
    call_sid = str(form.get("CallSid", ""))
    speech_result = str(form.get("SpeechResult", "")).strip()

    voice_call = await db.get_voice_call_by_id(voice_call_id)
    if not voice_call and call_sid:
        voice_call = await db.get_voice_call_by_sid(call_sid)

    if not voice_call:
        logger.warning(f"[Voice] /voice/gather: voice_call no encontrado (id={voice_call_id}, sid={call_sid})")
        xml = _twiml_say_hangup("Lo siento, ocurrió un error. Hasta pronto.")
        return Response(content=xml, media_type="application/xml")

    vc_id = str(voice_call["id"])
    action = f"{request.base_url}voice/gather?voice_call_id={vc_id}"

    if not speech_result:
        if vc_id in _no_speech_retry:
            _no_speech_retry.discard(vc_id)
            xml = _twiml_say_hangup("No logré escucharte. Te contactaremos por WhatsApp. ¡Hasta pronto!")
            return Response(content=xml, media_type="application/xml")
        _no_speech_retry.add(vc_id)
        xml = _twiml_outbound_gather("Perdona, no te escuché bien. ¿Puedes repetir?", action)
        return Response(content=xml, media_type="application/xml")

    _no_speech_retry.discard(vc_id)
    turn_count = _call_turns.get(vc_id, 0) + 1
    _call_turns[vc_id] = turn_count

    if _is_closing_utterance(speech_result) or turn_count > _MAX_VOICE_TURNS:
        farewell = "Perfecto, muchas gracias por tu tiempo. Cualquier cosa seguimos por WhatsApp. ¡Que tengas un excelente día!"
        try:
            await db.update_voice_call_by_id(vc_id, {
                "last_user_utterance": speech_result,
                "last_agent_response": farewell,
            })
        except Exception as e:
            logger.warning(f"[Voice] No se pudo actualizar voice_call {vc_id}: {e}")

        await broadcast({
            "type": "call_event",
            "data": {"event": "closing", "voice_call_id": vc_id, "call_sid": call_sid, "turn_count": turn_count},
        })
        xml = _twiml_say_hangup(farewell)
        return Response(content=xml, media_type="application/xml")

    lead = await db.get_lead_by_id(voice_call["lead_id"]) if voice_call.get("lead_id") else None

    conversation_id = voice_call.get("conversation_id")
    if not conversation_id:
        conv = await db.get_or_create_conversation("voice", voice_call.get("phone") or call_sid)
        conversation_id = str(conv["id"])
        try:
            await db.update_voice_call_by_id(vc_id, {"conversation_id": conversation_id})
        except Exception as e:
            logger.warning(f"[Voice] No se pudo asociar conversation_id a voice_call {vc_id}: {e}")

    voice_context = {
        "lead_name": (lead or {}).get("name"),
        "treatment_interest": voice_call.get("treatment_interest") or (lead or {}).get("interest"),
        "whatsapp_summary": (lead or {}).get("summary"),
    }

    reply, tokens, latency, rag_chunks = await run_agent(
        message=speech_result,
        channel="voice",
        conversation_id=conversation_id,
        contact_id=voice_call.get("phone") or call_sid,
        voice_context=voice_context,
    )

    try:
        await db.update_voice_call_by_id(vc_id, {
            "last_user_utterance": speech_result,
            "last_agent_response": reply,
        })
    except Exception as e:
        logger.warning(f"[Voice] No se pudo actualizar voice_call {vc_id}: {e}")

    await broadcast({
        "type": "call_event",
        "data": {
            "event": "turn",
            "voice_call_id": vc_id,
            "call_sid": call_sid,
            "user_said": speech_result,
            "agent_said": reply,
            "turn_count": turn_count,
            "latency_ms": latency,
        },
    })

    xml = _twiml_outbound_gather(reply, action)
    return Response(content=xml, media_type="application/xml")


# ─── Estado del agente de voz ─────────────────────────────────────────────────
@router.get("/health")
async def voice_health():
    return {
        "voice_agent_enabled": settings.voice_agent_enabled,
        "twilio_configured": settings.has_twilio_voice,
        "public_base_url": settings.public_base_url,
        "voice_language": settings.twilio_voice_language,
    }
