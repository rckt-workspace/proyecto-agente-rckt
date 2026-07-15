import asyncio
import logging
import re
from app.agent import llm_client, rag
from app.agent.prompts import build_whatsapp_prompt, build_voice_prompt
from app.db import supabase_client as db
from app.config import settings

logger = logging.getLogger(__name__)

# Patrones para extraer datos del lead de la conversación
_LEAD_PATTERNS = {
    "name": [
        r"(?:me llamo|soy|mi nombre es)\s+([A-ZÁÉÍÓÚÜÑa-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑa-záéíóúüñ]+)?)",
    ],
    "interest": [
        r"(?:interesad[ao] en|quiero|necesito|me gustaría|para)\s+(.{5,40}?)(?:\.|,|$)",
        r"(?:tensamax|hydrash|o2toderm|removall|celulitis|facial|corporal)",
    ],
    "phone": [
        r"(?:cel|celular|teléfono|tel|número)[\s:]*(\+?57[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4}|\d{10})",
        r"\b(3\d{9})\b",
    ],
}


def _extract_lead_data(text: str) -> dict:
    extracted = {}
    text_lower = text.lower()

    name_match = re.search(
        r"(?:me llamo|soy|mi nombre es)\s+([A-ZÁÉÍÓÚÜÑa-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑa-záéíóúüñ]+)?)",
        text,
        re.IGNORECASE,
    )
    if name_match:
        extracted["name"] = name_match.group(1).title()

    for proc in ["tensamax", "hydrash", "o2toderm", "removall", "depilación"]:
        if proc in text_lower:
            extracted["interest"] = proc.capitalize()
            break

    phone_match = re.search(r"\b(3\d{9})\b", text)
    if phone_match:
        extracted["phone"] = phone_match.group(1)

    return extracted


async def run_agent(
    message: str,
    channel: str,
    conversation_id: str,
    contact_id: str,
    model_override: str | None = None,
    voice_context: dict | None = None,
) -> tuple[str, int, int, int]:
    """
    Procesa un mensaje a través del agente.
    Returns: (reply, tokens_used, latency_ms, rag_chunks)
    """
    # Configuración desde DB (en paralelo, no hay dependencia entre ambas)
    if channel == "voice":
        # En voz se omite el RAG por completo: el cálculo de embeddings locales
        # (sentence-transformers/torch) es justo el tipo de operación pesada que
        # hace que el turno tarde más de lo que Twilio espera por el webhook.
        # El prompt de voz ya trae un resumen del negocio embebido.
        max_hist = int(await db.get_config_value("max_history") or settings.max_history)
        rag_context, rag_chunks = "", 0
    else:
        max_hist_raw, top_k_raw = await asyncio.gather(
            db.get_config_value("max_history"),
            db.get_config_value("rag_top_k"),
        )
        max_hist = int(max_hist_raw or settings.max_history)
        top_k = int(top_k_raw or settings.rag_top_k)
        rag_context, rag_chunks = await rag.get_context(message, top_k=top_k)

    # 2. System prompt según canal
    if channel == "voice":
        system_prompt = build_voice_prompt(rag_context, voice_context)
    else:
        system_prompt = build_whatsapp_prompt(rag_context)

    # 3. Historial de conversación desde DB
    history = await db.get_history(conversation_id, limit=max_hist)

    # 4. Construir mensajes para el LLM
    messages = [{"role": "system", "content": system_prompt}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message[:2000]})

    # 5. LLM router: primary → fallback → cross-provider → respuesta local segura
    reply, tokens, latency = await llm_client.generate_chat_response(
        messages=messages,
        channel=channel,
        model_override=model_override,
    )

    # 6. Guardar mensajes en DB (en paralelo, son inserts independientes)
    await asyncio.gather(
        db.save_message(conversation_id, "user", message),
        db.save_message(conversation_id, "assistant", reply, tokens_used=tokens, latency_ms=latency),
    )

    # 7. Intentar extraer datos del lead
    lead_data = _extract_lead_data(message)
    if lead_data:
        lead_data["channel"] = channel
        try:
            await db.upsert_lead(conversation_id, lead_data)
        except Exception as e:
            logger.warning(f"No se pudo actualizar lead: {e}")

    return reply, tokens, latency, rag_chunks
