"""
Data-ownership scoping tests (the security fix for the USER role).

A USER must only ever see data they own — their own JDs, and the candidates/
results from invitations they sent. ADMIN/SUPER_ADMIN (and the unscoped
default actor) see everything.

Each actor acts via an X-Actor-Id header override on the shared client.
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.attempt import TestAttempt
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import (
    AIRecommendation,
    AttemptStatus,
    Difficulty,
    FileType,
    InvitationStatus,
    ParseStatus,
    Role,
    TestStatus,
    TestType,
)
from app.db.models.evaluation import Evaluation
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.test import Test
from app.db.models.user import User
from app.services.invitation_service import _next_candidate_number


async def _seed_user(db_session, role: Role) -> str:
    uid = str(uuid.uuid4())
    db_session.add(
        User(
            id=uid,
            email=f"{role.value.lower()}-{uid}@example.com",
            name=f"{role.value}",
            password_hash="x",
            role=role,
            is_active=True,
        )
    )
    await db_session.flush()
    return uid


async def _seed_owned_chain(db_session, owner_id: str, *, title: str, email: str):
    """Seed a JD (owned by owner_id) + approved test + candidate + invitation
    (invited_by owner_id) + evaluated attempt. Returns (jd_id, candidate_id,
    attempt_id)."""
    jd_id = str(uuid.uuid4())
    test_id = str(uuid.uuid4())
    db_session.add(
        JobDescription(
            id=jd_id, uploaded_by=owner_id, original_filename="role.pdf",
            file_path="jds/role.pdf", file_type=FileType.PDF, raw_text="role",
            parse_status=ParseStatus.DONE,
        )
    )
    db_session.add(
        JdExtractedData(
            jd_id=jd_id, job_title=title, must_have_skills=[], nice_to_have_skills=[],
            tools_technologies=[], responsibilities=[], recommended_test_topics=[],
            difficulty_distribution={},
        )
    )
    db_session.add(
        Test(
            id=test_id, jd_id=jd_id, test_type=TestType.TECHNICAL, title="Screen",
            duration_minutes=45, total_marks=50, difficulty=Difficulty.MIXED,
            status=TestStatus.APPROVED,
        )
    )
    candidate = Candidate(
        candidate_number=await _next_candidate_number(db_session), email=email, name="Cand",
    )
    db_session.add(candidate)
    await db_session.flush()
    inv = Invitation(
        candidate_id=candidate.id, jd_id=jd_id, invited_by=owner_id,
        token_hash=hash_token(generate_token()), expires_at=make_expiry(hours=72),
        status=InvitationStatus.OPENED,
    )
    db_session.add(inv)
    await db_session.flush()
    attempt = TestAttempt(
        invitation_id=inv.id, candidate_id=candidate.id, test_id=test_id,
        started_at=datetime.now(tz=timezone.utc),
        submitted_at=datetime.now(tz=timezone.utc), status=AttemptStatus.EVALUATED,
    )
    db_session.add(attempt)
    await db_session.flush()
    db_session.add(
        Evaluation(
            attempt_id=attempt.id, total_score=8, max_score=10, percentage=80.0,
            ai_recommendation=AIRecommendation.HIRE,
        )
    )
    await db_session.commit()
    return jd_id, candidate.id, attempt.id


@pytest.fixture
async def scoped_world(db_session):
    """Two USERs, each owning a full JD→candidate→result chain."""
    user_a = await _seed_user(db_session, Role.USER)
    user_b = await _seed_user(db_session, Role.USER)
    await db_session.commit()
    a = await _seed_owned_chain(db_session, user_a, title="Role A", email="a@ex.com")
    b = await _seed_owned_chain(db_session, user_b, title="Role B", email="b@ex.com")
    return {
        "user_a": user_a, "user_b": user_b,
        "jd_a": a[0], "cand_a": a[1], "attempt_a": a[2],
        "jd_b": b[0], "cand_b": b[1], "attempt_b": b[2],
    }


class TestUserSeesOnlyOwnData:
    async def test_jd_list_scoped(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        ids = [i["id"] for i in (await client.get("/api/v1/jd/", headers=hdr)).json()["items"]]
        assert w["jd_a"] in ids
        assert w["jd_b"] not in ids

    async def test_cannot_open_other_users_jd(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        assert (await client.get(f"/api/v1/jd/{w['jd_a']}", headers=hdr)).status_code == 200
        assert (await client.get(f"/api/v1/jd/{w['jd_b']}", headers=hdr)).status_code == 404

    async def test_cannot_list_other_users_tests(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        assert (await client.get(f"/api/v1/tests/jd/{w['jd_b']}", headers=hdr)).json() == []

    async def test_candidates_scoped(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        ids = [c["id"] for c in (await client.get("/api/v1/candidates/", headers=hdr)).json()["items"]]
        assert w["cand_a"] in ids and w["cand_b"] not in ids

    async def test_cannot_open_other_users_candidate(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        assert (await client.get(f"/api/v1/candidates/{w['cand_b']}", headers=hdr)).status_code == 404

    async def test_results_inbox_scoped(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        items = (await client.get("/api/v1/evaluation/inbox", headers=hdr)).json()["items"]
        attempt_ids = {i["attempt_id"] for i in items}
        assert w["attempt_a"] in attempt_ids and w["attempt_b"] not in attempt_ids

    async def test_global_leaderboard_scoped(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        data = (await client.get("/api/v1/evaluation/leaderboard", headers=hdr)).json()
        assert data["total_candidates"] == 1

    async def test_cannot_open_other_users_evaluation(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        assert (await client.get(f"/api/v1/evaluation/{w['attempt_b']}", headers=hdr)).status_code == 404

    async def test_dashboard_stats_scoped(self, client, scoped_world):
        w = scoped_world
        hdr = {"X-Actor-Id": w["user_a"]}
        stats = (await client.get("/api/v1/stats/", headers=hdr)).json()
        assert stats["jd_count"] == 1
        assert stats["evaluation_count"] == 1


class TestAdminSeesEverything:
    async def test_admin_sees_all_jds(self, client, scoped_world, db_session):
        w = scoped_world
        admin_id = await _seed_user(db_session, Role.ADMIN)
        await db_session.commit()
        hdr = {"X-Actor-Id": admin_id}
        ids = [i["id"] for i in (await client.get("/api/v1/jd/", headers=hdr)).json()["items"]]
        assert w["jd_a"] in ids and w["jd_b"] in ids

    async def test_admin_stats_counts_all(self, client, scoped_world, db_session):
        admin_id = await _seed_user(db_session, Role.ADMIN)
        await db_session.commit()
        hdr = {"X-Actor-Id": admin_id}
        stats = (await client.get("/api/v1/stats/", headers=hdr)).json()
        # ADMIN is unscoped — sees at least both seeded chains (exact global
        # totals are polluted by other tests' data in the shared session DB).
        assert stats["jd_count"] >= 2
        assert stats["evaluation_count"] >= 2

    async def test_admin_can_open_any_jd(self, client, scoped_world, db_session):
        w = scoped_world
        admin_id = await _seed_user(db_session, Role.ADMIN)
        await db_session.commit()
        hdr = {"X-Actor-Id": admin_id}
        assert (await client.get(f"/api/v1/jd/{w['jd_a']}", headers=hdr)).status_code == 200
        assert (await client.get(f"/api/v1/jd/{w['jd_b']}", headers=hdr)).status_code == 200
