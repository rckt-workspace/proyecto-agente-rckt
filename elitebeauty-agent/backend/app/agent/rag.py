import asyncio
import logging
from app.config import settings
from app.db.vector import search_similar

logger = logging.getLogger(__name__)


async def search_internal(query: str, top_k: int) -> tuple[str, int]:
    """Busca chunks relevantes en pgvector (base de conocimiento interna)."""
    if not settings.has_embeddings or not settings.has_supabase:
        return "", 0
    try:
        results = await search_similar(query, top_k=top_k)
        if not results:
            return "", 0
        chunks = [r["chunk"] for r in results if r.get("similarity", 0) > 0.4]
        if not chunks:
            return "", 0
        logger.debug(f"RAG interno: {len(chunks)} chunks para '{query[:60]}'")
        return "\n---\n".join(chunks), len(chunks)
    except Exception as e:
        logger.error(f"RAG interno error: {e}")
        return "", 0


async def search_web(query: str) -> str:
    """Busca información complementaria en internet via Tavily."""
    if not settings.has_tavily:
        return ""
    try:
        from tavily import AsyncTavilyClient  # import lazy para no romper si no está instalado

        client = AsyncTavilyClient(api_key=settings.tavily_api_key)
        scoped_query = f"{query} estética belleza tratamiento piel"
        response = await client.search(
            scoped_query,
            max_results=3,
            search_depth="basic",
            include_answer=True,
        )
        parts = []
        if response.get("answer"):
            parts.append(response["answer"])
        for r in response.get("results", [])[:3]:
            if r.get("content"):
                parts.append(r["content"][:500])
        result = "\n---\n".join(parts) if parts else ""
        logger.debug(f"RAG web: {'respuesta obtenida' if result else 'sin resultados'} para '{query[:60]}'")
        return result
    except Exception as e:
        logger.error(f"Tavily error: {e}")
        return ""


_RAG_TIMEOUT = 10.0  # segundos máximos por fuente RAG


async def _safe_search_internal(query: str, k: int) -> tuple[str, int]:
    try:
        return await asyncio.wait_for(search_internal(query, k), timeout=_RAG_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning(f"RAG interno: timeout ({_RAG_TIMEOUT}s) — continuando sin contexto interno")
        return "", 0


async def _safe_search_web(query: str) -> str:
    try:
        return await asyncio.wait_for(search_web(query), timeout=_RAG_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning(f"RAG web: timeout ({_RAG_TIMEOUT}s) — continuando sin contexto web")
        return ""


async def get_context(query: str, top_k: int | None = None, include_web: bool = True) -> tuple[str, int]:
    """
    RAG mixto: lanza búsqueda interna (pgvector) y web (Tavily) en paralelo.
    Combina los resultados etiquetando la fuente de cada sección.
    include_web=False omite Tavily por completo (usado en voz, donde cada
    segundo cuenta antes de que Twilio abandone la espera del webhook).
    Returns: (context_str, num_internal_chunks)
    """
    k = top_k or settings.rag_top_k

    if include_web:
        (internal_ctx, num_chunks), web_ctx = await asyncio.gather(
            _safe_search_internal(query, k),
            _safe_search_web(query),
        )
    else:
        internal_ctx, num_chunks = await _safe_search_internal(query, k)
        web_ctx = ""

    sections = []
    if internal_ctx:
        sections.append(f"=== CONOCIMIENTO ELITE BEAUTY ===\n{internal_ctx}")
    if web_ctx:
        sections.append(f"=== REFERENCIA WEB (contexto general) ===\n{web_ctx}")

    combined = "\n\n".join(sections)
    logger.info(f"RAG mixto: {num_chunks} chunks internos | web={'sí' if web_ctx else 'no'}")
    return combined, num_chunks
