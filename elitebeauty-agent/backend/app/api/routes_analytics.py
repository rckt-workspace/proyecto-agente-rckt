from fastapi import APIRouter, Query
from app.analytics import metrics

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def overview():
    return await metrics.get_overview()


@router.get("/messages")
async def messages_by_day(period: str = Query("7d")):
    days = _parse_days(period)
    return await metrics.get_messages_by_day(days)


@router.get("/leads")
async def leads_stats(period: str = Query("30d")):
    days = _parse_days(period)
    return await metrics.get_leads_by_channel_status(days)


@router.get("/response_time")
async def response_time(period: str = Query("7d")):
    days = _parse_days(period)
    return await metrics.get_response_time_by_day(days)


@router.get("/top_intents")
async def top_intents(limit: int = Query(10)):
    return await metrics.get_top_intents(limit)


def _parse_days(period: str) -> int:
    mapping = {"7d": 7, "30d": 30, "90d": 90}
    return mapping.get(period, 7)
