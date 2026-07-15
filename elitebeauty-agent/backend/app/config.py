from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_APP_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _APP_DIR.parent
_PROJECT_DIR = _BACKEND_DIR.parent
_ENV_FILES = (_PROJECT_DIR / ".env", _BACKEND_DIR / ".env")

_PLACEHOLDER_VALUES = {
    "sk-xxx",
    "sk-or-v1-xxx",
    "tvly-xxx",
    "xxx",
    "eyJxxx",
    "ACxxx",
    "+15551234567",
    "https://xxxx.supabase.co",
    "cambiar-en-produccion",
    "cambiar-en-produccion-generado-con-openssl-rand-hex-32",
}


def _has_real_value(value: str | None) -> bool:
    if not value:
        return False
    return value.strip() not in _PLACEHOLDER_VALUES


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── LLM Router ─────────────────────────────────────────────────────────────
    llm_provider: str = "openrouter"         # openrouter | anthropic
    chat_fallback_provider: str = "openrouter"

    # Pipeline flags (.env defaults; Supabase agent_config puede sobreescribir)
    chat_use_fallback: bool = True
    chat_use_enhancement: bool = False
    chat_use_judge: bool = False

    # Parámetros LLM
    chat_temperature: float = 0.2
    chat_top_p: float = 0.8
    chat_max_tokens: int = 900
    chat_timeout_ms: int = 45000
    chat_fallback_timeout_ms: int = 45000
    chat_enhancement_timeout_ms: int = 30000
    chat_judge_timeout_ms: int = 20000
    # Timeout corto específico para el canal de voz: Twilio deja de esperar la
    # respuesta del webhook mucho antes que un timeout de chat normal, así que
    # el LLM debe responder rápido o caer al fallback local (nunca colgar la llamada).
    voice_chat_timeout_ms: int = 10000

    # ── OpenRouter ──────────────────────────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "meta-llama/llama-3.1-8b-instruct:free"
    your_site_url: str = "https://elitebeauty.com.co"
    your_site_name: str = "Elite Beauty Agent"

    # Modelos OpenRouter por rol
    openrouter_primary_model: str = "openrouter/free"
    openrouter_fallback_model: str = "meta-llama/llama-3.1-8b-instruct:free"
    openrouter_enhancement_model: str = "openrouter/free"
    openrouter_judge_model: str = "openrouter/free"

    # ── Anthropic / Claude directo ──────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_model: str = "claude-3-5-sonnet-latest"

    # Modelos Anthropic por rol
    anthropic_primary_model: str = "claude-3-5-sonnet-latest"
    anthropic_fallback_model: str = "claude-3-5-haiku-latest"
    anthropic_enhancement_model: str = "claude-3-5-haiku-latest"
    anthropic_judge_model: str = "claude-3-5-haiku-latest"

    # ── OpenAI — opcional, solo si embeddings_provider=openai ─────────────────
    openai_api_key: str = ""

    # Embeddings — independiente del LLM de chat
    embeddings_provider: str = "local"   # local | openrouter | openai
    embeddings_model: str = ""           # vacío = default por proveedor
    embedding_dim: int = 384             # 384 para MiniLM local, 1536 para OpenAI/OR

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_wa_sandbox_number: str = "+14155238886"

    # Twilio Voice saliente (agente de llamadas)
    voice_agent_enabled: bool = False
    twilio_voice_language: str = "es-CO"
    twilio_voice_name: str = "Polly.Mia"
    # Validación de firma X-Twilio-Signature en webhooks (opcional, off por defecto en dev)
    twilio_validate_signature: bool = False

    # URLs
    public_base_url: str = "http://localhost:8000"
    wa_bridge_url: str = "http://wa_bridge:3001"
    cors_origins: str = "*"  # comma-separated list or "*" for any origin

    # App
    backend_port: int = 8000
    frontend_port: int = 3000
    secret_key: str = "cambiar-en-produccion"

    # Tavily (búsqueda web para RAG mixto)
    tavily_api_key: str = ""

    # Defaults (pueden sobreescribirse desde agent_config en DB)
    rag_top_k: int = 5
    max_history: int = 6
    cooldown_ms: int = 2000

    @property
    def has_openrouter(self) -> bool:
        return _has_real_value(self.openrouter_api_key)

    @property
    def has_anthropic(self) -> bool:
        return _has_real_value(self.anthropic_api_key)

    @property
    def has_openai_embeddings(self) -> bool:
        return _has_real_value(self.openai_api_key)

    @property
    def has_embeddings(self) -> bool:
        """True si el motor de embeddings configurado está disponible."""
        provider = (self.embeddings_provider or "local").lower().strip()
        if provider == "local":
            return True
        if provider == "openrouter":
            return self.has_openrouter
        if provider == "openai":
            return self.has_openai_embeddings
        return False

    @property
    def has_supabase(self) -> bool:
        return _has_real_value(self.supabase_url) and _has_real_value(self.supabase_service_key)

    @property
    def has_tavily(self) -> bool:
        return _has_real_value(self.tavily_api_key)

    @property
    def has_twilio(self) -> bool:
        return _has_real_value(self.twilio_account_sid) and _has_real_value(self.twilio_auth_token)

    @property
    def has_twilio_voice(self) -> bool:
        """True si hay credenciales Twilio completas para originar llamadas salientes."""
        return (
            _has_real_value(self.twilio_account_sid)
            and _has_real_value(self.twilio_auth_token)
            and _has_real_value(self.twilio_phone_number)
        )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
