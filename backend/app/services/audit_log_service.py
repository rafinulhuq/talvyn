"""
Audit Log Service.

Append-only trail of sensitive admin actions (invitation revoke/resend,
evaluation overrides, data reset/restore). `record()` is called from the
same service functions that perform the action, before their own commit,
so the audit entry and the action it describes succeed or fail together.
"""

from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log import AdminAuditLog
from app.db.models.user import User


async def record(
    db: AsyncSession,
    *,
    actor_id: str | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(
        AdminAuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            summary=summary,
            details=details,
        )
    )
    await db.flush()


async def list_recent(db: AsyncSession, page: int = 1, page_size: int = 20) -> dict:
    """Paginated audit log entries, newest first, with actor name/email joined in."""
    offset = (page - 1) * page_size

    total_result = await db.execute(select(func.count(AdminAuditLog.id)))
    total: int = total_result.scalar_one()

    rows_result = await db.execute(
        select(AdminAuditLog, User.name, User.email)
        .outerjoin(User, AdminAuditLog.actor_id == User.id)
        .order_by(desc(AdminAuditLog.created_at))
        .offset(offset)
        .limit(page_size)
    )

    items = [
        {
            "id": log.id,
            "actor_id": log.actor_id,
            "actor_name": actor_name,
            "actor_email": actor_email,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "summary": log.summary,
            "details": log.details,
            "created_at": log.created_at,
        }
        for log, actor_name, actor_email in rows_result.all()
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, -(-total // page_size)),
    }
