from supabase import create_client, Client
from app.config import settings
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

_client: Client | None = None


class DatabaseNotConfigured(RuntimeError):
    """Raised when Supabase credentials are missing or still using placeholders."""


def is_configured() -> bool:
    return settings.has_supabase


def get_client() -> Client:
    global _client
    if not is_configured():
        raise DatabaseNotConfigured(
            "Supabase no está configurado. Define SUPABASE_URL y SUPABASE_SERVICE_KEY "
            "con valores reales en elitebeauty-agent/.env o backend/.env."
        )
    if _client is None:
        try:
            _client = create_client(settings.supabase_url, settings.supabase_service_key)
            logger.info("Supabase client inicializado")
        except Exception as exc:
            raise DatabaseNotConfigured(
                "No se pudo inicializar Supabase. Revisa SUPABASE_URL y SUPABASE_SERVICE_KEY."
            ) from exc
    return _client


def _since_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# ─── Conversations ────────────────────────────────────────────────────────────

async def get_or_create_conversation(channel: str, contact_id: str) -> dict:
    db = get_client()
    result = (
        db.table("conversations")
        .select("*")
        .eq("contact_id", contact_id)
        .eq("channel", channel)
        .eq("status", "open")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]

    new = (
        db.table("conversations")
        .insert({"channel": channel, "contact_id": contact_id, "status": "open"})
        .execute()
    )
    return new.data[0]


async def get_conversation(conversation_id: str) -> dict | None:
    db = get_client()
    result = db.table("conversations").select("*").eq("id", conversation_id).limit(1).execute()
    return result.data[0] if result.data else None


async def list_conversations(status: str | None = None, channel: str | None = None, limit: int = 20) -> list[dict]:
    db = get_client()
    q = db.table("conversations").select("*").order("updated_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    if channel:
        q = q.eq("channel", channel)
    return q.execute().data or []


async def update_conversation(conversation_id: str, data: dict) -> dict | None:
    db = get_client()
    result = db.table("conversations").update(data).eq("id", conversation_id).execute()
    return result.data[0] if result.data else None


# ─── Messages ─────────────────────────────────────────────────────────────────

async def save_message(conversation_id: str, role: str, content: str,
                       tokens_used: int | None = None, latency_ms: int | None = None) -> dict:
    db = get_client()
    payload = {"conversation_id": conversation_id, "role": role, "content": content}
    if tokens_used is not None:
        payload["tokens_used"] = tokens_used
    if latency_ms is not None:
        payload["latency_ms"] = latency_ms
    result = db.table("messages").insert(payload).execute()
    return result.data[0]


async def get_history(conversation_id: str, limit: int = 6) -> list[dict]:
    db = get_client()
    result = (
        db.table("messages")
        .select("role,content")
        .eq("conversation_id", conversation_id)
        .in_("role", ["user", "assistant"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(result.data or []))


async def get_messages_by_conversation(conversation_id: str) -> list[dict]:
    db = get_client()
    result = (
        db.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


# ─── Leads ────────────────────────────────────────────────────────────────────

async def upsert_lead(conversation_id: str, data: dict) -> dict:
    db = get_client()
    existing = (
        db.table("leads")
        .select("*")
        .eq("conversation_id", conversation_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        result = db.table("leads").update(data).eq("conversation_id", conversation_id).execute()
    else:
        result = db.table("leads").insert({"conversation_id": conversation_id, **data}).execute()
    return result.data[0]


async def list_leads(status: str | None = None, channel: str | None = None, limit: int = 50) -> list[dict]:
    db = get_client()
    q = db.table("leads").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    if channel:
        q = q.eq("channel", channel)
    return q.execute().data or []


async def get_lead(lead_id: str) -> dict | None:
    db = get_client()
    result = db.table("leads").select("*").eq("id", lead_id).limit(1).execute()
    return result.data[0] if result.data else None


async def update_lead(lead_id: str, data: dict) -> dict | None:
    db = get_client()
    result = db.table("leads").update(data).eq("id", lead_id).execute()
    return result.data[0] if result.data else None


async def create_lead(data: dict) -> dict:
    db = get_client()
    result = db.table("leads").insert(data).execute()
    return result.data[0]


# ─── Documents ────────────────────────────────────────────────────────────────

async def list_documents() -> list[dict]:
    db = get_client()
    return db.table("documents").select("*").order("created_at", desc=True).execute().data or []


async def get_document(doc_id: str) -> dict | None:
    db = get_client()
    result = db.table("documents").select("*").eq("id", doc_id).limit(1).execute()
    return result.data[0] if result.data else None


async def create_document(data: dict) -> dict:
    db = get_client()
    return db.table("documents").insert(data).execute().data[0]


async def update_document(doc_id: str, data: dict) -> dict | None:
    db = get_client()
    result = db.table("documents").update(data).eq("id", doc_id).execute()
    return result.data[0] if result.data else None


async def delete_document(doc_id: str) -> bool:
    db = get_client()
    db.table("documents").delete().eq("id", doc_id).execute()
    return True


# ─── Config ───────────────────────────────────────────────────────────────────

async def get_all_config() -> list[dict]:
    db = get_client()
    return db.table("agent_config").select("*").execute().data or []


async def get_config_value(key: str) -> str | None:
    db = get_client()
    result = db.table("agent_config").select("value").eq("key", key).limit(1).execute()
    return result.data[0]["value"] if result.data else None


async def set_config_value(key: str, value: str) -> dict:
    db = get_client()
    result = (
        db.table("agent_config")
        .upsert({"key": key, "value": value}, on_conflict="key")
        .execute()
    )
    return result.data[0]


# ─── Analytics ────────────────────────────────────────────────────────────────

async def get_messages_raw(days: int = 7) -> list[dict]:
    db = get_client()
    return (
        db.table("messages")
        .select("created_at,conversation_id,latency_ms")
        .gte("created_at", _since_iso(days))
        .order("created_at")
        .execute()
        .data or []
    )


async def get_conversations_raw(days: int = 30) -> list[dict]:
    db = get_client()
    return (
        db.table("conversations")
        .select("id,channel,status,created_at")
        .gte("created_at", _since_iso(days))
        .order("created_at")
        .execute()
        .data or []
    )


async def get_leads_raw(days: int = 30) -> list[dict]:
    db = get_client()
    return (
        db.table("leads")
        .select("id,channel,status,interest,created_at")
        .gte("created_at", _since_iso(days))
        .order("created_at")
        .execute()
        .data or []
    )
