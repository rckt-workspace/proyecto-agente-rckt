import logging
from openai import OpenAI
from app.config import settings
from app.db.supabase_client import get_client

logger = logging.getLogger(__name__)

_openai: OpenAI | None = None


def embeddings_configured() -> bool:
    return settings.has_openai_embeddings


def _get_openai() -> OpenAI:
    global _openai
    if not embeddings_configured():
        raise RuntimeError("OPENAI_API_KEY no configurada para embeddings")
    if _openai is None:
        _openai = OpenAI(api_key=settings.openai_api_key)
    return _openai


def embed_text(text: str) -> list[float]:
    client = _get_openai()
    resp = client.embeddings.create(
        model="text-embedding-3-small",
        input=text[:8000],
    )
    return resp.data[0].embedding


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


async def embed_document(doc_id: str, content: str) -> int:
    db = get_client()
    db.table("embeddings").delete().eq("document_id", doc_id).execute()

    chunks = chunk_text(content)
    rows = []
    for chunk in chunks:
        vec = embed_text(chunk)
        rows.append({"document_id": doc_id, "chunk": chunk, "embedding": vec})

    if rows:
        db.table("embeddings").insert(rows).execute()

    db.table("documents").update({"embedded": True}).eq("id", doc_id).execute()
    logger.info(f"Documento {doc_id} embebido: {len(rows)} chunks")
    return len(rows)


async def search_similar(query: str, top_k: int = 5) -> list[dict]:
    db = get_client()
    query_vec = embed_text(query)

    result = db.rpc(
        "match_embeddings",
        {"query_embedding": query_vec, "match_count": top_k},
    ).execute()

    return result.data or []
