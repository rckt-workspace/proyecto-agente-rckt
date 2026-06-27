import logging
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestAPIError

from app.config import settings
from app.api import ws
from app.api import routes_chat, routes_leads, routes_analytics, routes_docs, routes_config, routes_conversations, routes_wa
from app.channels import whatsapp, voice
from app.db.supabase_client import DatabaseNotConfigured, is_configured as supabase_is_configured

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Elite Beauty Agent iniciando...")
    yield
    logger.info("Elite Beauty Agent detenido.")


app = FastAPI(
    title="Elite Beauty Agent API",
    version="1.0.0",
    description="Agente IA omnicanal para Elite Beauty — WhatsApp + Voz + RAG",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Rutas ────────────────────────────────────────────────────────────────────
app.include_router(ws.router)
app.include_router(routes_chat.router)
app.include_router(routes_leads.router)
app.include_router(routes_analytics.router)
app.include_router(routes_docs.router)
app.include_router(routes_config.router)
app.include_router(routes_conversations.router)
app.include_router(routes_wa.router)
app.include_router(whatsapp.router)
app.include_router(voice.router)


@app.exception_handler(DatabaseNotConfigured)
async def database_not_configured_handler(_request: Request, exc: DatabaseNotConfigured):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(PostgrestAPIError)
async def postgrest_error_handler(_request: Request, _exc: PostgrestAPIError):
    return JSONResponse(
        status_code=502,
        content={
            "detail": (
                "Supabase rechazó la operación. Revisa credenciales, permisos "
                "y que la migración supabase/migrations/001_initial.sql esté aplicada."
            )
        },
    )


@app.exception_handler(httpx.HTTPError)
async def http_error_handler(_request: Request, _exc: httpx.HTTPError):
    return JSONResponse(
        status_code=503,
        content={"detail": "Servicio externo no disponible. Intenta de nuevo en unos segundos."},
    )


@app.get("/")
async def root():
    return {
        "service": "Elite Beauty Agent API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health():
    from app.agent.openrouter import health_check
    or_ok = await health_check()
    supabase_ok = supabase_is_configured()
    status = "ok" if (or_ok or settings.has_anthropic) and supabase_ok else "degraded"
    return {
        "status": status,
        "llm_provider": settings.llm_provider,
        "openrouter": "online" if or_ok else ("not_configured" if not settings.has_openrouter else "offline"),
        "anthropic": "configured" if settings.has_anthropic else "not_configured",
        "supabase": "configured" if supabase_ok else "not_configured",
        "twilio": "configured" if settings.has_twilio else "not_configured",
        "openai_embeddings": "configured" if settings.has_openai_embeddings else "not_configured",
        "tavily": "configured" if settings.has_tavily else "not_configured",
    }
