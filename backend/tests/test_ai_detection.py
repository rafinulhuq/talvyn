"""
Tests for the opt-in AI-likeness estimate (ai_detection_service.py) and its
wiring into the evaluation pipeline. DB uses in-memory SQLite. No real Ollama.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

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
from app.services.ai_detection_service import estimate_ai_likeness
from app.services.invitation_service import _next_candidate_number


def _valid_ai_detection_json(percentage: float = 72.0) -> str:
    return json.dumps({
        "estimated_ai_percentage": percentage,
        "confidence": "MEDIUM",
        "suspicious_phrases": ["in today's fast-paced environment"],
        "explanation": "The answer uses generic, templated phrasing and lacks any concrete personal detail.",
        "recommendation": "REVIEW_SUGGESTED",
    })


class TestEstimateAiLikenessUnit:
    async def test_disabled_by_default_returns_none_without_calling_ollama(self):
        with patch("app.services.ai_detection_service.ollama_client.generate") as mock_gen:
            result = await estimate_ai_likeness("Question?", "Some candidate answer text.")
        assert result is None
        mock_gen.assert_not_called()

    async def test_empty_text_returns_none(self):
        mock_settings = MagicMock(ai_likeness_enabled=True)
        with patch("app.services.ai_detection_service.get_settings", return_value=mock_settings):
            result = await estimate_ai_likeness("Question?", "   ")
        assert result is None

    async def test_enabled_with_valid_response_returns_result(self):
        mock_settings = MagicMock(ai_likeness_enabled=True)
        with patch("app.services.ai_detection_service.get_settings", return_value=mock_settings), \
             patch(
                 "app.services.ai_detection_service.ollama_client.generate",
                 new=AsyncMock(return_value=_valid_ai_detection_json(80.0)),
             ):
            result = await estimate_ai_likeness("Question?", "A generic templated answer.")
        assert result is not None
        assert result.estimated_ai_percentage == 80.0
        assert result.confidence == "MEDIUM"
        assert result.recommendation == "REVIEW_SUGGESTED"

    async def test_enabled_with_invalid_response_through_retries_returns_none(self):
        mock_settings = MagicMock(ai_likeness_enabled=True)
        with patch("app.services.ai_detection_service.get_settings", return_value=mock_settings), \
             patch(
                 "app.services.ai_detection_service.ollama_client.generate",
                 new=AsyncMock(return_value="not valid json at all"),
             ) as mock_gen:
            result = await estimate_ai_likeness("Question?", "Some answer.")
        assert result is None
        # Initial attempt + MAX_CORRECTION_ATTEMPTS (2) retries = 3 calls
        assert mock_gen.call_count == 3

    async def test_ollama_exception_returns_none_never_raises(self):
        mock_settings = MagicMock(ai_likeness_enabled=True)
        with patch("app.services.ai_detection_service.get_settings", return_value=mock_settings), \
             patch(
                 "app.services.ai_detection_service.ollama_client.generate",
                 new=AsyncMock(side_effect=RuntimeError("Ollama unreachable")),
             ):
            result = await estimate_ai_likeness("Question?", "Some answer.")
        assert result is None


class TestStandaloneAICheckerEndpoint:
    class _FakeRedis:
        def __init__(self):
            self.store = {}

        async def setex(self, key, ttl, value):
            self.store[key] = value

        async def get(self, key):
            return self.store.get(key)

    async def test_extract_pdf_returns_text(self, client, sample_pdf_bytes):
        response = await client.post(
            "/api/v1/ai-checker/extract",
            files={"file": ("sample.pdf", sample_pdf_bytes, "application/pdf")},
        )

        assert response.status_code == 200
        assert "Senior Python Engineer" in response.json()["text"]

    async def test_check_document_returns_estimate_without_feature_flag(self, client):
        document = (
            "In today's fast-paced environment, organizations must leverage robust "
            "communication strategies to ensure optimal outcomes. This document "
            "presents a structured overview with consistent phrasing, broad claims, "
            "and limited concrete personal detail across several related paragraphs."
        )

        with patch(
            "app.services.ai_detection_service.ollama_client.generate",
            new=AsyncMock(return_value=_valid_ai_detection_json(77.0)),
        ) as mock_gen:
            response = await client.post(
                "/api/v1/ai-checker/check",
                json={"title": "sample.txt", "text": document},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["estimated_ai_percentage"] == 77.0
        assert payload["confidence"] == "MEDIUM"
        assert payload["recommendation"] == "HIGH_CONCERN"
        assert payload["chunks_analyzed"] == 1
        assert payload["word_count"] >= 20
        assert "not proof" in payload["disclaimer"]
        mock_gen.assert_called_once()

    async def test_check_document_rejects_too_little_text(self, client):
        response = await client.post(
            "/api/v1/ai-checker/check",
            json={"text": "Too short."},
        )

        assert response.status_code == 422

    async def test_check_document_queue_returns_pollable_job(self, client, monkeypatch):
        from app.main import app
        from app.services import ai_checker_service

        fake_redis = self._FakeRedis()
        monkeypatch.setattr(ai_checker_service, "_redis", fake_redis)
        document = (
            "In today's fast-paced environment, organizations must leverage robust "
            "communication strategies to ensure optimal outcomes. This document "
            "presents a structured overview with consistent phrasing, broad claims, "
            "and limited concrete personal detail across several related paragraphs."
        )

        response = await client.post(
            "/api/v1/ai-checker/jobs",
            json={"title": "sample.txt", "text": document},
        )

        assert response.status_code == 202
        payload = response.json()
        assert payload["status"] == "QUEUED"
        job_id = payload["job_id"]
        app.state.arq_pool.enqueue_job.assert_called_once()
        assert app.state.arq_pool.enqueue_job.call_args[0][0] == "task_check_ai_document"

        status_response = await client.get(f"/api/v1/ai-checker/jobs/{job_id}")
        assert status_response.status_code == 200
        status_payload = status_response.json()
        assert status_payload["job_id"] == job_id
        assert status_payload["status"] == "QUEUED"
        assert status_payload["result"] is None


class TestEvaluationPipelineIntegration:
    """Mirrors tests/test_evaluation.py's TestEvaluationPipeline seed pattern,
    with AI-likeness enabled, to verify end-to-end wiring."""

    async def _seed_submitted_attempt(self, db_session) -> str:
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
            total_marks=10, difficulty=Difficulty.MIXED,
            status=TestStatus.APPROVED,
        )
        q_oe = Question(
            test_id=test_id, question_type=QuestionType.OPEN_ENDED,
            question_text="Design a REST API for a todo app.",
            skill_tested="System Design", difficulty=Difficulty.HARD,
            marks=10, order_index=0,
            expected_answer="Should cover endpoints, HTTP methods, and error handling.",
            scoring_rubric="Full marks: covers CRUD endpoints, status codes, and auth.",
        )
        db_session.add_all([jd, extracted, test, q_oe])

        candidate = Candidate(
            candidate_number=await _next_candidate_number(db_session),
            email=f"ai_det_{uuid.uuid4().hex[:8]}@test.com", name="Tester",
        )
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

        a_oe = CandidateAnswer(
            attempt_id=attempt.id, question_id=q_oe.id,
            answer_text="In today's fast-paced environment, REST APIs are essential.",
        )
        db_session.add(a_oe)
        await db_session.commit()
        return attempt.id

    def _valid_oe_json(self) -> str:
        return json.dumps({
            "score": 6,
            "feedback": "Covers some endpoints but the answer reads as generic and lacks specific detail.",
            "matched_criteria": ["Mentioned REST"],
            "missed_criteria": ["No specific endpoints listed"],
        })

    def _valid_agg_json(self) -> str:
        return json.dumps({
            "strengths": ["Aware of REST conventions"],
            "weaknesses": ["Lacks specificity"],
            "recommendation": "MAYBE",
            "summary": "The candidate shows basic awareness of REST principles but the answer lacks concrete, specific detail throughout.",
        })

    async def test_ai_likeness_populates_question_and_evaluation_fields(self, db_session):
        from app.services.evaluation_service import evaluate_attempt

        attempt_id = await self._seed_submitted_attempt(db_session)

        mock_settings = MagicMock(ai_likeness_enabled=True)
        with patch("app.services.ai_detection_service.get_settings", return_value=mock_settings), \
             patch(
                 "app.services.evaluation_service.ollama_client.generate",
                 new=AsyncMock(side_effect=[
                     self._valid_oe_json(),
                     _valid_ai_detection_json(80.0),
                     self._valid_agg_json(),
                 ]),
             ):
            evaluation = await evaluate_attempt(attempt_id, db_session)

        assert evaluation.overall_ai_likeness_percentage == 80.0
        assert evaluation.overall_ai_detection_confidence.value == "MEDIUM"
        assert evaluation.flagged_answer_count == 1

        from sqlalchemy import select

        from app.db.models.evaluation import QuestionFeedback

        qf_result = await db_session.execute(
            select(QuestionFeedback).where(QuestionFeedback.evaluation_id == evaluation.id)
        )
        qf = qf_result.scalars().one()
        assert qf.estimated_ai_percentage == 80.0
        assert qf.ai_detection_confidence.value == "MEDIUM"
        assert qf.ai_detection_recommendation.value == "REVIEW_SUGGESTED"
        assert qf.suspicious_phrases == ["in today's fast-paced environment"]

    async def test_ai_likeness_disabled_leaves_fields_null(self, db_session):
        """Regression: default (disabled) behavior is unchanged."""
        from app.services.evaluation_service import evaluate_attempt

        attempt_id = await self._seed_submitted_attempt(db_session)

        with patch(
            "app.services.evaluation_service.ollama_client.generate",
            new=AsyncMock(side_effect=[self._valid_oe_json(), self._valid_agg_json()]),
        ):
            evaluation = await evaluate_attempt(attempt_id, db_session)

        assert evaluation.overall_ai_likeness_percentage is None
        assert evaluation.overall_ai_detection_confidence is None
        assert evaluation.flagged_answer_count == 0

        from sqlalchemy import select

        from app.db.models.evaluation import QuestionFeedback

        qf_result = await db_session.execute(
            select(QuestionFeedback).where(QuestionFeedback.evaluation_id == evaluation.id)
        )
        qf = qf_result.scalars().one()
        assert qf.estimated_ai_percentage is None
