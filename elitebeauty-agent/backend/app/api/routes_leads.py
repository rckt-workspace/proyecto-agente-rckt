import csv
import io
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from app.db.models import LeadCreate, LeadUpdate
from app.db import supabase_client as db

router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.get("")
async def list_leads(
    status: str | None = Query(None),
    channel: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    return await db.list_leads(status=status, channel=channel, limit=limit)


@router.post("")
async def create_lead(body: LeadCreate):
    return await db.create_lead(body.model_dump(exclude_none=True))


@router.get("/export")
async def export_leads():
    leads = await db.list_leads(limit=500)
    fields = ["id", "name", "phone", "email", "channel", "interest", "budget", "status", "summary", "created_at"]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(leads)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )


@router.get("/{lead_id}")
async def get_lead(lead_id: str):
    lead = await db.get_lead(lead_id)
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    return lead


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate):
    updated = await db.update_lead(lead_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "Lead no encontrado")
    return updated
