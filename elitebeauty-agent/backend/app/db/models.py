from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uuid


# ─── DB row models ────────────────────────────────────────────────────────────

class ConversationRow(BaseModel):
    id: uuid.UUID
    channel: str
    contact_id: str
    contact_name: Optional[str] = None
    status: str = "open"
    created_at: datetime
    updated_at: datetime


class MessageRow(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    tokens_used: Optional[int] = None
    latency_ms: Optional[int] = None
    created_at: datetime


class LeadRow(BaseModel):
    id: uuid.UUID
    conversation_id: Optional[uuid.UUID] = None
    channel: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    interest: Optional[str] = None
    budget: Optional[str] = None
    call_duration: Optional[int] = None
    summary: Optional[str] = None
    status: str = "new"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DocumentRow(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    category: Optional[str] = None
    source: Optional[str] = None
    embedded: bool = False
    created_at: datetime
    updated_at: datetime


# ─── API request / response models ───────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    channel: str = "whatsapp"
    contact_id: str = "test-dashboard"


class ChatResponse(BaseModel):
    response: str
    conversation_id: Optional[str] = None
    latency_ms: Optional[int] = None
    rag_chunks: int = 0


class WAIncomingMessage(BaseModel):
    from_number: str = Field(..., alias="from")
    body: str
    timestamp: Optional[str] = None

    model_config = {"populate_by_name": True}


class WABridgeSend(BaseModel):
    to: str
    message: str


class LeadCreate(BaseModel):
    conversation_id: Optional[str] = None
    channel: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    interest: Optional[str] = None
    budget: Optional[str] = None
    summary: Optional[str] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    interest: Optional[str] = None
    budget: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    summary: Optional[str] = None


class ConversationUpdate(BaseModel):
    status: Optional[str] = None
    contact_name: Optional[str] = None


class DocumentCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = None
    source: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None


class ConfigUpdate(BaseModel):
    value: str


class AgentConfigEntry(BaseModel):
    key: str
    value: Optional[str] = None
    description: Optional[str] = None


# ─── WebSocket event ──────────────────────────────────────────────────────────

class WSEvent(BaseModel):
    type: Literal[
        "new_message",
        "new_lead",
        "wa_status",
        "call_event",
        "agent_config_updated",
    ]
    data: dict
