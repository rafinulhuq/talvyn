"""
Integration tests for candidate directory/profile/attempt-history endpoints.
DB uses in-memory SQLite (see conftest.py).
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.attempt import TestAttempt
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import AIRecommendation, AttemptStatus, InvitationStatus
from app.db.models.evaluation import Evaluation
from app.services.invitation_service import _next_candidate_number

# ─── Helpers ──────────────────────────────────────────────────

async def _seed_jd_with_approved_test(db_session, title="Senior Python Engineer") -> tuple[str, str]:
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
        uploaded_by="00000000-0000-0000-0000-000000000000",
        original_filename="role.pdf",
        file_path="jds/role.pdf",
        file_type=FileType.PDF,
        raw_text="role",
        parse_status=ParseStatus.DONE,
    )
    extracted = JdExtractedData(
        jd_id=jd_id,
        job_title=title,
        must_have_skills=[],
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
        title="Technical Screening",
        duration_minutes=45,
        total_marks=50,
        difficulty=Difficulty.MIXED,
        status=TestStatus.APPROVED,
    )
    db_session.add_all([jd, extracted, test])
    await db_session.commit()
    return jd_id, test_id


async def _seed_candidate(db_session, email: str, name: str) -> Candidate:
    candidate = Candidate(
        candidate_number=await _next_candidate_number(db_session),
        email=email,
        name=name,
    )
    db_session.add(candidate)
    await db_session.flush()
    return candidate


async def _seed_invitation(db_session, candidate_id: str, jd_id: str, status=InvitationStatus.PENDING) -> Invitation:
    raw_token = generate_token()
    invitation = Invitation(
        candidate_id=candidate_id,
        jd_id=jd_id,
        invited_by="00000000-0000-0000-0000-000000000000",
        token_hash=hash_token(raw_token),
        expires_at=make_expiry(hours=72),
        status=status,
    )
    db_session.add(invitation)
    await db_session.flush()
    return invitation


async def _seed_attempt(
    db_session, invitation_id: str, candidate_id: str, test_id: str,
    status=AttemptStatus.SUBMITTED, with_evaluation=False, recommendation=AIRecommendation.HIRE,
) -> TestAttempt:
    attempt = TestAttempt(
        invitation_id=invitation_id,
        candidate_id=candidate_id,
        test_id=test_id,
        started_at=datetime.now(tz=timezone.utc),
        submitted_at=datetime.now(tz=timezone.utc) if status != AttemptStatus.IN_PROGRESS else None,
        status=status,
    )
    db_session.add(attempt)
    await db_session.flush()
    if with_evaluation:
        db_session.add(
            Evaluation(
                attempt_id=attempt.id,
                total_score=8,
                max_score=10,
                percentage=80.0,
                ai_recommendation=recommendation,
            )
        )
    await db_session.commit()
    return attempt


# ─── Candidate number assignment ────────────────────────────────

class TestCandidateNumberAssignment:
    async def test_sequential_numbers_assigned_on_create_via_invite(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            r1 = await client.post(
                "/api/v1/invitations/",
                json={"candidate_name": "Number One", "candidate_email": "num1@example.com", "jd_id": jd_id},
            )
            r2 = await client.post(
                "/api/v1/invitations/",
                json={"candidate_name": "Number Two", "candidate_email": "num2@example.com", "jd_id": jd_id},
            )
        assert r1.status_code == 201 and r2.status_code == 201

        from sqlalchemy import select
        cand1 = (await db_session.execute(select(Candidate).where(Candidate.email == "num1@example.com"))).scalar_one()
        cand2 = (await db_session.execute(select(Candidate).where(Candidate.email == "num2@example.com"))).scalar_one()
        assert cand2.candidate_number == cand1.candidate_number + 1

    async def test_existing_candidate_keeps_its_number_on_reuse(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        candidate = await _seed_candidate(db_session, "reuse@example.com", "Reuse Me")
        await db_session.commit()
        original_number = candidate.candidate_number

        with patch(
            "app.services.invitation_service.send_invitation_email",
            new=AsyncMock(return_value=True),
        ):
            await client.post(
                "/api/v1/invitations/",
                json={"candidate_name": "Reuse Me", "candidate_email": "reuse@example.com", "jd_id": jd_id},
            )

        from sqlalchemy import select
        refreshed = (await db_session.execute(select(Candidate).where(Candidate.email == "reuse@example.com"))).scalar_one()
        assert refreshed.candidate_number == original_number


# ─── List ────────────────────────────────────────────────────────

class TestListCandidates:
    async def test_list_returns_candidates_with_attempt_counts(
        self, client: AsyncClient, db_session
    ):
        jd_id, test_id = await _seed_jd_with_approved_test(db_session)
        candidate = await _seed_candidate(db_session, "lister@example.com", "Lister Lee")
        await db_session.commit()
        invitation = await _seed_invitation(db_session, candidate.id, jd_id, status=InvitationStatus.COMPLETED)
        await _seed_attempt(db_session, invitation.id, candidate.id, test_id, status=AttemptStatus.EVALUATED, with_evaluation=True)

        resp = await client.get("/api/v1/candidates/")
        assert resp.status_code == 200
        data = resp.json()
        item = next(i for i in data["items"] if i["email"] == "lister@example.com")
        assert item["total_attempts"] == 1
        assert item["completed_attempts"] == 1
        assert item["candidate_number"] == candidate.candidate_number

    async def test_list_search_filters_by_name_and_email(self, client: AsyncClient, db_session):
        await _seed_candidate(db_session, "findme@example.com", "Findable Frank")
        await _seed_candidate(db_session, "other@example.com", "Someone Else")
        await db_session.commit()

        resp = await client.get("/api/v1/candidates/?search=findable")
        assert resp.status_code == 200
        emails = [i["email"] for i in resp.json()["items"]]
        assert "findme@example.com" in emails
        assert "other@example.com" not in emails

        resp2 = await client.get("/api/v1/candidates/?search=other@example.com")
        emails2 = [i["email"] for i in resp2.json()["items"]]
        assert "other@example.com" in emails2
        assert "findme@example.com" not in emails2

    async def test_list_requires_auth(self):
        from httpx import ASGITransport
        from httpx import AsyncClient as HC

        from app.main import app

        async with HC(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/candidates/")
        assert resp.status_code == 401


# ─── Profile ──────────────────────────────────────────────────────

class TestCandidateProfile:
    async def test_profile_returns_aggregate_counts(self, client: AsyncClient, db_session):
        jd_id, test_id = await _seed_jd_with_approved_test(db_session)
        candidate = await _seed_candidate(db_session, "profile@example.com", "Profile Pat")
        await db_session.commit()
        inv1 = await _seed_invitation(db_session, candidate.id, jd_id, status=InvitationStatus.COMPLETED)
        await _seed_attempt(db_session, inv1.id, candidate.id, test_id, status=AttemptStatus.EVALUATED, with_evaluation=True)

        resp = await client.get(f"/api/v1/candidates/{candidate.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["candidate_number"] == candidate.candidate_number
        assert data["total_invitations"] == 1
        assert data["total_attempts"] == 1
        assert data["completed_attempts"] == 1

    async def test_profile_404_for_unknown_candidate(self, client: AsyncClient):
        resp = await client.get("/api/v1/candidates/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


# ─── Attempt history ────────────────────────────────────────────

class TestCandidateAttempts:
    async def test_attempts_span_multiple_jds(self, client: AsyncClient, db_session):
        jd1, test1 = await _seed_jd_with_approved_test(db_session, title="Backend Engineer")
        jd2, test2 = await _seed_jd_with_approved_test(db_session, title="Frontend Engineer")
        candidate = await _seed_candidate(db_session, "multi-jd@example.com", "Multi JD")
        await db_session.commit()

        inv1 = await _seed_invitation(db_session, candidate.id, jd1, status=InvitationStatus.COMPLETED)
        await _seed_attempt(db_session, inv1.id, candidate.id, test1, status=AttemptStatus.EVALUATED, with_evaluation=True, recommendation=AIRecommendation.STRONG_HIRE)

        inv2 = await _seed_invitation(db_session, candidate.id, jd2, status=InvitationStatus.OPENED)
        await _seed_attempt(db_session, inv2.id, candidate.id, test2, status=AttemptStatus.IN_PROGRESS)

        resp = await client.get(f"/api/v1/candidates/{candidate.id}/attempts")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 2

        jd_titles = {i["jd_title"] for i in items}
        assert jd_titles == {"Backend Engineer", "Frontend Engineer"}

        evaluated = next(i for i in items if i["has_evaluation"])
        assert evaluated["ai_recommendation"] == "STRONG_HIRE"
        assert evaluated["percentage"] == 80.0

        in_progress = next(i for i in items if not i["has_evaluation"])
        assert in_progress["attempt_status"] == "IN_PROGRESS"

    async def test_attempts_404_for_unknown_candidate(self, client: AsyncClient):
        resp = await client.get("/api/v1/candidates/00000000-0000-0000-0000-000000000000/attempts")
        assert resp.status_code == 404

    async def test_attempts_empty_list_for_candidate_with_no_attempts(
        self, client: AsyncClient, db_session
    ):
        candidate = await _seed_candidate(db_session, "noattempts@example.com", "No Attempts")
        await db_session.commit()

        resp = await client.get(f"/api/v1/candidates/{candidate.id}/attempts")
        assert resp.status_code == 200
        assert resp.json()["items"] == []
