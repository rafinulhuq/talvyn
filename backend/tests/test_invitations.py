"""
Integration tests for invitation endpoints and service.
DB uses in-memory SQLite. Email sending is mocked.
"""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import InvitationStatus, TestStatus
from app.services.invitation_service import _next_candidate_number

# ─── Helpers ──────────────────────────────────────────────────

async def _seed_jd_with_approved_test(db_session) -> tuple[str, str]:
    """
    Insert a JobDescription + JdExtractedData + approved Test.
    Returns (jd_id, test_id).
    """
    import uuid

    from app.db.models.enums import Difficulty, FileType, ParseStatus, TestType
    from app.db.models.job_description import JdExtractedData, JobDescription
    from app.db.models.test import Test

    jd_id = str(uuid.uuid4())
    test_id = str(uuid.uuid4())

    jd = JobDescription(
        id=jd_id,
        uploaded_by="00000000-0000-0000-0000-000000000000",
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
    db_session.add(jd)
    db_session.add(extracted)
    db_session.add(test)
    await db_session.commit()
    return jd_id, test_id


# ─── Security: token round-trip ───────────────────────────────

class TestTokenRoundTrip:

    async def test_create_invitation_stores_hash_not_raw_token(
        self, client: AsyncClient, db_session
    ):
        """Verify the stored token_hash != raw token."""
        jd_id, test_id = await _seed_jd_with_approved_test(db_session)

        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            resp = await client.post(
                "/api/v1/invitations/",
                json={
                    "candidate_name": "Alice Smith",
                    "candidate_email": "alice@example.com",
                    "jd_id": jd_id,
                },
            )

        assert resp.status_code == 201
        inv_id = resp.json()["invitation_id"]

        # Check DB: token_hash should be 64 hex chars, not a URL-safe base64 token
        from sqlalchemy import select
        result = await db_session.execute(
            select(Invitation).where(Invitation.id == inv_id)
        )
        inv = result.scalar_one()
        assert len(inv.token_hash) == 64
        assert all(c in "0123456789abcdef" for c in inv.token_hash)

    async def test_validate_with_correct_token(self, client: AsyncClient, db_session):
        """Token from generate_token() + hash_token() validates correctly."""
        jd_id, _ = await _seed_jd_with_approved_test(db_session)

        raw_token = generate_token()
        token_hash = hash_token(raw_token)
        expires_at = make_expiry(hours=72)

        # Seed candidate + invitation directly
        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="bob@example.com", name="Bob Jones")
        db_session.add(candidate)
        await db_session.flush()

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=token_hash,
            expires_at=expires_at,
            status=InvitationStatus.PENDING,
        )
        db_session.add(inv)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/invitations/validate/{raw_token}?mark_opened=false"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["candidate_name"] == "Bob Jones"

    async def test_validate_with_wrong_token_returns_invalid(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)

        raw_token = generate_token()
        token_hash = hash_token(raw_token)

        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="carol@example.com", name="Carol")
        db_session.add(candidate)
        await db_session.flush()

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=token_hash,
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.PENDING,
        )
        db_session.add(inv)
        await db_session.commit()

        # Use a different token
        wrong_token = generate_token()
        resp = await client.get(
            f"/api/v1/invitations/validate/{wrong_token}?mark_opened=false"
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False
        assert resp.json()["reason"] == "not_found"

    async def test_expired_token_returns_expired(
        self, client: AsyncClient, db_session
    ):
        from datetime import timedelta, timezone

        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        raw_token = generate_token()

        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="diana@example.com", name="Diana")
        db_session.add(candidate)
        await db_session.flush()

        # Expired 1 hour ago
        from datetime import datetime
        expired_at = datetime.now(tz=timezone.utc) - timedelta(hours=1)

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(raw_token),
            expires_at=expired_at,
            status=InvitationStatus.PENDING,
        )
        db_session.add(inv)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/invitations/validate/{raw_token}?mark_opened=false"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["reason"] == "expired"


# ─── Create invitation ────────────────────────────────────────

class TestCreateInvitation:

    async def test_creates_candidate_and_invitation(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)

        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            resp = await client.post(
                "/api/v1/invitations/",
                json={
                    "candidate_name": "Eve Turner",
                    "candidate_email": "eve@example.com",
                    "jd_id": jd_id,
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert "invitation_id" in data
        assert data["candidate_email"] == "eve@example.com"
        assert data["email_sent"] is True

    async def test_rejects_duplicate_active_invitation(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)

        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            # First invite
            await client.post(
                "/api/v1/invitations/",
                json={
                    "candidate_name": "Frank Lee",
                    "candidate_email": "frank@example.com",
                    "jd_id": jd_id,
                },
            )
            # Second invite — same candidate, same JD
            resp = await client.post(
                "/api/v1/invitations/",
                json={
                    "candidate_name": "Frank Lee",
                    "candidate_email": "frank@example.com",
                    "jd_id": jd_id,
                },
            )

        assert resp.status_code == 409

    async def test_rejects_unknown_jd(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/invitations/",
            json={
                "candidate_name": "Grace",
                "candidate_email": "grace@example.com",
                "jd_id": "00000000-0000-0000-0000-999999999999",
            },
        )
        assert resp.status_code == 404

    async def test_rejects_invalid_email(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        resp = await client.post(
            "/api/v1/invitations/",
            json={
                "candidate_name": "Test",
                "candidate_email": "not-an-email",
                "jd_id": jd_id,
            },
        )
        assert resp.status_code == 422

    async def test_rejects_jd_with_no_approved_tests(
        self, client: AsyncClient, db_session
    ):
        """JD with only DRAFT tests should return 409."""
        import uuid

        from app.db.models.enums import Difficulty, FileType, ParseStatus, TestType
        from app.db.models.job_description import JdExtractedData, JobDescription
        from app.db.models.test import Test

        jd_id = str(uuid.uuid4())
        jd = JobDescription(
            id=jd_id,
            uploaded_by="00000000-0000-0000-0000-000000000000",
            original_filename="jd2.pdf",
            file_path="jds/jd2.pdf",
            file_type=FileType.PDF,
            raw_text="A role",
            parse_status=ParseStatus.DONE,
        )
        extracted = JdExtractedData(
            jd_id=jd_id,
            job_title="Engineer",
            seniority_level="mid",
            must_have_skills=[],
            nice_to_have_skills=[],
            tools_technologies=[],
            responsibilities=[],
            recommended_test_topics=[],
            difficulty_distribution={},
        )
        test = Test(  # DRAFT, not APPROVED
            jd_id=jd_id,
            test_type=TestType.TECHNICAL,
            title="Draft Test",
            duration_minutes=60,
            total_marks=10,
            difficulty=Difficulty.MEDIUM,
            status=TestStatus.DRAFT,
        )
        db_session.add_all([jd, extracted, test])
        await db_session.commit()

        resp = await client.post(
            "/api/v1/invitations/",
            json={
                "candidate_name": "Hank",
                "candidate_email": "hank@example.com",
                "jd_id": jd_id,
            },
        )
        assert resp.status_code == 409


# ─── Mark opened ─────────────────────────────────────────────

class TestMarkOpened:

    async def test_validate_with_mark_opened_updates_status(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        raw_token = generate_token()

        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="iris@example.com", name="Iris")
        db_session.add(candidate)
        await db_session.flush()

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(raw_token),
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.PENDING,
        )
        db_session.add(inv)
        await db_session.commit()

        # Validate with mark_opened=true (default)
        resp = await client.get(f"/api/v1/invitations/validate/{raw_token}")
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

        # Check DB status updated
        from sqlalchemy import select
        await db_session.refresh(inv)
        result = await db_session.execute(
            select(Invitation).where(Invitation.id == inv.id)
        )
        updated_inv = result.scalar_one()
        assert updated_inv.status == InvitationStatus.OPENED


# ─── List invitations ─────────────────────────────────────────

class TestListInvitations:

    async def test_list_returns_200(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/invitations/jd/00000000-0000-0000-0000-000000000000"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_list_requires_auth(self):
        from httpx import ASGITransport
        from httpx import AsyncClient as HC

        from app.main import app

        async with HC(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get(
                "/api/v1/invitations/jd/00000000-0000-0000-0000-000000000000"
            )
        assert resp.status_code == 401
