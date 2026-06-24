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

    # OpenRouter
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.1-8b-instruct:free"
    your_site_url: str = "https://elitebeauty.com.co"
    your_site_name: str = "Elite Beauty Agent"

    # OpenAI (solo embeddings)
    openai_api_key: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Twilio
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_wa_sandbox_number: str = "+14155238886"

    # URLs
    public_base_url: str = "http://localhost:8000"
    wa_bridge_url: str = "http://wa_bridge:3001"

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
    def has_openai_embeddings(self) -> bool:
        return _has_real_value(self.openai_api_key)

    @property
    def has_supabase(self) -> bool:
        return _has_real_value(self.supabase_url) and _has_real_value(self.supabase_service_key)

    @property
    def has_tavily(self) -> bool:
        return _has_real_value(self.tavily_api_key)

    @property
    def has_twilio(self) -> bool:
        return _has_real_value(self.twilio_account_sid) and _has_real_value(self.twilio_auth_token)


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
