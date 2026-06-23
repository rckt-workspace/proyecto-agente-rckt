import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

_connections: list[WebSocket] = []


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _connections.append(websocket)
    logger.info(f"WS conectado. Total: {len(_connections)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _connections.remove(websocket)
        logger.info(f"WS desconectado. Total: {len(_connections)}")


async def broadcast(data: dict) -> None:
    if not _connections:
        return
    payload = json.dumps(data, default=str)
    dead = []
    for ws in _connections:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections.remove(ws)
