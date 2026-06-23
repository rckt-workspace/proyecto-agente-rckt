from fastapi import APIRouter
from app.db.models import ChatRequest, ChatResponse
from app.db import supabase_client as db
from app.agent.core import run_agent

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    conv = await db.get_or_create_conversation(req.channel, req.contact_id)
    conversation_id = str(conv["id"])

    reply, tokens, latency, rag_chunks = await run_agent(
        message=req.message,
        channel=req.channel,
        conversation_id=conversation_id,
        contact_id=req.contact_id,
    )

    return ChatResponse(
        response=reply,
        conversation_id=conversation_id,
        latency_ms=latency,
        rag_chunks=rag_chunks,
    )
