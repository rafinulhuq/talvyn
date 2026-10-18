"""
Integration tests for public assessment link endpoints and service.
DB uses in-memory SQLite (see conftest.py).
"""

import uuid
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from app.core.security import hash_token
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import InvitationStatus
from app.db.models.public_link import PublicAssessmentLink
from app.services.invitation_service import _next_candidate_number

# ─── Helpers ──────────────────────────────────────────────────

async def _seed_jd_with_approved_test(db_session) -> tuple[str, str]:
    """Insert a JobDescription + JdExtractedData + approved Test. Returns (jd_id, test_id)."""
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
        duration_minutes=45,
        total_marks=50,
        difficulty=Difficulty.MIXED,
        status=TestStatus.APPROVED,
    )
    db_session.add_all([jd, extracted, test])
    await db_session.commit()
    return jd_id, test_id


async def _seed_jd_without_approved_test(db_session) -> str:
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
    jd = JobDescription(
        id=jd_id,
        uploaded_by="00000000-0000-0000-0000-000000000000",
        original_filename="draft-role.pdf",
        file_path="jds/draft-role.pdf",
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
    test = Test(
        jd_id=jd_id,
        test_type=TestType.TECHNICAL,
        title="Draft Test",
        duration_minutes=30,
        total_marks=10,
        difficulty=Difficulty.MEDIUM,
        status=TestStatus.DRAFT,
    )
    db_session.add_all([jd, extracted, test])
    await db_session.commit()
    return jd_id


async def _create_link(client: AsyncClient, jd_id: str, **body) -> dict:
    resp = await client.post(f"/api/v1/public-links/jd/{jd_id}", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─── Create link ────────────────────────────────────────────────

class TestCreatePublicLink:
    async def test_cannot_create_without_approved_tests(self, client: AsyncClient, db_session):
        jd_id = await _seed_jd_without_approved_test(db_session)
        resp = await client.post(f"/api/v1/public-links/jd/{jd_id}", json={})
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "NO_APPROVED_TESTS"

    async def test_can_create_with_approved_tests(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        data = await _create_link(client, jd_id)
        assert data["jd_id"] == jd_id
        assert data["status"] == "ACTIVE"
        assert data["registration_count"] == 0
        assert data["public_url"].endswith(f"/apply/{data['public_slug']}")

    async def test_creating_twice_returns_same_active_link(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        first = await _create_link(client, jd_id)
        second = await _create_link(client, jd_id)
        assert first["id"] == second["id"]
        assert first["public_slug"] == second["public_slug"]

    async def test_requires_inviter_id_header(self, db_session):
        from httpx import ASGITransport
        from httpx import AsyncClient as HC

        from app.main import app

        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        async with HC(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Internal-Token": "test_secret_that_is_32_chars_long_x"},
        ) as c:
            resp = await c.post(f"/api/v1/public-links/jd/{jd_id}", json={})
        assert resp.status_code == 400

    async def test_list_returns_created_link(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        await _create_link(client, jd_id)
        resp = await client.get(f"/api/v1/public-links/jd/{jd_id}")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["jd_id"] == jd_id


# ─── Resolve (public) ───────────────────────────────────────────

class TestResolvePublicLink:
    async def test_resolve_returns_safe_summary(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp = await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["jd_title"] == "Senior Python Engineer"
        assert data["tests"] == [{"title": "Python Technical Screening", "duration_minutes": 45}]
        # No internal IDs, no question content, no answers
        assert "jd_id" not in data
        assert "id" not in data
        assert "questions" not in str(data).lower() or "question" not in data

    async def test_resolve_unknown_slug_returns_not_found(self, client: AsyncClient):
        resp = await client.get("/api/v1/public-links/resolve/does-not-exist")
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["reason"] == "not_found"

    async def test_resolve_disabled_link(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)
        await client.patch(f"/api/v1/public-links/{link['id']}", json={"status": "DISABLED"})

        resp = await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")
        assert resp.json()["reason"] == "disabled"

    async def test_resolve_expired_link(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        past = (datetime.now(tz=timezone.utc) - timedelta(hours=1)).isoformat()
        link = await _create_link(client, jd_id, expires_at=past)

        resp = await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")
        assert resp.json()["reason"] == "expired"


# ─── Register (public) ──────────────────────────────────────────

class TestRegisterViaPublicLink:
    async def test_register_creates_candidate_and_unique_invitation(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Alice Smith", "email": "alice@example.com"},
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["status"] == "redirect"
        assert data["token"] is not None
        assert data["redirect_url"].endswith(f"/tests/{data['token']}")
        # Public slug must never be reused as the candidate's private token
        assert data["token"] != link["public_slug"]

        from sqlalchemy import select
        cand = (
            await db_session.execute(select(Candidate).where(Candidate.email == "alice@example.com"))
        ).scalar_one()
        inv = (
            await db_session.execute(select(Invitation).where(Invitation.candidate_id == cand.id))
        ).scalar_one()
        assert inv.jd_id == jd_id
        assert inv.public_link_id == link["id"]
        assert len(inv.token_hash) == 64

        link_row = (
            await db_session.execute(
                select(PublicAssessmentLink).where(PublicAssessmentLink.id == link["id"])
            )
        ).scalar_one()
        assert link_row.registration_count == 1

    async def test_two_candidates_get_different_tokens(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp1 = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Bob One", "email": "bob1@example.com"},
        )
        resp2 = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Bob Two", "email": "bob2@example.com"},
        )
        assert resp1.json()["token"] != resp2.json()["token"]

    async def test_duplicate_email_reuses_active_invitation(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        first = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Carol", "email": "carol@example.com"},
        )
        second = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Carol", "email": "carol@example.com"},
        )
        assert second.status_code == 201
        assert second.json()["status"] == "redirect"
        # Token is rotated (old one can't be recovered), but only one
        # invitation row exists for this candidate+JD — no duplicate created.
        assert first.json()["token"] != second.json()["token"]

        from sqlalchemy import func, select
        cand = (
            await db_session.execute(select(Candidate).where(Candidate.email == "carol@example.com"))
        ).scalar_one()
        count = (
            await db_session.execute(
                select(func.count(Invitation.id)).where(Invitation.candidate_id == cand.id)
            )
        ).scalar_one()
        assert count == 1

        link_row = (
            await db_session.execute(
                select(PublicAssessmentLink).where(PublicAssessmentLink.id == link["id"])
            )
        ).scalar_one()
        # Second submission reused the existing invitation — not a new registration
        assert link_row.registration_count == 1

    async def test_completed_invitation_returns_already_completed(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="dana@example.com", name="Dana")
        db_session.add(candidate)
        await db_session.flush()

        from app.core.security import generate_token, hash_token, make_expiry

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(generate_token()),
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.COMPLETED,
        )
        db_session.add(inv)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Dana", "email": "dana@example.com"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "already_completed"
        assert data["token"] is None

    async def test_terminated_candidate_cannot_re_register_with_same_email(
        self, client: AsyncClient, db_session
    ):
        """
        A candidate terminated for an integrity violation must not be able
        to just resubmit the registration form with the same email and get
        a fresh token — _find_active_invitation alone (PENDING/OPENED only)
        doesn't catch this, since TERMINATED isn't in that list.
        """
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="evan@example.com", name="Evan")
        db_session.add(candidate)
        await db_session.flush()

        from app.core.security import generate_token, hash_token, make_expiry

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(generate_token()),
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.TERMINATED,
        )
        db_session.add(inv)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Evan", "email": "evan@example.com"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "terminated"
        assert data["token"] is None

    async def test_matching_fingerprint_flags_but_still_issues_token(
        self, client: AsyncClient, db_session
    ):
        """
        Soft signal: a NEW candidate (different email) whose device
        fingerprint matches a TERMINATED candidate's on the same JD gets
        flagged for admin review — but registration still succeeds. This
        must never auto-block; the signal is beatable and shared-IP/device
        false positives are expected to happen sometimes.
        """
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="frank@example.com", name="Frank")
        db_session.add(candidate)
        await db_session.flush()

        from app.core.security import generate_token, hash_token, make_expiry

        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(generate_token()),
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.TERMINATED,
            device_fingerprint="fp_shared_laptop_abc123",
        )
        db_session.add(inv)
        await db_session.commit()

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={
                "full_name": "Gina",
                "email": "gina@example.com",  # different candidate entirely
                "device_fingerprint": "fp_shared_laptop_abc123",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "redirect"
        assert data["token"] is not None  # soft signal never blocks registration

        from sqlalchemy import select as _select

        result = await db_session.execute(
            _select(Invitation).where(
                Invitation.device_fingerprint == "fp_shared_laptop_abc123",
                Invitation.status == InvitationStatus.PENDING,
            )
        )
        new_inv = result.scalars().first()
        assert new_inv is not None
        assert new_inv.flagged_duplicate_device is True
        assert "fingerprint" in new_inv.flagged_duplicate_reason

    async def test_non_matching_fingerprint_is_not_flagged(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={
                "full_name": "Helen",
                "email": "helen@example.com",
                "device_fingerprint": "fp_totally_unrelated",
            },
        )
        assert resp.status_code == 201

        from sqlalchemy import select as _select

        result = await db_session.execute(
            _select(Invitation).where(Invitation.device_fingerprint == "fp_totally_unrelated")
        )
        new_inv = result.scalars().first()
        assert new_inv is not None
        assert new_inv.flagged_duplicate_device is False

    async def test_registration_sets_device_cookie(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Ian", "email": "ian@example.com"},
        )
        assert resp.status_code == 201
        assert "rp_device_id" in resp.cookies

    async def test_disabled_link_blocks_registration(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)
        await client.patch(f"/api/v1/public-links/{link['id']}", json={"status": "DISABLED"})

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Eve", "email": "eve@example.com"},
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "LINK_DISABLED"

    async def test_expired_link_blocks_registration(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        past = (datetime.now(tz=timezone.utc) - timedelta(hours=1)).isoformat()
        link = await _create_link(client, jd_id, expires_at=past)

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Frank", "email": "frank@example.com"},
        )
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "LINK_EXPIRED"

    async def test_max_registrations_blocks_further_registration(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id, max_registrations=1)

        first = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Gina", "email": "gina@example.com"},
        )
        assert first.status_code == 201

        second = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Hank", "email": "hank@example.com"},
        )
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "MAX_REGISTRATIONS_REACHED"

    async def test_register_unknown_slug_returns_404(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/public-links/does-not-exist/register",
            json={"full_name": "Ivy", "email": "ivy@example.com"},
        )
        assert resp.status_code == 404

    async def test_register_rejects_invalid_email(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Jack", "email": "not-an-email"},
        )
        assert resp.status_code == 422


# ─── Analytics ───────────────────────────────────────────────────

class TestPublicLinkAnalytics:
    async def test_resolve_increments_view_count(self, client: AsyncClient, db_session):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")
        await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")
        await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")

        resp = await client.get(f"/api/v1/public-links/{link['id']}/analytics")
        assert resp.status_code == 200
        assert resp.json()["views"] == 3

    async def test_resolve_on_disabled_link_still_counts_as_a_view(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)
        await client.patch(f"/api/v1/public-links/{link['id']}", json={"status": "DISABLED"})

        await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")

        resp = await client.get(f"/api/v1/public-links/{link['id']}/analytics")
        assert resp.json()["views"] == 1

    async def test_register_does_not_double_count_as_a_view(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        await client.get(f"/api/v1/public-links/resolve/{link['public_slug']}")
        await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Kim", "email": "kim@example.com"},
        )

        resp = await client.get(f"/api/v1/public-links/{link['id']}/analytics")
        data = resp.json()
        assert data["views"] == 1
        assert data["registrations"] == 1

    async def test_analytics_for_unknown_link_returns_404(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/public-links/00000000-0000-0000-0000-000000000000/analytics"
        )
        assert resp.status_code == 404

    async def test_analytics_tracks_starts_completions_and_pass_rate(
        self, client: AsyncClient, db_session
    ):
        from sqlalchemy import select

        from app.db.models.attempt import TestAttempt
        from app.db.models.enums import AIRecommendation, AttemptStatus
        from app.db.models.evaluation import Evaluation

        jd_id, test_id = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        # Candidate A: registers, starts, completes, and gets evaluated HIRE.
        resp_a = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Alice", "email": "alice-analytics@example.com"},
        )
        token_a = resp_a.json()["token"]
        inv_a = (
            await db_session.execute(
                select(Invitation).where(Invitation.token_hash == hash_token(token_a))
            )
        ).scalar_one()

        attempt_a = TestAttempt(
            invitation_id=inv_a.id,
            candidate_id=inv_a.candidate_id,
            test_id=test_id,
            started_at=datetime.now(tz=timezone.utc),
            submitted_at=datetime.now(tz=timezone.utc),
            status=AttemptStatus.EVALUATED,
        )
        db_session.add(attempt_a)
        await db_session.flush()
        db_session.add(
            Evaluation(
                attempt_id=attempt_a.id,
                ai_recommendation=AIRecommendation.HIRE,
            )
        )
        inv_a.status = InvitationStatus.COMPLETED
        await db_session.commit()

        # Candidate B: registers and starts, but never submits/completes.
        resp_b = await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Ben", "email": "ben-analytics@example.com"},
        )
        token_b = resp_b.json()["token"]
        inv_b = (
            await db_session.execute(
                select(Invitation).where(Invitation.token_hash == hash_token(token_b))
            )
        ).scalar_one()
        attempt_b = TestAttempt(
            invitation_id=inv_b.id,
            candidate_id=inv_b.candidate_id,
            test_id=test_id,
            started_at=datetime.now(tz=timezone.utc),
            status=AttemptStatus.IN_PROGRESS,
        )
        db_session.add(attempt_b)
        await db_session.commit()

        # Candidate C: registers only, never starts.
        await client.post(
            f"/api/v1/public-links/{link['public_slug']}/register",
            json={"full_name": "Cara", "email": "cara-analytics@example.com"},
        )

        resp = await client.get(f"/api/v1/public-links/{link['id']}/analytics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["registrations"] == 3
        assert data["starts"] == 2  # A and B started; C did not
        assert data["completions"] == 1  # only A completed
        assert data["evaluated_attempts"] == 1
        assert data["recommendation_breakdown"] == {"HIRE": 1}
        assert data["pass_rate"] == 1.0

    async def test_pass_rate_is_null_when_nothing_evaluated(
        self, client: AsyncClient, db_session
    ):
        jd_id, _ = await _seed_jd_with_approved_test(db_session)
        link = await _create_link(client, jd_id)

        resp = await client.get(f"/api/v1/public-links/{link['id']}/analytics")
        data = resp.json()
        assert data["evaluated_attempts"] == 0
        assert data["pass_rate"] is None
