from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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

    # Defaults (pueden sobreescribirse desde agent_config en DB)
    rag_top_k: int = 5
    max_history: int = 6
    cooldown_ms: int = 2000


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
