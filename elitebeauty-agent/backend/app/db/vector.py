import asyncio
import logging
from typing import Any

from app.config import settings
from app.db.supabase_client import get_client

logger = logging.getLogger(__name__)

# Lazy-loaded provider state — se inicializa en el primer uso
_st_model: Any = None
_openai_client: Any = None


# ─── Provider helpers ─────────────────────────────────────────────────────────

def _provider() -> str:
    return (settings.embeddings_provider or "local").lower().strip()


def _model_name() -> str:
    if settings.embeddings_model:
        return settings.embeddings_model
    p = _provider()
    if p == "local":
        return "sentence-transformers/all-MiniLM-L6-v2"
    if p == "openrouter":
        return "openai/text-embedding-3-small"
    if p == "openai":
        return "text-embedding-3-small"
    return "sentence-transformers/all-MiniLM-L6-v2"


def embeddings_configured() -> bool:
    return settings.has_embeddings


# ─── Local embeddings (sentence-transformers) ─────────────────────────────────

def _load_st_model():
    global _st_model
    if _st_model is None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise RuntimeError(
                "sentence-transformers no está instalado. "
                "Ejecuta: pip install sentence-transformers"
            )
        model = _model_name()
        logger.info(f"Cargando modelo local de embeddings: {model}")
        _st_model = SentenceTransformer(model)
        logger.info(f"Modelo listo: {model} (dim={_st_model.get_sentence_embedding_dimension()})")
    return _st_model


def _embed_local(texts: list[str]) -> list[list[float]]:
    model = _load_st_model()
    vecs = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return [v.tolist() for v in vecs]


# ─── OpenRouter embeddings ────────────────────────────────────────────────────

def _embed_openrouter(texts: list[str]) -> list[list[float]]:
    import httpx

    resp = httpx.post(
        "https://openrouter.ai/api/v1/embeddings",
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "HTTP-Referer": settings.your_site_url,
            "X-Title": settings.your_site_name,
            "Content-Type": "application/json",
        },
        json={"model": _model_name(), "input": texts},
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return [item["embedding"] for item in sorted(data["data"], key=lambda x: x["index"])]


# ─── OpenAI embeddings ────────────────────────────────────────────────────────

def _embed_openai(texts: list[str]) -> list[list[float]]:
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    resp = _openai_client.embeddings.create(model=_model_name(), input=texts)
    return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]


# ─── Public sync API ──────────────────────────────────────────────────────────

def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Genera embeddings para una lista de textos usando el proveedor configurado.
    Función bloqueante — en contexto async usar asyncio.to_thread().
    """
    if not texts:
        return []

    p = _provider()
    # Truncar para evitar límites de tokens en APIs externas
    max_chars = 3000 if p == "local" else 8000
    truncated = [t[:max_chars] for t in texts]

    if p == "local":
        return _embed_local(truncated)
    if p == "openrouter":
        return _embed_openrouter(truncated)
    if p == "openai":
        return _embed_openai(truncated)
    raise RuntimeError(f"Proveedor de embeddings desconocido: '{p}'. Usa local, openrouter u openai.")


def embed_text(text: str) -> list[float]:
    """Genera embedding para un solo texto (bloqueante)."""
    return embed_texts([text])[0]


# ─── Chunking ─────────────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 250, overlap: int = 25) -> list[str]:
    """
    Divide texto en chunks con overlap basado en palabras.
    Default de 250 palabras es seguro para MiniLM (máx 256 tokens).
    """
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
        if i + chunk_size >= len(words):
            break
        i += chunk_size - overlap
    return chunks


# ─── Document indexing ────────────────────────────────────────────────────────

async def embed_document(doc_id: str, content: str) -> int:
    """
    Indexa un documento: chunk → embed → insert en embeddings → marca embedded=True.
    Devuelve el número de chunks creados.
    """
    db = get_client()

    # Borrar embeddings previos del documento
    db.table("embeddings").delete().eq("document_id", doc_id).execute()

    chunks = chunk_text(content)
    if not chunks:
        logger.warning(f"Documento {doc_id}: sin contenido para indexar")
        return 0

    # Generar embeddings en thread pool para no bloquear el event loop
    vectors: list[list[float]] = await asyncio.to_thread(embed_texts, chunks)

    rows = [
        {
            "document_id": doc_id,
            "chunk_index": idx,
            "chunk": chunk,
            "embedding": vec,
        }
        for idx, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]

    # Insertar en lotes para evitar límites de tamaño de request
    batch_size = 50
    for start in range(0, len(rows), batch_size):
        db.table("embeddings").insert(rows[start : start + batch_size]).execute()

    db.table("documents").update({"embedded": True}).eq("id", doc_id).execute()
    logger.info(
        f"Documento {doc_id} indexado: {len(rows)} chunks | "
        f"proveedor={_provider()} | modelo={_model_name()}"
    )
    return len(rows)


# ─── Similarity search ────────────────────────────────────────────────────────

async def search_similar(query: str, top_k: int = 5) -> list[dict]:
    """
    Busca chunks similares a query usando búsqueda vectorial en Supabase.
    """
    db = get_client()
    query_vec: list[float] = await asyncio.to_thread(embed_text, query)
    result = db.rpc(
        "match_embeddings",
        {"query_embedding": query_vec, "match_count": top_k},
    ).execute()
    return result.data or []
