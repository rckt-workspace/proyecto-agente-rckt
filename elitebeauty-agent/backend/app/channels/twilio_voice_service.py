import logging
import re

from twilio.rest import Client
from twilio.request_validator import RequestValidator

from app.config import settings

logger = logging.getLogger(__name__)

_STATUS_CALLBACK_EVENTS = ["initiated", "ringing", "answered", "completed"]

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        # No loguear settings.twilio_auth_token bajo ninguna circunstancia.
        _client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    return _client


def normalize_phone_for_twilio(phone: str) -> str:
    """Normaliza un número a formato E.164, asumiendo Colombia (+57) por defecto."""
    if not phone:
        raise ValueError("Número de teléfono vacío")

    cleaned = re.sub(r"[\s\-()]", "", phone.strip())

    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if not digits.isdigit():
            raise ValueError(f"Número inválido: {phone}")
        return cleaned

    if not cleaned.isdigit():
        raise ValueError(f"Número inválido: {phone}")

    if cleaned.startswith("57") and len(cleaned) == 12:
        return f"+{cleaned}"

    if cleaned.startswith("3") and len(cleaned) == 10:
        return f"+57{cleaned}"

    if len(cleaned) >= 10:
        return f"+{cleaned}"

    raise ValueError(f"Número inválido: {phone}")


def create_outbound_call(to: str, voice_call_id: str) -> str:
    """Origina una llamada saliente vía Twilio REST API. Devuelve el CallSid."""
    base_url = settings.public_base_url.rstrip("/")
    client = _get_client()

    call = client.calls.create(
        to=to,
        from_=settings.twilio_phone_number,
        url=f"{base_url}/voice/outbound?voice_call_id={voice_call_id}",
        status_callback=f"{base_url}/voice/status",
        status_callback_event=_STATUS_CALLBACK_EVENTS,
        status_callback_method="POST",
    )
    logger.info(f"[TwilioVoice] Llamada saliente creada call_sid={call.sid} voice_call_id={voice_call_id}")
    return call.sid


def verify_twilio_signature(url: str, params: dict, signature: str | None) -> bool:
    """
    Verifica X-Twilio-Signature. Si la validación está deshabilitada (dev) o
    Twilio no está configurado, no bloquea la petición (devuelve True).
    """
    if not settings.twilio_validate_signature:
        return True
    if not settings.has_twilio_voice:
        logger.warning("[TwilioVoice] Firma no verificable: Twilio no configurado")
        return True
    if not signature:
        return False

    validator = RequestValidator(settings.twilio_auth_token)
    return validator.validate(url, params, signature)
