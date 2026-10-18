"""
Tests for test attempt endpoints and service.
All DB in-memory SQLite. No real Ollama or Resend.
"""

# ─── Seed helpers ─────────────────────────────────────────────
import uuid as _uuid
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import InvitationStatus, TestStatus
from app.services.invitation_service import _next_candidate_number

_seed_counter = 0

async def _seed_full_stack(db_session) -> tuple[str, str, str]:
    global _seed_counter
    _seed_counter += 1
    _unique = str(_seed_counter)
    """
    Seed: JD + extracted data + APPROVED Test + Candidate + Invitation.
    Returns (raw_token, invitation_id, test_id).
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
        raw_text="Senior Engineer",
        parse_status=ParseStatus.DONE,
    )
    extracted = JdExtractedData(
        jd_id=jd_id,
        job_title="Senior Engineer",
        seniority_level="senior",
        must_have_skills=[], nice_to_have_skills=[],
        tools_technologies=[], responsibilities=[],
        recommended_test_topics=[],
        difficulty_distribution={},
    )
    test = Test(
        id=test_id,
        jd_id=jd_id,
        test_type=TestType.TECHNICAL,
        title="Technical Screening Test",
        duration_minutes=60,
        total_marks=50,
        difficulty=Difficulty.MIXED,
        status=TestStatus.APPROVED,
    )
    db_session.add_all([jd, extracted, test])

    # Add questions
    from app.db.models.enums import QuestionType
    from app.db.models.test import Question
    q1 = Question(
        test_id=test_id,
        question_type=QuestionType.MCQ,
        question_text="What does async/await do in Python applications?",
        skill_tested="Python",
        difficulty=Difficulty.MEDIUM,
        marks=2,
        order_index=0,
        options=[
            {"label": "A", "text": "Blocks the thread", "is_correct": False},
            {"label": "B", "text": "Enables non-blocking I/O", "is_correct": True},
            {"label": "C", "text": "Runs on a new thread", "is_correct": False},
            {"label": "D", "text": "Only works with files", "is_correct": False},
        ],
        correct_answer="B",
        explanation="asyncio enables cooperative multitasking via coroutines.",
    )
    q2 = Question(
        test_id=test_id,
        question_type=QuestionType.OPEN_ENDED,
        question_text="Describe how you would design a REST API for a high-traffic e-commerce platform.",
        skill_tested="System Design",
        difficulty=Difficulty.HARD,
        marks=10,
        order_index=1,
        expected_answer="Should cover caching, load balancing, and database sharding.",
        scoring_rubric="Full marks: covers caching, LB, and sharding. Half: covers 2/3.",
    )
    db_session.add_all([q1, q2])

    candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email=f"test_{_unique}@example.com", name="Test Candidate")
    db_session.add(candidate)
    await db_session.flush()

    raw_token = generate_token()
    invitation = Invitation(
        candidate_id=candidate.id,
        jd_id=jd_id,
        invited_by="00000000-0000-0000-0000-000000000000",
        token_hash=hash_token(raw_token),
        expires_at=make_expiry(hours=72),
        status=InvitationStatus.PENDING,
    )
    db_session.add(invitation)
    await db_session.commit()

    return raw_token, invitation.id, test_id


async def _seed_multi_test_stack(db_session) -> tuple[str, str, list[str]]:
    global _seed_counter
    _seed_counter += 1
    _unique = str(_seed_counter)
    """
    Seed: JD + extracted data + two APPROVED Tests + Candidate + Invitation.
    Returns (raw_token, invitation_id, [test_id_1, test_id_2]).
    """
    import uuid

    from app.db.models.enums import (
        Difficulty,
        FileType,
        ParseStatus,
        QuestionType,
        TestType,
    )
    from app.db.models.job_description import JdExtractedData, JobDescription
    from app.db.models.test import Question, Test

    jd_id = str(uuid.uuid4())
    base_created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

    jd = JobDescription(
        id=jd_id,
        uploaded_by="00000000-0000-0000-0000-000000000000",
        original_filename="multi-role.pdf",
        file_path="jds/multi-role.pdf",
        file_type=FileType.PDF,
        raw_text="Senior Engineer",
        parse_status=ParseStatus.DONE,
    )
    extracted = JdExtractedData(
        jd_id=jd_id,
        job_title="Senior Engineer",
        seniority_level="senior",
        must_have_skills=[], nice_to_have_skills=[],
        tools_technologies=[], responsibilities=[],
        recommended_test_topics=[],
        difficulty_distribution={},
    )
    db_session.add_all([jd, extracted])

    test_ids: list[str] = []
    for index, title in enumerate(["Technical Screening Test", "Reasoning Test"]):
        test_id = str(uuid.uuid4())
        test_ids.append(test_id)
        test = Test(
            id=test_id,
            jd_id=jd_id,
            test_type=TestType.TECHNICAL if index == 0 else TestType.REASONING,
            title=title,
            duration_minutes=30,
            total_marks=10,
            difficulty=Difficulty.MIXED,
            status=TestStatus.APPROVED,
            created_at=base_created_at + timedelta(minutes=index),
        )
        question = Question(
            test_id=test_id,
            question_type=QuestionType.MCQ,
            question_text=f"Question for {title}",
            skill_tested="General",
            difficulty=Difficulty.MEDIUM,
            marks=5,
            order_index=0,
            options=[
                {"label": "A", "text": "Option A", "is_correct": True},
                {"label": "B", "text": "Option B", "is_correct": False},
                {"label": "C", "text": "Option C", "is_correct": False},
                {"label": "D", "text": "Option D", "is_correct": False},
            ],
            correct_answer="A",
        )
        db_session.add_all([test, question])

    candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email=f"multi_{_unique}@example.com", name="Multi Candidate")
    db_session.add(candidate)
    await db_session.flush()

    raw_token = generate_token()
    invitation = Invitation(
        candidate_id=candidate.id,
        jd_id=jd_id,
        invited_by="00000000-0000-0000-0000-000000000000",
        token_hash=hash_token(raw_token),
        expires_at=make_expiry(hours=72),
        status=InvitationStatus.PENDING,
    )
    db_session.add(invitation)
    await db_session.commit()

    return raw_token, invitation.id, test_ids


# ─── Start attempt ────────────────────────────────────────────

class TestStartAttempt:

    async def test_start_with_valid_token(self, client: AsyncClient, db_session):
        raw_token, _, test_id = await _seed_full_stack(db_session)
        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "attempt_id" in data
        assert data["test_id"] == test_id
        assert data["duration_seconds"] == 3600
        assert len(data["questions"]) == 2

    async def test_questions_have_no_correct_answer(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        questions = resp.json()["questions"]
        for q in questions:
            assert "correct_answer" not in q
            assert "explanation" not in q
            assert "expected_answer" not in q
            assert "scoring_rubric" not in q
            # MCQ options should have no is_correct field
            if q["options"]:
                for opt in q["options"]:
                    assert "is_correct" not in opt

    async def test_start_with_invalid_token_returns_400(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": generate_token(), "test_index": 0},
        )
        assert resp.status_code == 400

    async def test_start_with_expired_token_returns_400(
        self, client: AsyncClient, db_session
    ):
        import uuid

        from app.db.models.enums import FileType, ParseStatus
        from app.db.models.job_description import JobDescription

        jd = JobDescription(
            id=str(uuid.uuid4()),
            uploaded_by="00000000-0000-0000-0000-000000000000",
            original_filename="r.pdf",
            file_path="jds/r.pdf",
            file_type=FileType.PDF,
            parse_status=ParseStatus.DONE,
        )
        db_session.add(jd)
        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email="exp@test.com", name="Exp")
        db_session.add(candidate)
        await db_session.flush()

        raw_token = generate_token()
        inv = Invitation(
            candidate_id=candidate.id,
            jd_id=jd.id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(tz=timezone.utc) - timedelta(hours=1),
            status=InvitationStatus.PENDING,
        )
        db_session.add(inv)
        await db_session.commit()

        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert resp.status_code == 400

    async def test_resume_returns_same_attempt_id(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)

        r1 = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id_1 = r1.json()["attempt_id"]

        r2 = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id_2 = r2.json()["attempt_id"]

        assert attempt_id_1 == attempt_id_2


# ─── Save answer ──────────────────────────────────────────────

class TestSaveAnswer:

    async def _start(self, client, db_session) -> tuple[str, str, str]:
        raw_token, _, _ = await _seed_full_stack(db_session)
        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        data = resp.json()
        attempt_id = data["attempt_id"]
        mcq_id = next(
            q["id"] for q in data["questions"] if q["question_type"] == "MCQ"
        )
        oe_id = next(
            q["id"] for q in data["questions"] if q["question_type"] == "OPEN_ENDED"
        )
        return attempt_id, mcq_id, oe_id, raw_token

    async def test_save_mcq_answer(self, client: AsyncClient, db_session):
        attempt_id, mcq_id, _, raw_token = await self._start(client, db_session)
        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            headers={"X-Attempt-Token": raw_token},
            json={"question_id": mcq_id, "selected_option": "B"},
        )
        assert resp.status_code == 200
        assert resp.json()["saved"] is True

    async def test_save_open_ended_answer(self, client: AsyncClient, db_session):
        attempt_id, _, oe_id, raw_token = await self._start(client, db_session)
        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            headers={"X-Attempt-Token": raw_token},
            json={
                "question_id": oe_id,
                "answer_text": "I would use Redis for caching and PostgreSQL for persistence.",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["saved"] is True

    async def test_save_requires_token_header(self, client: AsyncClient, db_session):
        attempt_id, mcq_id, _, _ = await self._start(client, db_session)
        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            json={"question_id": mcq_id, "selected_option": "A"},
        )
        assert resp.status_code == 401

    async def test_answers_persist_on_resume(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        data = start.json()
        attempt_id = data["attempt_id"]
        mcq_id = next(q["id"] for q in data["questions"] if q["question_type"] == "MCQ")

        # Save an answer
        await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            headers={"X-Attempt-Token": raw_token},
            json={"question_id": mcq_id, "selected_option": "C"},
        )

        # Resume (start again with same token)
        resume = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        saved = resume.json()["saved_answers"]
        assert mcq_id in saved
        assert saved[mcq_id] == "C"


# ─── Submit ───────────────────────────────────────────────────

class TestSubmitAttempt:

    async def test_submit_returns_200(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id = start.json()["attempt_id"]

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["attempt_id"] == attempt_id
        assert "submitted_at" in data

    async def test_submit_is_idempotent(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id = start.json()["attempt_id"]

        for _ in range(3):
            resp = await client.post(
                f"/api/v1/attempts/{attempt_id}/submit",
                headers={"X-Attempt-Token": raw_token},
                json={"answers": [], "auto_submitted": False},
            )
            assert resp.status_code == 200

    async def test_auto_submit_flagged(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id = start.json()["attempt_id"]

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": True},
        )
        assert resp.json()["auto_submitted"] is True

    async def test_start_after_submit_returns_409(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id = start.json()["attempt_id"]

        await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )

        # Starting again should return 409 (already submitted)
        resp = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert resp.status_code == 409

    async def test_multi_test_link_continues_after_first_submission(
        self, client: AsyncClient, db_session
    ):
        raw_token, invitation_id, test_ids = await _seed_multi_test_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert start.status_code == 201
        assert start.json()["test_id"] == test_ids[0]

        submit = await client.post(
            f"/api/v1/attempts/{start.json()['attempt_id']}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )
        assert submit.status_code == 200
        submit_data = submit.json()
        assert submit_data["next_test_index"] == 1
        assert submit_data["total_tests"] == 2

        invitation = await db_session.get(Invitation, invitation_id)
        await db_session.refresh(invitation)
        assert invitation.status == InvitationStatus.OPENED

        validation = await client.get(f"/api/v1/invitations/validate/{raw_token}")
        assert validation.status_code == 200
        validation_data = validation.json()
        assert validation_data["valid"] is True
        assert validation_data["next_test_index"] == 1
        assert validation_data["total_tests"] == 2

        # Old clients still ask for index 0; the API should advance to test 2.
        next_start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert next_start.status_code == 201
        assert next_start.json()["test_id"] == test_ids[1]

    async def test_multi_test_link_completes_only_after_last_submission(
        self, client: AsyncClient, db_session
    ):
        raw_token, invitation_id, _ = await _seed_multi_test_stack(db_session)

        first_start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        first_attempt_id = first_start.json()["attempt_id"]
        await client.post(
            f"/api/v1/attempts/{first_attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )

        second_start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 1},
        )
        second_attempt_id = second_start.json()["attempt_id"]
        final_submit = await client.post(
            f"/api/v1/attempts/{second_attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )
        assert final_submit.status_code == 200
        final_data = final_submit.json()
        assert final_data["next_test_index"] is None
        assert final_data["total_tests"] == 2

        invitation = await db_session.get(Invitation, invitation_id)
        await db_session.refresh(invitation)
        assert invitation.status == InvitationStatus.COMPLETED

        validation = await client.get(f"/api/v1/invitations/validate/{raw_token}")
        assert validation.status_code == 200
        validation_data = validation.json()
        assert validation_data["valid"] is False
        assert validation_data["reason"] == "already_used"

    async def test_stale_completed_invitation_with_remaining_tests_is_repaired(
        self, client: AsyncClient, db_session
    ):
        raw_token, invitation_id, test_ids = await _seed_multi_test_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        await client.post(
            f"/api/v1/attempts/{start.json()['attempt_id']}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={"answers": [], "auto_submitted": False},
        )

        invitation = await db_session.get(Invitation, invitation_id)
        invitation.status = InvitationStatus.COMPLETED
        await db_session.commit()

        validation = await client.get(f"/api/v1/invitations/validate/{raw_token}")
        assert validation.status_code == 200
        assert validation.json()["valid"] is True
        assert validation.json()["next_test_index"] == 1

        next_start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        assert next_start.status_code == 201
        assert next_start.json()["test_id"] == test_ids[1]

        await db_session.refresh(invitation)
        assert invitation.status == InvitationStatus.OPENED


# ─── Question ownership (cross-test injection) ─────────────────

class TestQuestionOwnership:
    """
    A candidate's token is valid for their attempt, but the questions they
    submit answers for must belong to that attempt's assigned test — not
    some other test on the same (or a different) invitation.
    """

    async def _start_test_0(self, client, db_session):
        raw_token, _, test_ids = await _seed_multi_test_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        data = start.json()
        attempt_id = data["attempt_id"]
        own_question_id = data["questions"][0]["id"]
        return raw_token, attempt_id, own_question_id, test_ids

    async def _question_id_for_test(self, db_session, test_id: str) -> str:
        from sqlalchemy import select

        from app.db.models.test import Question

        result = await db_session.execute(
            select(Question.id).where(Question.test_id == test_id)
        )
        return result.scalar_one()

    async def test_save_answer_rejects_question_from_other_test(
        self, client: AsyncClient, db_session
    ):
        raw_token, attempt_id, _, test_ids = await self._start_test_0(client, db_session)
        foreign_question_id = await self._question_id_for_test(db_session, test_ids[1])

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            headers={"X-Attempt-Token": raw_token},
            json={"question_id": foreign_question_id, "selected_option": "A"},
        )
        assert resp.status_code == 400

    async def test_save_answer_rejects_unknown_question_id(
        self, client: AsyncClient, db_session
    ):
        raw_token, attempt_id, _, _ = await self._start_test_0(client, db_session)

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/answer",
            headers={"X-Attempt-Token": raw_token},
            json={"question_id": str(_uuid.uuid4()), "selected_option": "A"},
        )
        assert resp.status_code == 400

    async def test_bulk_save_rejects_question_from_other_test(
        self, client: AsyncClient, db_session
    ):
        raw_token, attempt_id, own_question_id, test_ids = await self._start_test_0(client, db_session)
        foreign_question_id = await self._question_id_for_test(db_session, test_ids[1])

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/bulk-save",
            headers={"X-Attempt-Token": raw_token},
            json={
                "answers": [
                    {"question_id": own_question_id, "selected_option": "A"},
                    {"question_id": foreign_question_id, "selected_option": "B"},
                ]
            },
        )
        assert resp.status_code == 400

        # The whole batch must be rejected — no partial save of the valid answer.
        state = await client.get(
            f"/api/v1/attempts/{attempt_id}/state",
            headers={"X-Attempt-Token": raw_token},
        )
        assert own_question_id not in state.json()["saved_answers"]

    async def test_submit_rejects_question_from_other_test(
        self, client: AsyncClient, db_session
    ):
        raw_token, attempt_id, _, test_ids = await self._start_test_0(client, db_session)
        foreign_question_id = await self._question_id_for_test(db_session, test_ids[1])

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/submit",
            headers={"X-Attempt-Token": raw_token},
            json={
                "answers": [
                    {"question_id": foreign_question_id, "selected_option": "A"}
                ],
                "auto_submitted": False,
            },
        )
        assert resp.status_code == 400

        # The attempt must remain IN_PROGRESS — a rejected submit is not a submit.
        state = await client.get(
            f"/api/v1/attempts/{attempt_id}/state",
            headers={"X-Attempt-Token": raw_token},
        )
        assert state.json()["status"] == "IN_PROGRESS"


# ─── Suspicious events ────────────────────────────────────────

class TestSuspiciousEvents:

    async def test_log_tab_switch(self, client: AsyncClient, db_session):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id = start.json()["attempt_id"]

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/event",
            headers={"X-Attempt-Token": raw_token},
            json={"event_type": "TAB_SWITCH", "metadata": {"count": 1}},
        )
        assert resp.status_code == 200
        assert resp.json()["logged"] is True

    async def test_log_invalid_event_type_returns_422(
        self, client: AsyncClient, db_session
    ):
        raw_token, _, _ = await _seed_full_stack(db_session)
        start = await client.post(
            "/api/v1/attempts/start",
            json={"token": raw_token, "test_index": 0},
        )
        attempt_id = start.json()["attempt_id"]

        resp = await client.post(
            f"/api/v1/attempts/{attempt_id}/event",
            headers={"X-Attempt-Token": raw_token},
            json={"event_type": "MADE_UP_EVENT"},
        )
        assert resp.status_code == 422
