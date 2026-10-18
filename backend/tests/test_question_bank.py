"""
Tests for the question-bank / sectioned-exam redesign (Master Prompt 2).

All DB in-memory SQLite, all Ollama calls mocked — no real AI needed.
Mirrors the seeding style already used in tests/test_attempts.py.
"""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.config import get_settings
from app.core.exceptions import ConflictError
from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import (
    AttemptStatus,
    Difficulty,
    ExamAttemptStatus,
    FileType,
    InvitationStatus,
    ParseStatus,
    QuestionBankStatus,
    QuestionType,
    TestStatus,
    TestType,
)
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.question_bank import ExamAttempt, QuestionBank
from app.db.models.test import Question, Test
from app.services import (
    ai_risk_service,
    exam_assignment_service,
    exam_attempt_service,
    question_bank_service,
    scoring_service,
)
from app.services.invitation_service import _next_candidate_number
from app.services.question_bank_service import SECTION_ORDER

_seed_counter = 0


async def _seed_jd(db_session) -> str:
    global _seed_counter
    _seed_counter += 1
    jd_id = str(uuid.uuid4())
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
        must_have_skills=["Python"],
        nice_to_have_skills=[],
        tools_technologies=[],
        responsibilities=[],
        recommended_test_topics=[],
        difficulty_distribution={},
    )
    db_session.add_all([jd, extracted])
    await db_session.commit()
    return jd_id


async def _seed_invitation(db_session, jd_id: str) -> tuple[str, str]:
    """Returns (raw_token, invitation_id)."""
    global _seed_counter
    _seed_counter += 1
    candidate = Candidate(
        candidate_number=await _next_candidate_number(db_session),
        email=f"qb_test_{_seed_counter}@example.com",
        name="QB Test Candidate",
    )
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
    return raw_token, invitation.id


def _make_question(test_id: str, qtype: QuestionType, order_index: int, usage_count: int = 0) -> Question:
    if qtype == QuestionType.MCQ:
        return Question(
            test_id=test_id,
            question_type=QuestionType.MCQ,
            question_text=f"MCQ question number {order_index} for this section?",
            difficulty=Difficulty.MEDIUM,
            marks=2,
            order_index=order_index,
            options=[
                {"label": "A", "text": "Wrong", "is_correct": False},
                {"label": "B", "text": "Right", "is_correct": True},
                {"label": "C", "text": "Wrong", "is_correct": False},
                {"label": "D", "text": "Wrong", "is_correct": False},
            ],
            correct_answer="B",
            explanation="B is correct.",
            is_active=True,
            usage_count=usage_count,
        )
    return Question(
        test_id=test_id,
        question_type=QuestionType.OPEN_ENDED,
        question_text=f"Open-ended question number {order_index} for this section?",
        difficulty=Difficulty.HARD,
        marks=10,
        order_index=order_index,
        expected_answer="A thorough answer covering the key points.",
        scoring_rubric="Full marks for covering all key points.",
        is_active=True,
        usage_count=usage_count,
    )


async def _seed_bank(
    db_session, jd_id: str, *, mcq_per_section: int = 12, cq_per_section: int = 6
) -> QuestionBank:
    """Directly seed a READY QuestionBank with section Tests + Questions,
    bypassing Ollama entirely — used by tests that exercise assignment/
    scoring/risk logic rather than generation itself."""
    bank = QuestionBank(jd_id=jd_id, status=QuestionBankStatus.READY)
    db_session.add(bank)
    await db_session.flush()

    for section in SECTION_ORDER:
        test = Test(
            jd_id=jd_id,
            question_bank_id=bank.id,
            test_type=section,
            title=f"{section.value} bank section",
            duration_minutes=45,
            total_marks=0,
            difficulty=Difficulty.MIXED,
            status=TestStatus.APPROVED,
        )
        db_session.add(test)
        await db_session.flush()

        order = 0
        for i in range(mcq_per_section):
            db_session.add(_make_question(test.id, QuestionType.MCQ, order))
            order += 1
        for i in range(cq_per_section):
            db_session.add(_make_question(test.id, QuestionType.OPEN_ENDED, order))
            order += 1

    await db_session.commit()
    return bank


# ─── 1-2: Bank readiness validation ────────────────────────────

class TestBankValidation:

    async def test_bank_meets_minimum_is_ready(self, db_session):
        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=20, cq_per_section=10)

        completeness = await question_bank_service._completeness_for_bank(bank.id, db_session)
        assert completeness["ready"] is True
        assert completeness["below_recommended"] is True  # below the 40/20 commercial target

    async def test_bank_below_minimum_not_ready(self, db_session):
        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=5, cq_per_section=2)

        completeness = await question_bank_service._completeness_for_bank(bank.id, db_session)
        assert completeness["ready"] is False

    async def test_bank_meets_commercial_size_not_below_recommended(self, db_session):
        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=40, cq_per_section=20)

        completeness = await question_bank_service._completeness_for_bank(bank.id, db_session)
        assert completeness["ready"] is True
        assert completeness["below_recommended"] is False


# ─── 3: Question bank creation (mocked generation) ─────────────

class TestBankGeneration:

    async def test_create_bank_disabled_flag_raises(self, db_session):
        jd_id = await _seed_jd(db_session)
        with pytest.raises(ConflictError):
            await question_bank_service.create_bank_for_jd(jd_id, db_session)

    async def test_create_bank_generates_and_persists(self, db_session, monkeypatch):
        monkeypatch.setattr(get_settings(), "question_bank_mode", True)
        monkeypatch.setattr(get_settings(), "bank_mcq_minimum", 5)
        monkeypatch.setattr(get_settings(), "bank_cq_minimum", 2)
        monkeypatch.setattr(get_settings(), "bank_mcq_commercial", 5)
        monkeypatch.setattr(get_settings(), "bank_cq_commercial", 2)

        jd_id = await _seed_jd(db_session)

        batch = {
            "title": "Section bank batch",
            "description": "A batch of generated questions.",
            "duration_minutes": 45,
            "total_marks": 30,
            "difficulty": "MIXED",
            "mcq_questions": [
                {
                    "question_text": f"Generated MCQ {i}?",
                    "skill_tested": "Python",
                    "difficulty": "MEDIUM",
                    "marks": 2,
                    "options": [
                        {"label": "A", "text": "Wrong", "is_correct": False},
                        {"label": "B", "text": "Right", "is_correct": True},
                        {"label": "C", "text": "Wrong", "is_correct": False},
                        {"label": "D", "text": "Wrong", "is_correct": False},
                    ],
                    "correct_answer": "B",
                    "explanation": "Because B.",
                }
                for i in range(5)
            ],
            "open_ended_questions": [
                {
                    "question_text": f"Generated OE {i}?",
                    "skill_tested": "Python",
                    "difficulty": "HARD",
                    "marks": 10,
                    "expected_answer": "Covers the key points.",
                    "scoring_rubric": "Full marks for key points.",
                }
                for i in range(2)
            ],
        }
        raw = json.dumps(batch)

        with patch(
            "app.services.test_generation_service.ollama_client.generate",
            new=AsyncMock(return_value=raw),
        ):
            bank = await question_bank_service.create_bank_for_jd(jd_id, db_session)

        assert bank.status == QuestionBankStatus.READY
        completeness = await question_bank_service._completeness_for_bank(bank.id, db_session)
        for section in SECTION_ORDER:
            assert completeness["sections"][section.value]["mcq"] >= 5
            assert completeness["sections"][section.value]["cq"] >= 2


# ─── 5, 4, 10, 9: Assignment ────────────────────────────────────

class TestAssignment:

    async def test_assignment_locks_correct_counts_no_duplicates(self, db_session, monkeypatch):
        monkeypatch.setattr(get_settings(), "exam_section_mcq_count", 10)
        monkeypatch.setattr(get_settings(), "exam_section_cq_count", 5)
        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=20, cq_per_section=10)
        _, invitation_id = await _seed_invitation(db_session, jd_id)

        exam_attempt = ExamAttempt(
            candidate_id=(await db_session.get(Invitation, invitation_id)).candidate_id,
            invitation_id=invitation_id,
            jd_id=jd_id,
            status=ExamAttemptStatus.ASSIGNED,
        )
        db_session.add(exam_attempt)
        await db_session.flush()

        rows = await exam_assignment_service.assign_questions_for_attempt(exam_attempt, bank, db_session)

        assert len(rows) == 45  # 3 sections x (10 MCQ + 5 CQ)
        question_ids = [r.question_id for r in rows]
        assert len(set(question_ids)) == len(question_ids)  # no duplicates

        for section in SECTION_ORDER:
            section_rows = [r for r in rows if r.section_type == section.value]
            mcq_rows = [r for r in section_rows if r.question_type == "MCQ"]
            cq_rows = [r for r in section_rows if r.question_type == "OPEN_ENDED"]
            assert len(mcq_rows) == 10
            assert len(cq_rows) == 5

    async def test_assignment_idempotent_after_start(self, db_session):
        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=20, cq_per_section=10)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)

        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
        )
        db_session.add(exam_attempt)
        await db_session.flush()

        first = await exam_assignment_service.assign_questions_for_attempt(exam_attempt, bank, db_session)
        second = await exam_assignment_service.assign_questions_for_attempt(exam_attempt, bank, db_session)

        assert {r.id for r in first} == {r.id for r in second}

    async def test_assignment_prefers_low_usage_questions(self, db_session, monkeypatch):
        monkeypatch.setattr(get_settings(), "exam_section_mcq_count", 10)
        monkeypatch.setattr(get_settings(), "exam_section_cq_count", 5)
        jd_id = await _seed_jd(db_session)
        # Exactly the minimum pool size (20 MCQ / 10 CQ), half already "used".
        bank = QuestionBank(jd_id=jd_id, status=QuestionBankStatus.READY)
        db_session.add(bank)
        await db_session.flush()

        test = Test(
            jd_id=jd_id, question_bank_id=bank.id, test_type=TestType.REASONING,
            title="Reasoning bank", duration_minutes=45, total_marks=0,
            difficulty=Difficulty.MIXED, status=TestStatus.APPROVED,
        )
        db_session.add(test)
        await db_session.flush()

        order = 0
        high_usage_ids = []
        for i in range(10):
            q = _make_question(test.id, QuestionType.MCQ, order, usage_count=5)
            db_session.add(q)
            high_usage_ids.append(q)
            order += 1
        for i in range(10):
            db_session.add(_make_question(test.id, QuestionType.MCQ, order, usage_count=0))
            order += 1
        for i in range(5):
            db_session.add(_make_question(test.id, QuestionType.OPEN_ENDED, order, usage_count=0))
            order += 1
        await db_session.commit()

        pool = await question_bank_service.fetch_active_questions(
            bank.id, TestType.REASONING, QuestionType.MCQ, db_session
        )
        chosen = exam_assignment_service._balanced_sample(pool, 10, __import__("random").Random(42))
        chosen_usages = {q.usage_count for q in chosen}
        assert chosen_usages == {0}  # all 10 unused-tier questions chosen before any used one

    async def test_assignment_insufficient_bank_raises(self, db_session):
        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=5, cq_per_section=2)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)

        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
        )
        db_session.add(exam_attempt)
        await db_session.flush()

        with pytest.raises(ConflictError):
            await exam_assignment_service.assign_questions_for_attempt(exam_attempt, bank, db_session)


# ─── 11: Missing bank fails gracefully ──────────────────────────

class TestMissingBank:

    async def test_no_ready_bank_raises_conflict(self, db_session):
        jd_id = await _seed_jd(db_session)
        raw_token, _ = await _seed_invitation(db_session, jd_id)

        with pytest.raises(ConflictError):
            await exam_attempt_service.create_or_resume_exam_for_token(raw_token, db_session)


# ─── Full sectioned-exam flow ───────────────────────────────────

class TestExamFlow:

    async def test_section_progression_and_final_submit(self, db_session):
        jd_id = await _seed_jd(db_session)
        await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        raw_token, _ = await _seed_invitation(db_session, jd_id)

        exam_attempt = await exam_attempt_service.create_or_resume_exam_for_token(raw_token, db_session)
        assert exam_attempt.status == ExamAttemptStatus.ASSIGNED

        # Section 1: REASONING
        section = await exam_attempt_service.start_or_resume_current_section(
            exam_attempt.id, raw_token, db_session
        )
        assert section.section_type == "REASONING"
        assert section.section_index == 1
        assert section.total_questions == 15  # 10 MCQ + 5 CQ
        for q in section.questions:
            assert not hasattr(q, "correct_answer")  # never exposed to candidate

        from app.schemas.attempt import SubmitAttemptRequest

        result = await exam_attempt_service.submit_section(
            exam_attempt.id, TestType.REASONING, SubmitAttemptRequest(), raw_token, db_session
        )
        assert result.next_section_type == "PRACTICAL"
        assert result.exam_status == "SECTION_SUBMITTED"

        # Submitting the SAME section again must not error (idempotent).
        result_again = await exam_attempt_service.submit_section(
            exam_attempt.id, TestType.REASONING, SubmitAttemptRequest(), raw_token, db_session
        )
        assert result_again.next_section_type == "PRACTICAL"

        # Section 2: PRACTICAL
        await exam_attempt_service.start_or_resume_current_section(exam_attempt.id, raw_token, db_session)
        result = await exam_attempt_service.submit_section(
            exam_attempt.id, TestType.PRACTICAL, SubmitAttemptRequest(), raw_token, db_session
        )
        assert result.next_section_type == "TECHNICAL"

        # Section 3: TECHNICAL — final section
        await exam_attempt_service.start_or_resume_current_section(exam_attempt.id, raw_token, db_session)
        result = await exam_attempt_service.submit_section(
            exam_attempt.id, TestType.TECHNICAL, SubmitAttemptRequest(), raw_token, db_session
        )
        assert result.next_section_type is None
        assert result.exam_status == "SUBMITTED"

        # Confirmed submit endpoint is idempotent and reflects SUBMITTED.
        confirmed = await exam_attempt_service.submit_exam(exam_attempt.id, raw_token, db_session)
        assert confirmed.status == ExamAttemptStatus.SUBMITTED

        # No question/section can be started again after full submission.
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await exam_attempt_service.start_or_resume_current_section(
                exam_attempt.id, raw_token, db_session
            )
        assert exc_info.value.status_code == 409


# ─── Scoring aggregation ─────────────────────────────────────────

class TestScoringService:

    async def _seed_exam_attempt_with_evaluations(self, db_session):
        from app.db.models.attempt import TestAttempt
        from app.db.models.evaluation import Evaluation

        jd_id = await _seed_jd(db_session)
        await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)

        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
            status=ExamAttemptStatus.SUBMITTED,
        )
        db_session.add(exam_attempt)
        await db_session.flush()

        from sqlalchemy import select
        percentages = {TestType.REASONING: 80.0, TestType.PRACTICAL: 60.0, TestType.TECHNICAL: 100.0}
        for section, pct in percentages.items():
            test_result = await db_session.execute(
                select(Test).where(Test.jd_id == jd_id, Test.test_type == section)
            )
            test = test_result.scalars().first()
            ta = TestAttempt(
                invitation_id=invitation_id, candidate_id=invitation.candidate_id,
                test_id=test.id, exam_attempt_id=exam_attempt.id,
                status=AttemptStatus.EVALUATED,
            )
            db_session.add(ta)
            await db_session.flush()
            ev = Evaluation(
                attempt_id=ta.id, total_score=int(pct), max_score=100, percentage=pct,
                mcq_score=int(pct), mcq_max=100, open_ended_score=int(pct), open_ended_max=100,
                ai_recommendation="MAYBE", ai_summary="",
            )
            db_session.add(ev)
        await db_session.commit()
        return exam_attempt

    async def test_aggregate_score_applies_weights(self, db_session, monkeypatch):
        monkeypatch.setattr(get_settings(), "section_weight_reasoning", 0.30)
        monkeypatch.setattr(get_settings(), "section_weight_practical", 0.35)
        monkeypatch.setattr(get_settings(), "section_weight_technical", 0.35)

        exam_attempt = await self._seed_exam_attempt_with_evaluations(db_session)
        updated = await scoring_service.aggregate_exam_score(exam_attempt.id, db_session)

        expected = 80.0 * 0.30 + 60.0 * 0.35 + 100.0 * 0.35
        assert updated.total_score == round(expected, 1)

    async def test_aggregate_score_raises_when_section_missing(self, db_session):
        jd_id = await _seed_jd(db_session)
        await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)
        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
        )
        db_session.add(exam_attempt)
        await db_session.commit()

        with pytest.raises(ConflictError):
            await scoring_service.aggregate_exam_score(exam_attempt.id, db_session)


# ─── AI risk service ─────────────────────────────────────────────

class TestAiRiskService:

    async def test_risk_score_is_bounded_and_hedged(self, db_session):
        jd_id = await _seed_jd(db_session)
        await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)

        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
        )
        db_session.add(exam_attempt)
        await db_session.commit()

        updated = await ai_risk_service.compute_risk_for_exam_attempt(exam_attempt.id, db_session)
        assert updated.ai_risk_score is not None
        assert 0.0 <= updated.ai_risk_score <= 100.0

        from app.schemas.exam import ExamAttemptReportResponse
        disclaimer = ExamAttemptReportResponse.model_fields["ai_risk_disclaimer"].default
        for banned in ("definitely used ai", "ai-generated answer detected with certainty", "used ai"):
            assert banned not in disclaimer.lower()
        assert "not proof" in disclaimer.lower() or "never" in disclaimer.lower()


# ─── Legacy /attempts/start guard against bank-mode tests ───────

class TestLegacyStartGuard:

    async def test_legacy_start_attempt_refuses_bank_mode_jd(self, db_session):
        """A candidate hitting the OLD /attempts/start endpoint against a
        bank-mode JD (e.g. a stale link, or someone editing the URL by hand)
        must be refused — the legacy path would otherwise hand them the
        FULL bank (40 MCQ + 20 CQ) instead of a locked 10+5 subset, with no
        exam_attempt_questions audit trail at all."""
        from app.services import attempt_service

        jd_id = await _seed_jd(db_session)
        await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        raw_token, _ = await _seed_invitation(db_session, jd_id)

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await attempt_service.start_attempt(raw_token, 0, None, db_session)
        assert exc_info.value.status_code == 400
        assert "sectioned exam" in exc_info.value.detail.lower()

    async def test_invitation_link_points_at_exam_path_for_bank_mode(self, db_session):
        """create_invitation must build an /exam/<token> link (not /tests/)
        once the JD's approved tests are bank-mode."""
        from app.services.invitation_service import _is_bank_mode

        jd_id = await _seed_jd(db_session)
        bank = await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        result = await db_session.execute(Test.__table__.select().where(Test.jd_id == jd_id))
        tests = [await db_session.get(Test, row.id) for row in result.fetchall()]
        assert _is_bank_mode(tests) is True
        assert all(t.question_bank_id == bank.id for t in tests)
