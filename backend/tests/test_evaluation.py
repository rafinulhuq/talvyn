"""
Tests for evaluation service and API endpoints.
Ollama is fully mocked. DB is in-memory SQLite.
"""

import json
import random
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.core.security import generate_token, hash_token, make_expiry
from app.db.models.attempt import CandidateAnswer, TestAttempt
from app.db.models.candidate import Candidate, Invitation
from app.db.models.enums import (
    AttemptStatus,
    Difficulty,
    FileType,
    InvitationStatus,
    ParseStatus,
    QuestionType,
    TestStatus,
    TestType,
)
from app.db.models.evaluation import Evaluation
from app.schemas.evaluation import AggregateEvalAI, OpenEndedEvalAI
from app.services.evaluation_service import (
    _scale_score,
    _score_mcqs,
    _try_validate_agg,
)
from app.services.invitation_service import _next_candidate_number

# ─── Unit: MCQ scoring ────────────────────────────────────────

class TestScoreMCQs:
    attempt_id = "attempt-1"

    def _make_question(self, q_id, correct, marks=2):
        from types import SimpleNamespace
        return SimpleNamespace(
            id=q_id,
            question_type=QuestionType.MCQ,
            correct_answer=correct,
            marks=marks,
            options=[
                {"label": "A", "text": "Option A", "is_correct": correct.upper() == "A"},
                {"label": "B", "text": "Option B", "is_correct": correct.upper() == "B"},
                {"label": "C", "text": "Option C", "is_correct": correct.upper() == "C"},
                {"label": "D", "text": "Option D", "is_correct": correct.upper() == "D"},
            ],
        )

    def _make_answer(self, q_id, selected):
        from types import SimpleNamespace
        return SimpleNamespace(
            question_id=q_id,
            selected_option=selected,
            answer_text=None,
        )

    def _display_label_for_original(self, question, original_label):
        original_labels = [option["label"] for option in question.options]
        rng = random.Random(self.attempt_id + question.id)
        rng.shuffle(original_labels)
        return ["A", "B", "C", "D"][original_labels.index(original_label.upper())]

    def test_correct_answer_gets_full_marks(self):
        q = self._make_question("q1", "B", marks=2)
        a = self._make_answer("q1", self._display_label_for_original(q, "B"))
        result = _score_mcqs([q], {"q1": a}, self.attempt_id)
        assert result[0]["awarded_score"] == 2
        assert result[0]["is_correct"] is True

    def test_wrong_answer_gets_zero(self):
        q = self._make_question("q1", "B", marks=2)
        a = self._make_answer("q1", self._display_label_for_original(q, "C"))
        result = _score_mcqs([q], {"q1": a}, self.attempt_id)
        assert result[0]["awarded_score"] == 0
        assert result[0]["is_correct"] is False

    def test_no_answer_gets_zero(self):
        q = self._make_question("q1", "A", marks=3)
        result = _score_mcqs([q], {}, self.attempt_id)
        assert result[0]["awarded_score"] == 0
        assert result[0]["is_correct"] is False

    def test_case_insensitive_matching(self):
        q = self._make_question("q1", "b", marks=2)
        a = self._make_answer("q1", self._display_label_for_original(q, "B"))
        result = _score_mcqs([q], {"q1": a}, self.attempt_id)
        assert result[0]["is_correct"] is True

    def test_multiple_questions(self):
        questions = [
            self._make_question("q1", "A", 2),
            self._make_question("q2", "C", 3),
            self._make_question("q3", "D", 2),
        ]
        answers = {
            "q1": self._make_answer("q1", self._display_label_for_original(questions[0], "A")),
            "q2": self._make_answer("q2", self._display_label_for_original(questions[1], "B")),
            # q3 not answered
        }
        result = _score_mcqs(questions, answers, self.attempt_id)
        assert result[0]["awarded_score"] == 2
        assert result[1]["awarded_score"] == 0
        assert result[2]["awarded_score"] == 0
        assert sum(r["awarded_score"] for r in result) == 2


# ─── Unit: Scale score ────────────────────────────────────────

class TestScaleScore:

    def test_perfect_score(self):
        assert _scale_score(10, 10, 15) == 15

    def test_zero_score(self):
        assert _scale_score(0, 10, 15) == 0

    def test_half_score(self):
        assert _scale_score(5, 10, 10) == 5

    def test_scale_up(self):
        assert _scale_score(7, 10, 20) == 14

    def test_zero_max_returns_zero(self):
        assert _scale_score(5, 0, 10) == 0

    def test_rounds_correctly(self):
        # 7/10 * 3 = 2.1 → rounds to 2
        assert _scale_score(7, 10, 3) == 2


# ─── Unit: AI schema validation ───────────────────────────────

class TestOpenEndedEvalAI:

    def test_valid_response(self):
        data = {
            "score": 7,
            "feedback": "The candidate demonstrated understanding of basic concepts but missed database sharding entirely.",
            "matched_criteria": ["Covered REST API design"],
            "missed_criteria": ["No mention of database sharding", "Missing caching strategy"],
        }
        result = OpenEndedEvalAI.model_validate(data)
        assert result.score == 7

    def test_score_above_10_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            OpenEndedEvalAI.model_validate({
                "score": 11,
                "feedback": "Excellent comprehensive answer covering all key topics thoroughly.",
                "matched_criteria": [],
                "missed_criteria": [],
            })

    def test_score_below_0_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            OpenEndedEvalAI.model_validate({
                "score": -1,
                "feedback": "Excellent comprehensive answer covering all key topics.",
                "matched_criteria": [],
                "missed_criteria": [],
            })

    def test_short_feedback_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            OpenEndedEvalAI.model_validate({
                "score": 5,
                "feedback": "OK.",
                "matched_criteria": [],
                "missed_criteria": [],
            })


class TestAggregateEvalAI:

    def test_valid_response(self):
        data = {
            "strengths": ["Strong Python fundamentals", "Good system design thinking"],
            "weaknesses": ["Weak on database internals"],
            "recommendation": "HIRE",
            "summary": "The candidate demonstrated solid Python knowledge and showed good architectural thinking. Some gaps in database optimization but overall a strong candidate for a mid-level role.",
        }
        result = AggregateEvalAI.model_validate(data)
        assert result.recommendation == "HIRE"

    def test_invalid_recommendation_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            AggregateEvalAI.model_validate({
                "strengths": ["Strong skills"],
                "weaknesses": [],
                "recommendation": "DEFINITELY_HIRE",
                "summary": "Excellent candidate with strong technical background and communication skills.",
            })

    def test_strong_hire_requires_strength(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            AggregateEvalAI.model_validate({
                "strengths": [],
                "weaknesses": [],
                "recommendation": "STRONG_HIRE",
                "summary": "A very strong candidate who performed excellently across all assessment areas.",
            })

    def test_try_validate_agg_with_fence(self):
        data = {
            "strengths": ["Python expertise"],
            "weaknesses": [],
            "recommendation": "HIRE",
            "summary": "Strong candidate with excellent technical foundations demonstrated throughout the assessment.",
        }
        raw = f"```json\n{json.dumps(data)}\n```"
        result, error = _try_validate_agg(raw)
        assert result is not None
        assert error == ""


# ─── Integration: Full evaluation pipeline ────────────────────

class TestEvaluationPipeline:

    async def _seed_submitted_attempt(self, db_session) -> tuple[str, str]:
        """Seed a complete stack and return (attempt_id, test_id)."""
        import uuid

        from app.db.models.job_description import JdExtractedData, JobDescription
        from app.db.models.test import Question, Test

        jd_id = str(uuid.uuid4())
        test_id = str(uuid.uuid4())

        jd = JobDescription(
            id=jd_id,
            uploaded_by="00000000-0000-0000-0000-000000000000",
            original_filename="r.pdf",
            file_path="jds/r.pdf",
            file_type=FileType.PDF,
            raw_text="Engineer",
            parse_status=ParseStatus.DONE,
        )
        extracted = JdExtractedData(
            jd_id=jd_id, job_title="Engineer", seniority_level="senior",
            must_have_skills=[], nice_to_have_skills=[],
            tools_technologies=[], responsibilities=[],
            recommended_test_topics=[], difficulty_distribution={},
        )
        test = Test(
            id=test_id, jd_id=jd_id,
            test_type=TestType.TECHNICAL,
            title="Tech Test", duration_minutes=60,
            total_marks=30, difficulty=Difficulty.MIXED,
            status=TestStatus.APPROVED,
        )
        q_mcq = Question(
            test_id=test_id, question_type=QuestionType.MCQ,
            question_text="What does async/await do in Python?",
            skill_tested="Python", difficulty=Difficulty.MEDIUM,
            marks=2, order_index=0,
            options=[
                {"label": "A", "text": "Blocks thread", "is_correct": False},
                {"label": "B", "text": "Non-blocking I/O", "is_correct": True},
                {"label": "C", "text": "New thread", "is_correct": False},
                {"label": "D", "text": "Only for files", "is_correct": False},
            ],
            correct_answer="B",
            explanation="asyncio enables non-blocking I/O.",
        )
        q_oe = Question(
            test_id=test_id, question_type=QuestionType.OPEN_ENDED,
            question_text="Design a REST API for a todo app.",
            skill_tested="System Design", difficulty=Difficulty.HARD,
            marks=10, order_index=1,
            expected_answer="Should cover endpoints, HTTP methods, and error handling.",
            scoring_rubric="Full marks: covers CRUD endpoints, status codes, and auth. Half: covers 2/3.",
        )
        db_session.add_all([jd, extracted, test, q_mcq, q_oe])

        import uuid as _uuid
        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email=f"eval_{_uuid.uuid4().hex[:8]}@test.com", name="Tester")
        db_session.add(candidate)
        await db_session.flush()

        inv = Invitation(
            candidate_id=candidate.id, jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(generate_token()),
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.OPENED,
        )
        db_session.add(inv)
        await db_session.flush()

        attempt = TestAttempt(
            invitation_id=inv.id, candidate_id=candidate.id,
            test_id=test_id, status=AttemptStatus.SUBMITTED,
        )
        db_session.add(attempt)
        await db_session.flush()

        # Answers: correct MCQ, some OE text
        original_labels = [option["label"] for option in q_mcq.options]
        rng = random.Random(attempt.id + q_mcq.id)
        rng.shuffle(original_labels)
        displayed_correct_label = ["A", "B", "C", "D"][
            original_labels.index(q_mcq.correct_answer)
        ]
        a_mcq = CandidateAnswer(
            attempt_id=attempt.id, question_id=q_mcq.id,
            selected_option=displayed_correct_label,
        )
        a_oe = CandidateAnswer(
            attempt_id=attempt.id, question_id=q_oe.id,
            answer_text="I would create GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id with proper status codes.",
        )
        db_session.add_all([a_mcq, a_oe])
        await db_session.commit()
        return attempt.id, test_id

    def _valid_oe_json(self) -> str:
        return json.dumps({
            "score": 7,
            "feedback": "The candidate covered the main CRUD endpoints correctly but missed authentication and error handling details.",
            "matched_criteria": ["Correct CRUD endpoints", "Mentioned status codes"],
            "missed_criteria": ["No mention of authentication", "Missing error handling"],
        })

    def _valid_agg_json(self) -> str:
        return json.dumps({
            "strengths": ["Good grasp of REST principles", "Knows Python async basics"],
            "weaknesses": ["Weak on API security"],
            "recommendation": "HIRE",
            "summary": "The candidate demonstrates solid Python knowledge and REST API skills. Some gaps in security best practices but overall suitable for a mid-level engineering role.",
        })

    async def test_evaluation_creates_evaluation_record(self, db_session):
        from app.services.evaluation_service import evaluate_attempt

        attempt_id, _ = await self._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[
                self._valid_oe_json(),   # open-ended eval
                self._valid_agg_json(),  # aggregate eval
            ],
        ):
            evaluation = await evaluate_attempt(attempt_id, db_session)

        assert evaluation.attempt_id == attempt_id
        assert evaluation.is_preliminary is True
        assert evaluation.total_score >= 0
        assert evaluation.max_score == 12  # 2 MCQ + 10 OE
        assert evaluation.mcq_score == 2   # correct answer
        assert evaluation.ai_recommendation is not None

    async def test_mcq_scored_correctly(self, db_session):
        from app.services.evaluation_service import evaluate_attempt

        attempt_id, _ = await self._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[self._valid_oe_json(), self._valid_agg_json()],
        ):
            evaluation = await evaluate_attempt(attempt_id, db_session)

        assert evaluation.mcq_score == 2
        assert evaluation.mcq_max == 2

    async def test_question_feedback_rows_created(self, db_session):
        from sqlalchemy import select

        from app.db.models.evaluation import QuestionFeedback
        from app.services.evaluation_service import evaluate_attempt

        attempt_id, _ = await self._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[self._valid_oe_json(), self._valid_agg_json()],
        ):
            evaluation = await evaluate_attempt(attempt_id, db_session)

        result = await db_session.execute(
            select(QuestionFeedback).where(
                QuestionFeedback.evaluation_id == evaluation.id
            )
        )
        feedback_rows = result.scalars().all()
        assert len(feedback_rows) == 2   # 1 MCQ + 1 OE

    async def test_is_preliminary_always_true(self, db_session):
        from app.services.evaluation_service import evaluate_attempt

        attempt_id, _ = await self._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[self._valid_oe_json(), self._valid_agg_json()],
        ):
            evaluation = await evaluate_attempt(attempt_id, db_session)

        assert evaluation.is_preliminary is True

    async def test_reevaluation_replaces_existing(self, db_session):
        from sqlalchemy import func, select

        from app.services.evaluation_service import evaluate_attempt

        attempt_id, _ = await self._seed_submitted_attempt(db_session)

        mocks = [self._valid_oe_json(), self._valid_agg_json()]

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=mocks * 2,
        ):
            await evaluate_attempt(attempt_id, db_session)
            await evaluate_attempt(attempt_id, db_session)

        result = await db_session.execute(
            select(func.count(Evaluation.id)).where(
                Evaluation.attempt_id == attempt_id
            )
        )
        count = result.scalar_one()
        assert count == 1, "Re-evaluation should replace, not append"


# ─── API: Trigger endpoint ────────────────────────────────────

class TestEvaluationAPI:

    async def test_trigger_returns_201(self, client: AsyncClient, db_session):
        from tests.test_evaluation import TestEvaluationPipeline

        pipeline = TestEvaluationPipeline()
        attempt_id, _ = await pipeline._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[
                pipeline._valid_oe_json(),
                pipeline._valid_agg_json(),
            ],
        ):
            resp = await client.post(
                "/api/v1/evaluation/trigger",
                json={"attempt_id": attempt_id},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["attempt_id"] == attempt_id
        assert data["is_preliminary"] is True
        assert "ai_recommendation" in data
        assert "question_feedback" in data

    async def test_trigger_non_submitted_returns_409(
        self, client: AsyncClient, db_session
    ):
        import uuid

        from app.db.models.attempt import TestAttempt
        from app.db.models.candidate import Candidate, Invitation
        from app.db.models.job_description import JobDescription
        from app.db.models.test import Test

        # Create a NOT_STARTED attempt
        jd_id = str(uuid.uuid4())
        test_id = str(uuid.uuid4())
        jd = JobDescription(
            id=jd_id,
            uploaded_by="00000000-0000-0000-0000-000000000000",
            original_filename="r.pdf", file_path="jds/r.pdf",
            file_type=FileType.PDF, parse_status=ParseStatus.DONE,
        )
        test = Test(
            id=test_id, jd_id=jd_id, test_type=TestType.TECHNICAL,
            title="T", duration_minutes=60, total_marks=10,
            difficulty=Difficulty.MEDIUM, status=TestStatus.APPROVED,
        )
        candidate = Candidate(candidate_number=await _next_candidate_number(db_session), email=f"api_{uuid.uuid4().hex[:8]}@test.com", name="A")
        db_session.add_all([jd, test, candidate])
        await db_session.flush()

        inv = Invitation(
            candidate_id=candidate.id, jd_id=jd_id,
            invited_by="00000000-0000-0000-0000-000000000000",
            token_hash=hash_token(generate_token()),
            expires_at=make_expiry(hours=72),
            status=InvitationStatus.OPENED,
        )
        db_session.add(inv)
        await db_session.flush()

        attempt = TestAttempt(
            invitation_id=inv.id, candidate_id=candidate.id,
            test_id=test_id, status=AttemptStatus.IN_PROGRESS,  # NOT submitted
        )
        db_session.add(attempt)
        await db_session.commit()

        resp = await client.post(
            "/api/v1/evaluation/trigger",
            json={"attempt_id": attempt.id},
        )
        assert resp.status_code == 409

    async def test_get_nonexistent_returns_404(self, client: AsyncClient):
        resp = await client.get(
            "/api/v1/evaluation/00000000-0000-0000-0000-000000000000"
        )
        assert resp.status_code == 404

    async def test_mcq_feedback_candidate_answer_in_same_coordinates_as_options(
        self, client: AsyncClient, db_session
    ):
        """
        question_options/correct_answer are returned in the question's
        original STORED label order; candidate_answer must be translated
        into that same coordinate system (not left as the per-attempt
        SHUFFLED label the candidate actually clicked), or the admin-facing
        breakdown highlights the wrong option as "what the candidate picked".
        """
        from tests.test_evaluation import TestEvaluationPipeline

        pipeline = TestEvaluationPipeline()
        attempt_id, _ = await pipeline._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[pipeline._valid_oe_json(), pipeline._valid_agg_json()],
        ):
            await client.post("/api/v1/evaluation/trigger", json={"attempt_id": attempt_id})

        resp = await client.get(f"/api/v1/evaluation/{attempt_id}")
        assert resp.status_code == 200
        mcq_feedback = next(
            fb for fb in resp.json()["question_feedback"] if fb["question_type"] == "MCQ"
        )

        # Seed always answers the MCQ correctly (displayed_correct_label) —
        # candidate_answer, once translated, must equal the stored
        # correct_answer ("B") and point at the option actually flagged
        # is_correct, not at whatever label happened to be shuffled-correct.
        assert mcq_feedback["correct_answer"] == "B"
        assert mcq_feedback["candidate_answer"] == "B"
        assert mcq_feedback["is_correct"] is True
        chosen_option = next(
            opt for opt in mcq_feedback["question_options"]
            if opt["label"] == mcq_feedback["candidate_answer"]
        )
        assert chosen_option["is_correct"] is True

    async def test_mcq_feedback_wrong_answer_points_at_wrong_option(
        self, client: AsyncClient, db_session
    ):
        from tests.test_evaluation import TestEvaluationPipeline

        pipeline = TestEvaluationPipeline()
        attempt_id, test_id = await pipeline._seed_submitted_attempt(db_session)

        # Overwrite the seeded (always-correct) MCQ answer with a
        # deliberately wrong one, expressed as a shuffled/displayed label —
        # exactly what a real candidate's browser would submit.
        from sqlalchemy import select

        from app.db.models.attempt import CandidateAnswer
        from app.db.models.test import Question

        q_mcq = (
            await db_session.execute(
                select(Question).where(
                    Question.test_id == test_id, Question.question_type == QuestionType.MCQ
                )
            )
        ).scalar_one()
        original_labels = [o["label"] for o in q_mcq.options]
        rng = random.Random(attempt_id + q_mcq.id)
        rng.shuffle(original_labels)
        # Pick a displayed label that maps back to a WRONG original option.
        wrong_original = next(lbl for lbl in original_labels if lbl != q_mcq.correct_answer)
        displayed_wrong_label = ["A", "B", "C", "D"][original_labels.index(wrong_original)]

        answer = (
            await db_session.execute(
                select(CandidateAnswer).where(
                    CandidateAnswer.attempt_id == attempt_id,
                    CandidateAnswer.question_id == q_mcq.id,
                )
            )
        ).scalar_one()
        answer.selected_option = displayed_wrong_label
        await db_session.commit()

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[pipeline._valid_oe_json(), pipeline._valid_agg_json()],
        ):
            await client.post("/api/v1/evaluation/trigger", json={"attempt_id": attempt_id})

        resp = await client.get(f"/api/v1/evaluation/{attempt_id}")
        data = next(
            fb for fb in resp.json()["question_feedback"] if fb["question_type"] == "MCQ"
        )

        assert data["is_correct"] is False
        assert data["candidate_answer"] == wrong_original
        assert data["candidate_answer"] != data["correct_answer"]
        chosen_option = next(
            opt for opt in data["question_options"] if opt["label"] == data["candidate_answer"]
        )
        assert chosen_option["is_correct"] is False

    async def test_override_saves_recommendation(
        self, client: AsyncClient, db_session
    ):
        from tests.test_evaluation import TestEvaluationPipeline

        pipeline = TestEvaluationPipeline()
        attempt_id, _ = await pipeline._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            side_effect=[
                pipeline._valid_oe_json(),
                pipeline._valid_agg_json(),
            ],
        ):
            await client.post(
                "/api/v1/evaluation/trigger",
                json={"attempt_id": attempt_id},
            )

        resp = await client.patch(
            f"/api/v1/evaluation/{attempt_id}/override",
            json={"recommendation": "NO_HIRE", "notes": "Candidate lacked depth in systems thinking."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["admin_override_recommendation"] == "NO_HIRE"
        assert data["admin_notes"] is not None
        assert data["is_preliminary"] is True   # Never changed
