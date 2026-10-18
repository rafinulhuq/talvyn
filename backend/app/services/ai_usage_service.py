"""
AI Usage Service (Master Prompt 3).

Persists one ai_usage_logs row per AiProviderService.generate() call.
Read-side helpers support a future cost-estimation view and let tests
assert the cost-control principle ("don't call GLM per answer") actually
holds — e.g. asserting cq_evaluation logs show provider="local" far more
often than provider="glm" across a batch of attempts.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ai_usage import AiUsageLog


async def log_call(
    db: AsyncSession,
    *,
    task_type: str,
    provider: str,
    model: str,
    jd_id: str | None = None,
    candidate_id: str | None = None,
    exam_attempt_id: str | None = None,
    usage: dict[str, int] | None = None,
    latency_ms: int | None = None,
    success: bool = True,
    error_message: str | None = None,
) -> AiUsageLog:
    usage = usage or {}
    row = AiUsageLog(
        task_type=task_type,
        provider=provider,
        model=model,
        jd_id=jd_id,
        candidate_id=candidate_id,
        exam_attempt_id=exam_attempt_id,
        input_tokens=usage.get("input_tokens"),
        output_tokens=usage.get("output_tokens"),
        total_tokens=usage.get("total_tokens"),
        latency_ms=latency_ms,
        success=success,
        error_message=error_message[:500] if error_message else None,
    )
    db.add(row)
    await db.commit()
    return row


async def count_calls_by_provider(
    db: AsyncSession, *, task_type: str | None = None
) -> dict[str, int]:
    """Quick sanity-check helper: how many calls went to each provider,
    optionally scoped to one task_type. Used by tests and can back a future
    cost dashboard."""
    query = select(AiUsageLog.provider, func.count(AiUsageLog.id))
    if task_type:
        query = query.where(AiUsageLog.task_type == task_type)
    query = query.group_by(AiUsageLog.provider)

    result = await db.execute(query)
    return {provider: count for provider, count in result.all()}


async def estimate_cost_summary(db: AsyncSession) -> dict:
    """
    Rough usage summary for a future cost dashboard — token totals per
    provider. Actual $ cost depends on whichever GLM provider/pricing the
    deployment ends up using, so this intentionally stops at token counts
    rather than guessing a price.
    """
    result = await db.execute(
        select(
            AiUsageLog.provider,
            func.count(AiUsageLog.id),
            func.coalesce(func.sum(AiUsageLog.total_tokens), 0),
            func.coalesce(func.avg(AiUsageLog.latency_ms), 0),
        ).group_by(AiUsageLog.provider)
    )
    return {
        provider: {
            "call_count": count,
            "total_tokens": int(total_tokens),
            "avg_latency_ms": round(float(avg_latency), 1),
        }
        for provider, count, total_tokens, avg_latency in result.all()
    }
