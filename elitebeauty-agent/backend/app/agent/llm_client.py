"""
LLM Router — primary / fallback-same-provider / fallback-cross-provider / local safe.

Pipeline per request:
  1. Try primary_provider / primary_model
  2. If fails → try primary_provider / fallback_model  (same provider)
  3. If fails → try fallback_provider / primary_model  (cross provider)
  4. If all fail → return _LOCAL_FALLBACK (bot never goes silent)
  Optional post-processing:
  5. enhancement  (chat_use_enhancement=true)  — polish tone
  6. judge        (chat_use_judge=true)         — safety check
"""

import json
import httpx
import logging
import time
from app.config import settings
from app.db import supabase_client as db

logger = logging.getLogger(__name__)

# ─── Fallback strings ─────────────────────────────────────────────────────────

_LOCAL_FALLBACK = (
    "En este momento tengo dificultad para conectarme con el asistente IA, "
    "pero el equipo de Elite Beauty puede ayudarte de inmediato. "
    "¿Me compartes tu nombre, el tratamiento de interés y tu disponibilidad? 📋"
)

_JUDGE_SAFE_FALLBACK = (
    "Gracias por tu interés en nuestros tratamientos. "
    "Para darte información precisa sobre precios y disponibilidad, "
    "contáctanos directamente al +57 301 444 6646 o a contacto@elitebeauty.com.co. "
    "Con gusto te asesoramos. ✨"
)

# ─── Config loading ───────────────────────────────────────────────────────────

async def _load_cfg() -> dict[str, str]:
    """Load all agent_config from Supabase in a single call. Returns {} on error."""
    try:
        rows = await db.get_all_config()
        cfg = {r["key"]: (r["value"] or "").strip() for r in rows if r.get("key")}
        logger.info(f"[TRACE] agent_config cargado desde Supabase: {len(cfg)} claves → {list(cfg.keys())}")
        return cfg
    except Exception as e:
        logger.warning(f"[TRACE] agent_config no disponible, usando .env: {e}")
        return {}


def _v(cfg: dict, key: str, fallback: str = "") -> str:
    """Read key from cfg dict with an optional fallback."""
    supabase_val = cfg.get(key, "").strip()
    if supabase_val:
        logger.debug(f"[TRACE] cfg[{key}] = '{supabase_val}' (fuente: Supabase)")
        return supabase_val
    if fallback:
        logger.debug(f"[TRACE] cfg[{key}] = '{fallback}' (fuente: .env/default)")
    return fallback


# ─── Provider helpers ─────────────────────────────────────────────────────────

def _provider_ready(provider: str) -> bool:
    if provider == "anthropic":
        return settings.has_anthropic
    return settings.has_openrouter


def _primary_model(provider: str, cfg: dict) -> str:
    if provider == "anthropic":
        return _v(cfg, "anthropic_primary_model", settings.anthropic_primary_model)
    # Backward compat: openrouter_primary_model → openrouter_model → model → .env default
    return (
        _v(cfg, "openrouter_primary_model")
        or _v(cfg, "openrouter_model")
        or _v(cfg, "model")
        or settings.openrouter_primary_model
    )


def _fallback_model(provider: str, cfg: dict) -> str:
    if provider == "anthropic":
        return _v(cfg, "anthropic_fallback_model", settings.anthropic_fallback_model)
    return _v(cfg, "openrouter_fallback_model", settings.openrouter_fallback_model)


def _enhancement_model(provider: str, cfg: dict) -> str:
    if provider == "anthropic":
        return _v(cfg, "anthropic_enhancement_model", settings.anthropic_enhancement_model)
    return _v(cfg, "openrouter_enhancement_model", settings.openrouter_enhancement_model)


def _judge_model(provider: str, cfg: dict) -> str:
    if provider == "anthropic":
        return _v(cfg, "anthropic_judge_model", settings.anthropic_judge_model)
    return _v(cfg, "openrouter_judge_model", settings.openrouter_judge_model)


def _build_chain(
    provider: str,
    fallback_provider: str,
    use_fallback: bool,
    cfg: dict,
    model_override: str | None,
) -> list[tuple[str, str]]:
    """Return ordered list of (provider, model) to try."""
    chain: list[tuple[str, str]] = []

    if _provider_ready(provider):
        prim = model_override or _primary_model(provider, cfg)
        chain.append((provider, prim))
        if use_fallback:
            fb = _fallback_model(provider, cfg)
            if fb and fb != prim:
                chain.append((provider, fb))

    if (
        use_fallback
        and fallback_provider
        and fallback_provider != provider
        and _provider_ready(fallback_provider)
    ):
        fp = _primary_model(fallback_provider, cfg)
        if fp:
            chain.append((fallback_provider, fp))

    return chain


# ─── Low-level API callers ────────────────────────────────────────────────────

async def _call_openrouter(
    model: str,
    messages: list[dict],
    temperature: float,
    top_p: float,
    max_tokens: int,
    timeout: float,
) -> tuple[str, int, int]:
    base = (settings.openrouter_base_url or "https://openrouter.ai/api/v1").rstrip("/")
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
        "top_p": top_p,
        "max_tokens": max_tokens,
    }
    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base}/chat/completions", headers=headers, json=payload)
    latency_ms = int((time.monotonic() - t0) * 1000)
    if not resp.is_success:
        logger.error(
            f"[TRACE] OpenRouter HTTP {resp.status_code} para modelo='{model}' | "
            f"body: {resp.text[:500]}"
        )
    resp.raise_for_status()
    data = resp.json()
    reply = data["choices"][0]["message"]["content"].strip()
    tokens = data.get("usage", {}).get("total_tokens", 0)
    logger.info(f"LLM openrouter [{model}] {latency_ms}ms | {tokens} tok")
    return reply, tokens, latency_ms


async def _call_anthropic(
    model: str,
    messages: list[dict],
    temperature: float,
    top_p: float,
    max_tokens: int,
    timeout: float,
) -> tuple[str, int, int]:
    base = (settings.anthropic_base_url or "https://api.anthropic.com").rstrip("/")
    system_content = ""
    chat_messages: list[dict] = []
    for msg in messages:
        if msg["role"] == "system":
            system_content = msg["content"]
        else:
            chat_messages.append({"role": msg["role"], "content": msg["content"]})
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload: dict = {
        "model": model,
        "messages": chat_messages,
        "temperature": temperature,
        "top_p": top_p,
        "max_tokens": max_tokens,
    }
    if system_content:
        payload["system"] = system_content
    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{base}/v1/messages", headers=headers, json=payload)
    latency_ms = int((time.monotonic() - t0) * 1000)
    if not resp.is_success:
        logger.error(
            f"[TRACE] Anthropic HTTP {resp.status_code} para modelo='{model}' | "
            f"body: {resp.text[:500]}"
        )
    resp.raise_for_status()
    data = resp.json()
    reply = data["content"][0]["text"].strip()
    usage = data.get("usage", {})
    tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
    logger.info(f"LLM anthropic [{model}] {latency_ms}ms | {tokens} tok")
    return reply, tokens, latency_ms


async def _call(
    provider: str,
    model: str,
    messages: list[dict],
    temperature: float,
    top_p: float,
    max_tokens: int,
    timeout_ms: int,
) -> tuple[str, int, int] | None:
    """Dispatch to the right provider. Returns None on any failure."""
    timeout = timeout_ms / 1000.0
    try:
        if provider == "anthropic":
            return await _call_anthropic(model, messages, temperature, top_p, max_tokens, timeout)
        return await _call_openrouter(model, messages, temperature, top_p, max_tokens, timeout)
    except Exception as e:
        logger.warning(f"LLM call failed [{provider}/{model}]: {type(e).__name__}: {e}")
        return None


# ─── Enhancement ──────────────────────────────────────────────────────────────

_ENHANCE_SYSTEM = (
    "Eres un editor de respuestas para Sofia, asistente virtual de Elite Beauty. "
    "Mejora la claridad, calidez y cierre comercial de la respuesta en español colombiano. "
    "REGLAS ESTRICTAS: No inventes precios. No inventes tratamientos. "
    "No agregues afirmaciones médicas. Solo mejora el tono. "
    "Responde ÚNICAMENTE con el texto mejorado, sin explicaciones ni prefijos."
)


async def _enhance(
    original: str,
    provider: str,
    cfg: dict,
    temperature: float,
    top_p: float,
) -> str:
    model = _enhancement_model(provider, cfg)
    if not model:
        return original
    msgs = [
        {"role": "system", "content": _ENHANCE_SYSTEM},
        {"role": "user", "content": f"Mejora esta respuesta del agente:\n\n{original}"},
    ]
    result = await _call(provider, model, msgs, temperature, top_p, 512, settings.chat_enhancement_timeout_ms)
    if result:
        enhanced = result[0]
        if len(enhanced) > 20:
            logger.info("Enhancement applied")
            return enhanced
    return original


# ─── Judge ────────────────────────────────────────────────────────────────────

_JUDGE_SYSTEM = """Eres un evaluador de calidad para respuestas de Sofia, asistente de Elite Beauty.
Analiza la respuesta del agente. Responde SOLO con JSON válido (sin markdown):
{"approved": bool, "reason": "motivo breve si rechazas"}

Rechaza SOLO si:
- Menciona un precio específico en moneda que no venga de la base de conocimiento
- Hace afirmaciones médicas garantizadas ("cura", "elimina definitivamente")
- Es ofensiva o completamente fuera de tema

En caso de duda: aprueba. El objetivo es solo bloquear respuestas claramente dañinas."""


async def _judge(
    response: str,
    messages: list[dict],
    provider: str,
    cfg: dict,
) -> str:
    model = _judge_model(provider, cfg)
    if not model:
        return response

    user_msg = next(
        (m["content"] for m in reversed(messages) if m["role"] == "user"),
        "",
    )
    judge_msgs = [
        {"role": "system", "content": _JUDGE_SYSTEM},
        {
            "role": "user",
            "content": f"Mensaje del usuario:\n{user_msg[:300]}\n\nRespuesta a evaluar:\n{response}",
        },
    ]
    result = await _call(provider, model, judge_msgs, 0.1, 0.9, 200, settings.chat_judge_timeout_ms)
    if not result:
        return response

    try:
        verdict = json.loads(result[0])
        if not verdict.get("approved", True):
            logger.warning(f"Judge REJECTED — reason: {verdict.get('reason', '?')}")
            return _JUDGE_SAFE_FALLBACK
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass

    return response


# ─── Public interface ─────────────────────────────────────────────────────────

async def generate_chat_response(
    messages: list[dict],
    channel: str = "whatsapp",
    model_override: str | None = None,
) -> tuple[str, int, int]:
    """
    Full LLM router. Reads config from Supabase agent_config with .env fallback.
    Returns: (reply, tokens_used, latency_ms)
    """
    cfg = await _load_cfg()

    # ── Router config ──────────────────────────────────────────────────────────
    provider = _v(cfg, "llm_provider", settings.llm_provider or "openrouter")
    fallback_provider = _v(cfg, "chat_fallback_provider", settings.chat_fallback_provider or "openrouter")

    use_fallback = _v(cfg, "chat_use_fallback", str(settings.chat_use_fallback)).lower() == "true"
    use_enhancement = _v(cfg, "chat_use_enhancement", str(settings.chat_use_enhancement)).lower() == "true"
    use_judge = _v(cfg, "chat_use_judge", str(settings.chat_use_judge)).lower() == "true"

    try:
        temperature = float(_v(cfg, "chat_temperature", str(settings.chat_temperature)))
    except ValueError:
        temperature = settings.chat_temperature

    try:
        top_p = float(_v(cfg, "chat_top_p", str(settings.chat_top_p)))
    except ValueError:
        top_p = settings.chat_top_p

    # Voice responses must stay concise regardless of config
    if channel == "voice":
        max_tokens = 150
    else:
        try:
            max_tokens = int(_v(cfg, "chat_max_tokens", str(settings.chat_max_tokens)))
        except ValueError:
            max_tokens = settings.chat_max_tokens

    timeout_ms = settings.chat_timeout_ms
    fallback_timeout_ms = settings.chat_fallback_timeout_ms

    # ── Build call chain ───────────────────────────────────────────────────────
    chain = _build_chain(provider, fallback_provider, use_fallback, cfg, model_override)

    logger.info(
        f"[TRACE] Router resuelto → provider='{provider}' "
        f"fallback_provider='{fallback_provider}' "
        f"use_fallback={use_fallback} | "
        f"anthropic_ready={_provider_ready('anthropic')} "
        f"openrouter_ready={_provider_ready('openrouter')} | "
        f"chain={chain}"
    )

    if not chain:
        logger.error("[TRACE] No hay ningún proveedor LLM configurado con credenciales válidas — revisá ANTHROPIC_API_KEY y OPENROUTER_API_KEY en .env")
        return _LOCAL_FALLBACK, 0, 0

    # ── Execute chain ──────────────────────────────────────────────────────────
    reply: str | None = None
    total_tokens = 0
    total_latency = 0
    used_provider = provider

    for i, (prov, model) in enumerate(chain):
        t_ms = timeout_ms if i == 0 else fallback_timeout_ms
        logger.info(f"Router attempt {i + 1}/{len(chain)}: {prov}/{model}")
        result = await _call(prov, model, messages, temperature, top_p, max_tokens, t_ms)
        if result is not None:
            reply, total_tokens, total_latency = result
            used_provider = prov
            break

    if reply is None:
        logger.warning("Router: todos los providers fallaron — respuesta local de seguridad")
        return _LOCAL_FALLBACK, 0, 0

    # ── Enhancement ────────────────────────────────────────────────────────────
    if use_enhancement and channel != "voice":
        reply = await _enhance(reply, used_provider, cfg, temperature, top_p)

    # ── Judge ──────────────────────────────────────────────────────────────────
    if use_judge:
        reply = await _judge(reply, messages, used_provider, cfg)

    return reply, total_tokens, total_latency
