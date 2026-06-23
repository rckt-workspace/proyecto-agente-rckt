import logging
from app.config import settings
from app.db.vector import search_similar

logger = logging.getLogger(__name__)


async def get_context(query: str, top_k: int | None = None) -> tuple[str, int]:
    """
    Busca chunks relevantes en pgvector y devuelve (contexto_str, num_chunks).
    Retorna ("", 0) si OpenAI key no está configurada o no hay resultados.
    """
    if not settings.openai_api_key:
        return "", 0

    k = top_k or settings.rag_top_k
    try:
        results = await search_similar(query, top_k=k)
        if not results:
            return "", 0

        chunks = [r["chunk"] for r in results if r.get("similarity", 0) > 0.4]
        if not chunks:
            return "", 0

        context = "\n---\n".join(chunks)
        logger.debug(f"RAG: {len(chunks)} chunks relevantes para '{query[:60]}'")
        return context, len(chunks)

    except Exception as e:
        logger.error(f"RAG error: {e}")
        return "", 0
