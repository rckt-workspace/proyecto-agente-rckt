from collections import defaultdict
from datetime import datetime, timezone
from app.db import supabase_client as db


async def get_overview() -> dict:
    convs = await db.get_conversations_raw(days=30)
    leads = await db.get_leads_raw(days=30)
    msgs = await db.get_messages_raw(days=7)

    today = datetime.now(timezone.utc).date()
    convs_today = sum(1 for c in convs if _parse_date(c["created_at"]) == today)
    leads_today = sum(1 for l in leads if _parse_date(l["created_at"]) == today)
    calls_today = sum(1 for c in convs if c["channel"] == "voice" and _parse_date(c["created_at"]) == today)

    latencies = [m["latency_ms"] for m in msgs if m.get("latency_ms")]
    avg_latency = int(sum(latencies) / len(latencies)) if latencies else 0

    return {
        "conversations_today": convs_today,
        "leads_today": leads_today,
        "calls_today": calls_today,
        "avg_response_ms": avg_latency,
        "total_conversations_30d": len(convs),
        "total_leads_30d": len(leads),
    }


async def get_messages_by_day(days: int = 7) -> list[dict]:
    msgs = await db.get_messages_raw(days=days)
    by_day: dict[str, dict] = defaultdict(lambda: {"whatsapp": 0, "voice": 0, "total": 0})

    conv_ids = {m["conversation_id"] for m in msgs}
    conv_channel: dict[str, str] = {}

    if conv_ids:
        supa = db.get_client()
        result = supa.table("conversations").select("id,channel").in_("id", list(conv_ids)).execute()
        conv_channel = {r["id"]: r["channel"] for r in (result.data or [])}

    for m in msgs:
        date_str = _parse_date(m["created_at"]).isoformat()
        channel = conv_channel.get(m["conversation_id"], "whatsapp")
        by_day[date_str][channel] += 1
        by_day[date_str]["total"] += 1

    return [{"date": d, **v} for d, v in sorted(by_day.items())]


async def get_leads_by_channel_status(days: int = 30) -> list[dict]:
    leads = await db.get_leads_raw(days=days)
    by_channel: dict[str, dict] = defaultdict(lambda: defaultdict(int))

    for lead in leads:
        ch = lead.get("channel") or "whatsapp"
        st = lead.get("status") or "new"
        by_channel[ch][st] += 1

    result = []
    for ch, statuses in by_channel.items():
        for st, count in statuses.items():
            result.append({"channel": ch, "status": st, "count": count})
    return result


async def get_response_time_by_day(days: int = 7) -> list[dict]:
    msgs = await db.get_messages_raw(days=days)
    by_day: dict[str, list] = defaultdict(list)

    for m in msgs:
        if m.get("latency_ms"):
            date_str = _parse_date(m["created_at"]).isoformat()
            by_day[date_str].append(m["latency_ms"])

    return [
        {"date": d, "avg_ms": int(sum(v) / len(v)), "count": len(v)}
        for d, v in sorted(by_day.items())
    ]


async def get_top_intents(limit: int = 10) -> list[dict]:
    leads = await db.get_leads_raw(days=90)
    counter: dict[str, int] = defaultdict(int)

    for lead in leads:
        interest = lead.get("interest")
        if interest:
            counter[interest.lower()] += 1

    sorted_intents = sorted(counter.items(), key=lambda x: x[1], reverse=True)
    return [{"interest": k, "count": v} for k, v in sorted_intents[:limit]]


def _parse_date(ts_str: str):
    if not ts_str:
        return datetime.now(timezone.utc).date()
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.date()
    except Exception:
        return datetime.now(timezone.utc).date()
