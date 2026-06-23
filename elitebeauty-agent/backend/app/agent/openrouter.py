import httpx
import logging
import time
from app.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
TIMEOUT = 30.0
MAX_RETRIES = 2


async def ask(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 256,
) -> tuple[str, int, int]:
    """
    Returns: (reply_text, tokens_used, latency_ms)
    """
    model = model or settings.openrouter_model
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": settings.your_site_url,
        "X-Title": settings.your_site_name,
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    for attempt in range(MAX_RETRIES + 1):
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    f"{OPENROUTER_BASE}/chat/completions",
                    headers=headers,
                    json=payload,
                )
            latency_ms = int((time.monotonic() - t0) * 1000)

            if resp.status_code != 200:
                logger.error(f"OpenRouter error {resp.status_code}: {resp.text[:200]}")
                if attempt < MAX_RETRIES:
                    continue
                return "Lo siento, tuve un problema técnico. Intenta de nuevo. 🙏", 0, latency_ms

            data = resp.json()
            reply = data["choices"][0]["message"]["content"].strip()
            tokens = data.get("usage", {}).get("total_tokens", 0)
            logger.info(f"OpenRouter [{model}] {latency_ms}ms | {tokens} tokens")
            return reply, tokens, latency_ms

        except httpx.TimeoutException:
            latency_ms = int((time.monotonic() - t0) * 1000)
            logger.warning(f"OpenRouter timeout intento {attempt + 1}")
            if attempt < MAX_RETRIES:
                continue
            return "La respuesta tardó demasiado. Intenta con una pregunta más corta. ⏱️", 0, latency_ms

        except Exception as e:
            latency_ms = int((time.monotonic() - t0) * 1000)
            logger.error(f"OpenRouter exception: {e}")
            return "Error de conexión con el asistente. Inténtalo nuevamente. 🙏", 0, latency_ms

    return "No pude procesar tu solicitud. Escríbenos al +57 301 444 6646. 📞", 0, 0


async def health_check() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{OPENROUTER_BASE}/models",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            )
        return resp.status_code == 200
    except Exception:
        return False
