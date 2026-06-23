from fastapi import APIRouter, Query, HTTPException
from app.db.models import ConversationUpdate
from app.db import supabase_client as db

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("")
async def list_conversations(
    status: str | None = Query(None),
    channel: str | None = Query(None),
    limit: int = Query(20, le=100),
):
    return await db.list_conversations(status=status, channel=channel, limit=limit)


@router.get("/{conv_id}")
async def get_conversation(conv_id: str):
    conv = await db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Conversación no encontrada")
    messages = await db.get_messages_by_conversation(conv_id)
    return {**conv, "messages": messages}


@router.patch("/{conv_id}")
async def update_conversation(conv_id: str, body: ConversationUpdate):
    updated = await db.update_conversation(conv_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Conversación no encontrada")
    return updated
