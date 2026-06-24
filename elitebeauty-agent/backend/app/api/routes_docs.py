import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.db.models import DocumentCreate, DocumentUpdate
from app.db import supabase_client as db
from app.db.vector import embed_document, embeddings_configured

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/docs", tags=["docs"])


async def _embed_bg(doc_id: str, content: str):
    if not embeddings_configured():
        logger.warning("OPENAI_API_KEY no configurada, embedding omitido")
        return
    try:
        count = await embed_document(doc_id, content)
        logger.info(f"Embebido doc {doc_id}: {count} chunks")
    except Exception as e:
        logger.error(f"Error embebiendo doc {doc_id}: {e}")


@router.get("")
async def list_docs():
    return await db.list_documents()


@router.post("")
async def create_doc(body: DocumentCreate, background_tasks: BackgroundTasks):
    doc = await db.create_document(body.model_dump(exclude_none=True))
    if embeddings_configured():
        background_tasks.add_task(_embed_bg, str(doc["id"]), doc["content"])
    return doc


@router.get("/{doc_id}")
async def get_doc(doc_id: str):
    doc = await db.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    return doc


@router.put("/{doc_id}")
async def update_doc(doc_id: str, body: DocumentUpdate, background_tasks: BackgroundTasks):
    data = body.model_dump(exclude_none=True)
    data["embedded"] = False
    updated = await db.update_document(doc_id, data)
    if not updated:
        raise HTTPException(404, "Documento no encontrado")
    if embeddings_configured() and "content" in data:
        background_tasks.add_task(_embed_bg, doc_id, updated["content"])
    return updated


@router.delete("/{doc_id}")
async def delete_doc(doc_id: str):
    doc = await db.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    await db.delete_document(doc_id)
    return {"ok": True}


@router.post("/{doc_id}/embed")
async def force_embed(doc_id: str, background_tasks: BackgroundTasks):
    doc = await db.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    if not embeddings_configured():
        raise HTTPException(400, "OPENAI_API_KEY no configurada")
    background_tasks.add_task(_embed_bg, doc_id, doc["content"])
    return {"ok": True, "message": "Embedding iniciado en background"}
