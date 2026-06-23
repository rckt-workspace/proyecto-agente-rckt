import logging
from fastapi import APIRouter, Request
from fastapi.responses import Response
from twilio.twiml.voice_response import VoiceResponse, Gather

from app.agent.core import run_agent
from app.agent import openrouter
from app.agent.prompts import build_voice_prompt
from app.db import supabase_client as db
from app.api.ws import broadcast

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])

# call_sid → conversation_id en memoria (se persiste en DB al colgar)
_active_calls: dict[str, str] = {}
# call_sid → start_time (unix timestamp)
_call_start: dict[str, float] = {}


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
    call_sid = str(form.get("CallSid", ""))
    call_status = str(form.get("CallStatus", ""))
    duration = int(form.get("CallDuration", 0) or 0)

    logger.info(f"[Voice] {call_sid} status={call_status} duration={duration}s")

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
