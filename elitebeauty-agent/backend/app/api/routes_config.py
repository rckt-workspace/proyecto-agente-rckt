from fastapi import APIRouter, HTTPException
from app.db.models import ConfigUpdate
from app.db import supabase_client as db
from app.api.ws import broadcast

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("")
async def get_all():
    return await db.get_all_config()


@router.put("/{key}")
async def set_config(key: str, body: ConfigUpdate):
    result = await db.set_config_value(key, body.value)
    await broadcast({"type": "agent_config_updated", "data": {"key": key, "value": body.value}})
    return result
