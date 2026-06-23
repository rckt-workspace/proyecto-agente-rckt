import httpx
import logging
from fastapi import APIRouter, HTTPException
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wa", tags=["whatsapp-bridge"])


@router.get("/status")
async def wa_status():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.wa_bridge_url}/status")
        return resp.json()
    except Exception:
        return {"status": "disconnected", "bot": "disconnected"}


@router.get("/qr")
async def wa_qr():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.wa_bridge_url}/qr-image")
        return resp.json()
    except Exception:
        return {"image": "", "qr": "", "status": "disconnected"}


@router.post("/send")
async def wa_send(payload: dict):
    to = payload.get("to")
    message = payload.get("message")
    if not to or not message:
        raise HTTPException(400, "Faltan campos: to y message")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{settings.wa_bridge_url}/send",
                json={"to": to, "message": message},
            )
        return resp.json()
    except Exception as e:
        raise HTTPException(503, f"WA Bridge no disponible: {e}")
