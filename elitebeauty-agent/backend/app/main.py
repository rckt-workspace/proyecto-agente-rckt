import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import ws
from app.api import routes_chat, routes_leads, routes_analytics, routes_docs, routes_config, routes_conversations, routes_wa
from app.channels import whatsapp, voice

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
    return {
        "status": "ok",
        "openrouter": "online" if or_ok else "offline",
        "model": settings.openrouter_model,
    }
