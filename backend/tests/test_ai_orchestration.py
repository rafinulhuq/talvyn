"""
Tests for the AI orchestration layer (Master Prompt 3): provider routing,
the GLM-vs-local cost-control rules, batched CQ evaluation, the explicit
MCQ/CQ section-score blend, and AI-risk bucketing. All Ollama/GLM calls
mocked — no real AI needed. Reuses the seeding helpers from
tests/test_question_bank.py.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.config import get_settings
from app.core.exceptions import ConflictError
from app.db.models.attempt import CandidateAnswer, TestAttempt
from app.db.models.enums import (
    AttemptStatus,
    Difficulty,
    ExamAttemptStatus,
    QuestionBankStatus,
    QuestionType,
    TestStatus,
    TestType,
)
from app.db.models.evaluation import Evaluation, QuestionFeedback
from app.db.models.question_bank import ExamAttempt
from app.db.models.test import Question, Test
from app.services import (
    ai_provider_service,
    ai_risk_service,
    ai_task_router_service,
    cq_batch_evaluation_service,
    evaluation_service,
    scoring_service,
)
from app.services.ai_provider_service import AiGenerateRequest, AiGenerateResponse
from app.services.ai_task_router_service import DeepReviewContext
from app.services.question_bank_service import SECTION_ORDER
from tests.test_question_bank import (
    Invitation,
    _make_question,
    _seed_invitation,
    _seed_jd,
)


def _enable_glm(monkeypatch):
    monkeypatch.setattr(get_settings(), "glm_enabled", True)
    monkeypatch.setattr(get_settings(), "glm_api_base_url", "https://example.test/v1")
    monkeypatch.setattr(get_settings(), "glm_api_key", "fake-key")


# ─── 1, 3: Task routing selects the correct default provider ───

class TestTaskRouting:

    def test_local_only_tasks_never_escalate(self, monkeypatch):
        _enable_glm(monkeypatch)
        assert ai_task_router_service.choose_provider("jd_skills_extraction") == "local"
        assert ai_task_router_service.choose_provider("topic_mapping") == "local"

    def test_glm_tasks_fall_back_to_local_when_unconfigured(self):
        assert ai_task_router_service.glm_configured() is False
        assert ai_task_router_service.choose_provider("question_bank_generation") == "local"
        assert ai_task_router_service.choose_provider("rubric_generation") == "local"
        assert ai_task_router_service.choose_provider("question_review") == "local"

    def test_glm_tasks_route_to_glm_when_configured(self, monkeypatch):
        _enable_glm(monkeypatch)
        assert ai_task_router_service.choose_provider("question_bank_generation") == "glm"
        assert ai_task_router_service.choose_provider("question_review") == "glm"

    def test_cq_evaluation_defaults_to_local(self, monkeypatch):
        _enable_glm(monkeypatch)
        assert ai_task_router_service.choose_provider("cq_evaluation") == "local"
        assert ai_task_router_service.choose_provider("cq_evaluation", DeepReviewContext()) == "local"


# ─── 5: GLM only used for deep-review triggers ──────────────────

class TestDeepReviewEscalation:

    def test_no_trigger_stays_local(self, monkeypatch):
        _enable_glm(monkeypatch)
        ctx = DeepReviewContext(is_top_candidate=False, is_borderline=False, ai_risk_score=10.0)
        assert ai_task_router_service.should_deep_review(ctx) is False
        assert ai_task_router_service.choose_provider("cq_evaluation", ctx) == "local"

    def test_high_ai_risk_triggers_glm(self, monkeypatch):
        _enable_glm(monkeypatch)
        ctx = DeepReviewContext(ai_risk_score=95.0)
        assert ai_task_router_service.should_deep_review(ctx) is True
        assert ai_task_router_service.choose_provider("cq_evaluation", ctx) == "glm"

    def test_top_candidate_triggers_deep_review(self, monkeypatch):
        ctx = DeepReviewContext(is_top_candidate=True)
        assert ai_task_router_service.should_deep_review(ctx) is True

    def test_borderline_triggers_deep_review(self, monkeypatch):
        ctx = DeepReviewContext(is_borderline=True)
        assert ai_task_router_service.should_deep_review(ctx) is True

    def test_admin_requested_always_triggers(self, monkeypatch):
        ctx = DeepReviewContext(admin_requested=True)
        assert ai_task_router_service.should_deep_review(ctx) is True

    def test_low_local_confidence_triggers(self, monkeypatch):
        ctx = DeepReviewContext(local_confidence=0.2)
        assert ai_task_router_service.should_deep_review(ctx) is True

    def test_deep_review_trigger_without_glm_configured_stays_local(self):
        ctx = DeepReviewContext(admin_requested=True)
        assert ai_task_router_service.choose_provider("cq_evaluation", ctx) == "local"

    def test_classify_score_top_and_borderline(self, monkeypatch):
        monkeypatch.setattr(get_settings(), "deep_review_top_candidate_threshold", 85.0)
        monkeypatch.setattr(get_settings(), "deep_review_borderline_window", 10.0)
        is_top, is_borderline = ai_task_router_service.classify_score(90.0)
        assert is_top is True
        is_top2, is_borderline2 = ai_task_router_service.classify_score(70.0)  # near the 65 boundary
        assert is_borderline2 is True


# ─── 7: Invalid AI JSON handled safely (never raises) ───────────

class TestProviderErrorHandling:

    async def test_invalid_json_returns_failed_response_not_exception(self):
        with patch(
            "app.services.ollama_service.ollama_client.generate",
            new=AsyncMock(return_value="not valid json at all {{{"),
        ):
            from app.schemas.ai_orchestration import BatchedCqEvaluationAI

            req = AiGenerateRequest(
                task_type="cq_evaluation",
                system_prompt="sys",
                user_prompt="user",
                model_preference="local",
                expected_json_schema=BatchedCqEvaluationAI,
            )
            response = await ai_provider_service.generate(req)

        assert response.success is False
        assert response.error is not None

    async def test_glm_unconfigured_request_falls_back_without_crashing(self):
        req = AiGenerateRequest(
            task_type="question_bank_generation",
            system_prompt="sys",
            user_prompt="user",
            model_preference="glm",
        )
        with patch(
            "app.services.ollama_service.ollama_client.generate",
            new=AsyncMock(return_value=json.dumps({"ok": True})),
        ):
            response = await ai_provider_service.generate(req)
        assert response.provider == "local"
        assert response.success is True


# ─── 8: MCQ grading works (via the public alias) ────────────────

class TestMcqGrading:

    def test_score_mcqs_is_exposed_and_callable(self):
        assert evaluation_service.score_mcqs is evaluation_service._score_mcqs


# ─── 9, 12: Batched CQ evaluation + answer preservation on failure ──

class TestBatchedCqEvaluation:

    async def _seed_full_exam(self, db_session, monkeypatch):
        monkeypatch.setattr(get_settings(), "exam_section_mcq_count", 2)
        monkeypatch.setattr(get_settings(), "exam_section_cq_count", 1)
        monkeypatch.setattr(get_settings(), "bank_mcq_minimum", 2)
        monkeypatch.setattr(get_settings(), "bank_cq_minimum", 1)

        jd_id = await _seed_jd(db_session)

        from app.db.models.question_bank import ExamAttemptQuestion, QuestionBank

        bank = QuestionBank(jd_id=jd_id, status=QuestionBankStatus.READY)
        db_session.add(bank)
        await db_session.flush()

        question_ids: dict[TestType, dict[str, list[str]]] = {}
        for section in SECTION_ORDER:
            test = Test(
                jd_id=jd_id, question_bank_id=bank.id, test_type=section,
                title=f"{section.value} bank", duration_minutes=30, total_marks=0,
                difficulty=Difficulty.MIXED, status=TestStatus.APPROVED,
            )
            db_session.add(test)
            await db_session.flush()
            mcq_ids, cq_ids = [], []
            for i in range(2):
                q = _make_question(test.id, QuestionType.MCQ, i)
                db_session.add(q)
                await db_session.flush()
                mcq_ids.append(q.id)
            cq = _make_question(test.id, QuestionType.OPEN_ENDED, 2)
            db_session.add(cq)
            await db_session.flush()
            cq_ids.append(cq.id)
            question_ids[section] = {"mcq": mcq_ids, "cq": cq_ids}
        await db_session.commit()

        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)

        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
            status=ExamAttemptStatus.SUBMITTED,
        )
        db_session.add(exam_attempt)
        await db_session.flush()

        section_attempts = {}
        for section in SECTION_ORDER:
            test_result = await db_session.execute(
                Test.__table__.select().where(
                    Test.jd_id == jd_id, Test.test_type == section
                )
            )
            test_row = test_result.first()
            ta = TestAttempt(
                invitation_id=invitation_id, candidate_id=invitation.candidate_id,
                test_id=test_row.id, exam_attempt_id=exam_attempt.id,
                status=AttemptStatus.SUBMITTED,
            )
            db_session.add(ta)
            await db_session.flush()
            section_attempts[section] = ta

            for qid in question_ids[section]["mcq"]:
                db_session.add(ExamAttemptQuestion(
                    exam_attempt_id=exam_attempt.id, question_id=qid,
                    section_type=section.value, question_type="MCQ",
                ))
                # _make_question always sets correct_answer="B" with option text
                # "Right" — find which label the per-attempt shuffle puts that
                # text under, so the seeded answer is genuinely correct after
                # evaluation_service's shuffle-reversal, not just by label luck.
                from app.services.attempt_service import build_safe_question
                q_obj = await db_session.get(Question, qid)
                safe = build_safe_question(q_obj, ta.id)
                shuffled_label = next(o["label"] for o in safe.options if o["text"] == "Right")
                db_session.add(CandidateAnswer(attempt_id=ta.id, question_id=qid, selected_option=shuffled_label))
            for qid in question_ids[section]["cq"]:
                db_session.add(ExamAttemptQuestion(
                    exam_attempt_id=exam_attempt.id, question_id=qid,
                    section_type=section.value, question_type="OPEN_ENDED",
                ))
                db_session.add(CandidateAnswer(
                    attempt_id=ta.id, question_id=qid,
                    answer_text="A thorough answer covering the rubric points in detail.",
                ))
        await db_session.commit()
        return exam_attempt, section_attempts, question_ids

    async def test_batched_evaluation_persists_scores_for_all_sections(self, db_session, monkeypatch):
        exam_attempt, section_attempts, question_ids = await self._seed_full_exam(db_session, monkeypatch)

        def _fake_response(req, db=None):
            answers = []
            for section in SECTION_ORDER:
                for qid in question_ids[section]["cq"]:
                    answers.append({
                        "question_id": qid, "section_type": section.value,
                        "score": 8, "max_score": 10, "strengths": ["clear"], "weaknesses": [],
                        "feedback": "Good answer overall.", "confidence": 0.9,
                    })
            payload = {
                "section_scores": {s.value: {"cq_score": 8, "max_score": 10, "feedback": "ok"} for s in SECTION_ORDER},
                "answers": answers,
                "overall_strengths": ["clarity"], "overall_weaknesses": [],
                "evaluation_confidence": 0.9, "recommendation": "shortlist",
            }
            from app.schemas.ai_orchestration import BatchedCqEvaluationAI
            return AiGenerateResponse(
                success=True, model_used="local-test", provider="local",
                parsed_json=BatchedCqEvaluationAI.model_validate(payload),
            )

        with patch(
            "app.services.ai_provider_service.generate",
            new=AsyncMock(side_effect=_fake_response),
        ):
            evaluation = await cq_batch_evaluation_service.evaluate_exam_batched(exam_attempt.id, db_session)

        assert evaluation is not None
        for section, ta in section_attempts.items():
            await db_session.refresh(ta)
            assert ta.status == AttemptStatus.EVALUATED
            ev_result = await db_session.execute(
                Evaluation.__table__.select().where(Evaluation.attempt_id == ta.id)
            )
            ev_row = ev_result.first()
            assert ev_row is not None
            assert ev_row.mcq_score == 4  # 2 correct MCQ x marks=2 each... selected "B" matches fixture's correct answer
            assert ev_row.open_ended_score == 8

    async def test_batched_evaluation_persists_ai_likeness_for_written_answers(self, db_session, monkeypatch):
        exam_attempt, section_attempts, question_ids = await self._seed_full_exam(db_session, monkeypatch)

        def _fake_response(req, db=None):
            answers = []
            for section in SECTION_ORDER:
                for qid in question_ids[section]["cq"]:
                    answers.append({
                        "question_id": qid, "section_type": section.value,
                        "score": 8, "max_score": 10, "strengths": ["clear"], "weaknesses": [],
                        "feedback": "Good answer overall.", "confidence": 0.9,
                    })
            payload = {
                "section_scores": {s.value: {"cq_score": 8, "max_score": 10, "feedback": "ok"} for s in SECTION_ORDER},
                "answers": answers,
                "overall_strengths": ["clarity"], "overall_weaknesses": [],
                "evaluation_confidence": 0.9, "recommendation": "shortlist",
            }
            from app.schemas.ai_orchestration import BatchedCqEvaluationAI
            return AiGenerateResponse(
                success=True, model_used="local-test", provider="local",
                parsed_json=BatchedCqEvaluationAI.model_validate(payload),
            )

        from app.schemas.evaluation import AIDetectionEvalAI

        detection_result = AIDetectionEvalAI(
            estimated_ai_percentage=72.0,
            confidence="HIGH",
            suspicious_phrases=["overly generic phrasing"],
            explanation="Classifier found a high writing-style similarity signal.",
            recommendation="HIGH_CONCERN",
        )

        with patch(
            "app.services.ai_provider_service.generate",
            new=AsyncMock(side_effect=_fake_response),
        ), patch(
            "app.services.cq_batch_evaluation_service.estimate_ai_likeness",
            new=AsyncMock(return_value=detection_result),
        ) as detector:
            evaluation = await cq_batch_evaluation_service.evaluate_exam_batched(exam_attempt.id, db_session)

        assert evaluation is not None
        assert detector.await_count == len(SECTION_ORDER)

        for section, ta in section_attempts.items():
            ev_result = await db_session.execute(
                Evaluation.__table__.select().where(Evaluation.attempt_id == ta.id)
            )
            ev_row = ev_result.first()
            assert ev_row is not None
            assert ev_row.overall_ai_likeness_percentage == 72.0
            assert ev_row.flagged_answer_count == 1

            qf_result = await db_session.execute(
                QuestionFeedback.__table__.select().where(
                    QuestionFeedback.evaluation_id == ev_row.id,
                    QuestionFeedback.question_type == "OPEN_ENDED",
                )
            )
            qf_row = qf_result.first()
            assert qf_row is not None
            assert qf_row.estimated_ai_percentage == 72.0
            assert getattr(qf_row.ai_detection_confidence, "value", qf_row.ai_detection_confidence) == "HIGH"
            assert getattr(qf_row.ai_detection_recommendation, "value", qf_row.ai_detection_recommendation) == "HIGH_CONCERN"

    async def test_failed_batch_marks_exam_failed_but_preserves_answers(self, db_session, monkeypatch):
        exam_attempt, section_attempts, question_ids = await self._seed_full_exam(db_session, monkeypatch)

        before_count = (await db_session.execute(
            CandidateAnswer.__table__.select()
        )).fetchall()
        assert len(before_count) > 0

        with patch(
            "app.services.ai_provider_service.generate",
            new=AsyncMock(return_value=AiGenerateResponse(
                success=False, model_used="local-test", provider="local", error="boom",
            )),
        ):
            evaluation = await cq_batch_evaluation_service.evaluate_exam_batched(exam_attempt.id, db_session)

        assert evaluation is None
        await db_session.refresh(exam_attempt)
        assert exam_attempt.status == ExamAttemptStatus.FAILED

        after_count = (await db_session.execute(
            CandidateAnswer.__table__.select()
        )).fetchall()
        assert len(after_count) == len(before_count)  # nothing lost


# ─── 10: Final scoring formula — explicit MCQ 40% / CQ 60% blend ──

class TestScoringFormula:

    async def test_mcq_cq_blend_is_explicit_not_implicit(self, db_session, monkeypatch):
        monkeypatch.setattr(get_settings(), "section_mcq_weight", 0.40)
        monkeypatch.setattr(get_settings(), "section_cq_weight", 0.60)
        monkeypatch.setattr(get_settings(), "section_weight_reasoning", 1.0)
        monkeypatch.setattr(get_settings(), "section_weight_practical", 0.0)
        monkeypatch.setattr(get_settings(), "section_weight_technical", 0.0)

        jd_id = await _seed_jd(db_session)
        from tests.test_question_bank import _seed_bank
        await _seed_bank(db_session, jd_id, mcq_per_section=12, cq_per_section=6)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)

        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
            status=ExamAttemptStatus.SUBMITTED,
        )
        db_session.add(exam_attempt)
        await db_session.flush()

        # MCQ 100%, CQ 0% for every section -> expected blended score = 100*0.4 + 0*0.6 = 40
        for section in SECTION_ORDER:
            test_result = await db_session.execute(
                Test.__table__.select().where(Test.jd_id == jd_id, Test.test_type == section)
            )
            test_row = test_result.first()
            ta = TestAttempt(
                invitation_id=invitation_id, candidate_id=invitation.candidate_id,
                test_id=test_row.id, exam_attempt_id=exam_attempt.id, status=AttemptStatus.EVALUATED,
            )
            db_session.add(ta)
            await db_session.flush()
            db_session.add(Evaluation(
                attempt_id=ta.id, total_score=40, max_score=100, percentage=40.0,
                mcq_score=100, mcq_max=100, open_ended_score=0, open_ended_max=100,
                ai_recommendation="MAYBE", ai_summary="",
            ))
        await db_session.commit()

        updated = await scoring_service.aggregate_exam_score(exam_attempt.id, db_session)
        assert updated.total_score == 40.0  # only reasoning weighted (1.0), blended 40/60


# ─── 11: AI-risk score calculation + bucketing ──────────────────

class TestAiRiskBucketing:

    def test_risk_level_buckets(self):
        assert ai_risk_service._risk_level(10.0) == "low"
        assert ai_risk_service._risk_level(50.0) == "medium"
        assert ai_risk_service._risk_level(80.0) == "high"

    async def test_get_risk_summary_shape_and_warning(self, db_session):
        jd_id = await _seed_jd(db_session)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)
        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
            ai_risk_score=72.0,
        )
        db_session.add(exam_attempt)
        await db_session.commit()

        summary = await ai_risk_service.get_risk_summary(exam_attempt.id, db_session)
        assert summary["ai_likeness_risk"] == "high"
        assert summary["risk_score"] == 72.0
        assert "warning" in summary
        assert "not proof" in summary["warning"].lower()


# ─── 13, 14: Retry + bank-not-ready guard ───────────────────────

class TestRetryAndGuards:

    async def test_retry_only_allowed_from_failed(self, db_session):
        jd_id = await _seed_jd(db_session)
        _, invitation_id = await _seed_invitation(db_session, jd_id)
        invitation = await db_session.get(Invitation, invitation_id)
        exam_attempt = ExamAttempt(
            candidate_id=invitation.candidate_id, invitation_id=invitation_id, jd_id=jd_id,
            status=ExamAttemptStatus.SUBMITTED,
        )
        db_session.add(exam_attempt)
        await db_session.commit()

        from app.api.v1.exam_reports import retry_evaluation
        with pytest.raises(ConflictError):
            await retry_evaluation(exam_attempt.id, None, db_session)

    async def test_bank_not_ready_blocks_exam_start(self, db_session, monkeypatch):
        from app.db.models.question_bank import QuestionBank
        from app.services import exam_attempt_service

        jd_id = await _seed_jd(db_session)
        bank = QuestionBank(jd_id=jd_id, status=QuestionBankStatus.GENERATING)
        db_session.add(bank)
        await db_session.commit()

        raw_token, _ = await _seed_invitation(db_session, jd_id)
        with pytest.raises(ConflictError):
            await exam_attempt_service.create_or_resume_exam_for_token(raw_token, db_session)
