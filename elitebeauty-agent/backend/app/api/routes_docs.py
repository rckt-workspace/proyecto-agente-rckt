import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from app.config import settings
from app.db.models import DocumentCreate, DocumentUpdate
from app.db import supabase_client as db
from app.db.vector import embed_document, embeddings_configured
from app.utils.file_parser import parse_file, title_from_filename, SUPPORTED_EXTENSIONS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/docs", tags=["docs"])


async def _embed_bg(doc_id: str, content: str) -> None:
    """Tarea de fondo: indexa un documento y maneja errores sin romper el servidor."""
    if not embeddings_configured():
        logger.warning(
            f"Motor de embeddings no configurado "
            f"(EMBEDDINGS_PROVIDER={settings.embeddings_provider}). "
            f"Documento {doc_id} queda pendiente."
        )
        return
    try:
        count = await embed_document(doc_id, content)
        logger.info(f"Indexado doc {doc_id}: {count} chunks")
    except Exception as exc:
        logger.error(f"Error indexando doc {doc_id}: {exc}", exc_info=True)


# ─── Rutas de colección ───────────────────────────────────────────────────────

@router.get("")
async def list_docs():
    return await db.list_documents()


@router.post("")
async def create_doc(body: DocumentCreate, background_tasks: BackgroundTasks):
    doc = await db.create_document(body.model_dump(exclude_none=True))
    if embeddings_configured():
        background_tasks.add_task(_embed_bg, str(doc["id"]), doc["content"])
    return doc


@router.post("/upload")
async def upload_doc(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(""),
    category: str = Form("general"),
    source: str = Form("archivo"),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Formato no soportado '{ext}'. Formatos aceptados: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    content_bytes = await file.read()
    if not content_bytes:
        raise HTTPException(400, "El archivo está vacío")

    try:
        text = parse_file(file.filename, content_bytes)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    if not text.strip():
        raise HTTPException(400, "No se pudo extraer texto del archivo")

    doc_title = title.strip() or title_from_filename(file.filename or "documento")

    doc = await db.create_document({
        "title": doc_title,
        "content": text.strip(),
        "category": category or "general",
        "source": source or "archivo",
    })

    if embeddings_configured():
        background_tasks.add_task(_embed_bg, str(doc["id"]), doc["content"])

    return doc


@router.post("/index-pending")
async def index_pending(background_tasks: BackgroundTasks):
    """Encola la indexación de todos los documentos con embedded=false."""
    if not embeddings_configured():
        raise HTTPException(
            400,
            "Motor de embeddings no configurado. "
            "Verifica EMBEDDINGS_PROVIDER en .env (local, openrouter u openai).",
        )
    docs = await db.list_pending_documents()
    for doc in docs:
        background_tasks.add_task(_embed_bg, str(doc["id"]), doc["content"])
    return {"ok": True, "queued": len(docs)}


# ─── Rutas de documento individual ───────────────────────────────────────────

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
    """Fuerza la re-indexación de un documento específico."""
    doc = await db.get_document(doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    if not embeddings_configured():
        raise HTTPException(
            400,
            "Motor de embeddings no configurado. "
            "Verifica EMBEDDINGS_PROVIDER en .env (local, openrouter u openai).",
        )
    background_tasks.add_task(_embed_bg, doc_id, doc["content"])
    return {"ok": True, "message": "Indexación iniciada en background"}
