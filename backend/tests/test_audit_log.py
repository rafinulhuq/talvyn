"""
Integration tests for the admin audit log: written from invitation
revoke/resend, evaluation overrides, and admin reset/restore, and read back
via GET /api/v1/admin/audit-log. DB uses in-memory SQLite.
"""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.audit_log import AdminAuditLog
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import InvitationStatus, Role
from app.db.models.user import User
from app.services.invitation_service import _next_candidate_number

ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _seed_actor(
    db_session,
    *,
    role: Role = Role.SUPER_ADMIN,
    name: str = "Admin Person",
    email: str = "admin@talvyn.test",
) -> None:
    """Maintenance endpoints are SUPER_ADMIN-gated — seed the shared actor id."""
    existing = await db_session.get(User, ACTOR_ID)
    if existing is None:
        db_session.add(
            User(id=ACTOR_ID, email=email, name=name, password_hash="x", role=role, is_active=True)
        )
    else:
        existing.role = role
        existing.name = name
        existing.email = email
        existing.is_active = True
    await db_session.commit()


async def _seed_jd_with_approved_test(db_session) -> tuple[str, str]:
    import uuid

    from app.db.models.enums import (
        Difficulty,
        FileType,
        ParseStatus,
        TestStatus,
        TestType,
    )
    from app.db.models.job_description import JdExtractedData, JobDescription
    from app.db.models.test import Test

    jd_id = str(uuid.uuid4())
    test_id = str(uuid.uuid4())

    jd = JobDescription(
        id=jd_id,
        uploaded_by=ACTOR_ID,
        original_filename="role.pdf",
        file_path="jds/role.pdf",
        file_type=FileType.PDF,
        raw_text="Senior Python Engineer role",
        parse_status=ParseStatus.DONE,
    )
    extracted = JdExtractedData(
        jd_id=jd_id,
        job_title="Senior Python Engineer",
        seniority_level="senior",
        must_have_skills=["Python"],
        nice_to_have_skills=[],
        tools_technologies=[],
        responsibilities=[],
        recommended_test_topics=[],
        difficulty_distribution={},
    )
    test = Test(
        id=test_id,
        jd_id=jd_id,
        test_type=TestType.TECHNICAL,
        title="Python Technical Screening",
        duration_minutes=60,
        total_marks=50,
        difficulty=Difficulty.MIXED,
        status=TestStatus.APPROVED,
    )
    db_session.add_all([jd, extracted, test])
    await db_session.commit()
    return jd_id, test_id


async def _seed_invitation(db_session, jd_id: str, *, email: str = "dana@example.com") -> str:
    candidate = Candidate(
        candidate_number=await _next_candidate_number(db_session),
        email=email,
        name="Dana Lee",
    )
    db_session.add(candidate)
    await db_session.flush()

    inv = Invitation(
        candidate_id=candidate.id,
        jd_id=jd_id,
        invited_by=ACTOR_ID,
        token_hash=hash_token(generate_token()),
        expires_at=make_expiry(hours=72),
        status=InvitationStatus.PENDING,
    )
    db_session.add(inv)
    await db_session.commit()
    return inv.id


class TestInvitationRevokeAudit:
    async def test_revoke_writes_audit_entry_with_actor(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        inv_id = await _seed_invitation(db_session, jd_id)

        resp = await client.post(f"/api/v1/invitations/{inv_id}/revoke")
        assert resp.status_code == 204

        result = await db_session.execute(select(AdminAuditLog))
        entries = result.scalars().all()
        assert len(entries) == 1
        assert entries[0].action == "INVITATION_REVOKED"
        assert entries[0].actor_id == ACTOR_ID
        assert entries[0].target_id == inv_id
        assert "Dana Lee" in (entries[0].summary or "")

    async def test_revoke_without_actor_header_logs_null_actor(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        inv_id = await _seed_invitation(db_session, jd_id)

        client.headers.pop("X-Actor-Id", None)
        resp = await client.post(f"/api/v1/invitations/{inv_id}/revoke")
        assert resp.status_code == 204

        result = await db_session.execute(select(AdminAuditLog))
        entries = result.scalars().all()
        assert len(entries) == 1
        assert entries[0].actor_id is None


class TestInvitationResendAudit:
    async def test_resend_writes_audit_entry(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        inv_id = await _seed_invitation(db_session, jd_id)

        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            resp = await client.post(
                f"/api/v1/invitations/{inv_id}/resend",
                json={"extend_expiry": True},
            )
        assert resp.status_code == 200

        result = await db_session.execute(select(AdminAuditLog))
        entries = result.scalars().all()
        assert len(entries) == 1
        assert entries[0].action == "INVITATION_RESENT"
        assert entries[0].target_id == inv_id


class TestAuditLogEndpoint:
    async def test_list_audit_log_joins_actor_name_and_email(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)

        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        inv_id = await _seed_invitation(db_session, jd_id)
        await client.post(f"/api/v1/invitations/{inv_id}/revoke")

        resp = await client.get("/api/v1/admin/audit-log")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        entry = data["items"][0]
        assert entry["action"] == "INVITATION_REVOKED"
        assert entry["actor_name"] == "Admin Person"
        assert entry["actor_email"] == "admin@talvyn.test"

    async def test_list_audit_log_paginates_newest_first(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        for i in range(3):
            inv_id = await _seed_invitation(db_session, jd_id, email=f"dana{i}@example.com")
            await client.post(f"/api/v1/invitations/{inv_id}/revoke")

        resp = await client.get("/api/v1/admin/audit-log?page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["page_size"] == 2
        assert len(data["items"]) == 2
        # Newest first: created_at strictly non-increasing across the page
        timestamps = [item["created_at"] for item in data["items"]]
        assert timestamps == sorted(timestamps, reverse=True)


class TestMaintenanceRbac:
    """Backup, reset, restore, and audit history are SUPER_ADMIN-only."""

    async def test_plain_admin_gets_403_on_all_maintenance_routes(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session, role=Role.ADMIN)

        assert (await client.get("/api/v1/admin/backup")).status_code == 403
        assert (await client.get("/api/v1/admin/audit-log")).status_code == 403
        assert (
            await client.post("/api/v1/admin/reset-data", json={"confirm": "DELETE ALL"})
        ).status_code == 403
        assert (
            await client.post(
                "/api/v1/admin/restore-data",
                json={"confirm": "RESTORE BACKUP", "backup": {"version": 1, "created_at": "2026-01-01T00:00:00Z", "tables": {}, "files": []}},
            )
        ).status_code == 403

    async def test_missing_actor_gets_401(self, client: AsyncClient, db_session):
        client.headers.pop("X-Actor-Id", None)
        assert (await client.get("/api/v1/admin/backup")).status_code == 401
        assert (await client.get("/api/v1/admin/audit-log")).status_code == 401

    async def test_super_admin_allowed(self, client: AsyncClient, db_session):
        await _seed_actor(db_session)
        assert (await client.get("/api/v1/admin/backup")).status_code == 200
        assert (await client.get("/api/v1/admin/audit-log")).status_code == 200


class TestDataResetPreservesAuditLog:
    async def test_reset_data_logs_action_and_survives_its_own_reset(
        self, client: AsyncClient, db_session
    ):
        await _seed_actor(db_session)
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        inv_id = await _seed_invitation(db_session, jd_id)
        await client.post(f"/api/v1/invitations/{inv_id}/revoke")

        resp = await client.post(
            "/api/v1/admin/reset-data", json={"confirm": "DELETE ALL"}
        )
        assert resp.status_code == 200

        # The revoke entry plus the reset entry itself should both survive
        # the reset (admin_audit_logs is intentionally excluded from the
        # reset table list, same as admin users).
        result = await db_session.execute(select(AdminAuditLog))
        entries = {e.action for e in result.scalars().all()}
        assert entries == {"INVITATION_REVOKED", "DATA_RESET"}
