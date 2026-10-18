"""
Unit tests for test_generation_service.
All Ollama calls are mocked — no real AI needed.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from app.core.exceptions import AIResponseParseError
from app.schemas.test import GeneratedTestAI, MCQQuestionAI, OpenEndedQuestionAI
from app.services.test_generation_service import _try_validate

# ─── Fixtures ─────────────────────────────────────────────────

def _make_mcq(
    n: int = 1,
    difficulty: str = "MEDIUM",
    correct: str = "B",
) -> dict:
    return {
        "question_type": "MCQ",
        "question_text": f"What is the best approach to handle question number {n} in a real-world Python application?",
        "skill_tested": "Python",
        "difficulty": difficulty,
        "marks": 2,
        "options": [
            {"label": "A", "text": "Use a global variable", "is_correct": False},
            {"label": "B", "text": "Use dependency injection correctly", "is_correct": True},
            {"label": "C", "text": "Ignore the problem entirely", "is_correct": False},
            {"label": "D", "text": "Hardcode the solution always", "is_correct": False},
        ],
        "correct_answer": correct,
        "explanation": "Dependency injection is the preferred pattern because it enables testability and decoupling of concerns.",
    }


def _make_open_ended(n: int = 1, difficulty: str = "HARD") -> dict:
    return {
        "question_type": "OPEN_ENDED",
        "question_text": f"Describe your approach to designing a scalable microservice architecture for a high-traffic system question {n}.",
        "skill_tested": "System Design",
        "difficulty": difficulty,
        "marks": 10,
        "expected_answer": (
            "A comprehensive answer should cover service decomposition, "
            "inter-service communication patterns such as REST or gRPC, "
            "data consistency strategies including eventual consistency, "
            "horizontal scaling approaches, and observability tooling."
        ),
        "scoring_rubric": (
            "Full marks: covers decomposition, communication, scaling, and observability. "
            "Half marks: covers at least 2 of the 4 dimensions. "
            "No marks: describes a monolithic approach or misses all key concerns."
        ),
    }


def _valid_test_dict(mcq_count: int = 5, oe_count: int = 2) -> dict:
    return {
        "title": "Senior Python Engineer Technical Screening",
        "description": "This test assesses core Python and backend engineering skills relevant to the role.",
        "duration_minutes": 60,
        "total_marks": mcq_count * 2 + oe_count * 10,
        "difficulty": "MIXED",
        "mcq_questions": [_make_mcq(i + 1) for i in range(mcq_count)],
        "open_ended_questions": [_make_open_ended(i + 1) for i in range(oe_count)],
    }


# ─── MCQQuestionAI validation ─────────────────────────────────

class TestMCQQuestionAI:

    def test_valid_mcq(self):
        mcq = MCQQuestionAI.model_validate(_make_mcq())
        correct = next(opt for opt in mcq.options if opt.is_correct)
        assert mcq.correct_answer == correct.label
        assert correct.text == "Use dependency injection correctly"
        assert len(mcq.options) == 4

    def test_repairs_when_no_correct_option(self):
        data = _make_mcq()
        for opt in data["options"]:
            opt["is_correct"] = False
        mcq = MCQQuestionAI.model_validate(data)
        assert sum(1 for opt in mcq.options if opt.is_correct) == 1
        correct = next(opt for opt in mcq.options if opt.is_correct)
        assert mcq.correct_answer == correct.label
        assert correct.text == "Use dependency injection correctly"

    def test_repairs_when_multiple_correct_options(self):
        data = _make_mcq()
        data["options"][0]["is_correct"] = True
        data["options"][1]["is_correct"] = True
        mcq = MCQQuestionAI.model_validate(data)
        assert sum(1 for opt in mcq.options if opt.is_correct) == 1
        correct = next(opt for opt in mcq.options if opt.is_correct)
        assert mcq.correct_answer == correct.label
        # First marked-correct option (original A, "Use a global variable") wins
        assert correct.text == "Use a global variable"

    def test_repairs_when_correct_answer_mismatch(self):
        data = _make_mcq()
        data["correct_answer"] = "C"   # But is_correct is on B
        mcq = MCQQuestionAI.model_validate(data)
        correct = next(opt for opt in mcq.options if opt.is_correct)
        assert mcq.correct_answer == correct.label
        assert correct.text == "Use dependency injection correctly"

    def test_correct_answer_position_is_randomized(self):
        labels_seen = {
            MCQQuestionAI.model_validate(_make_mcq()).correct_answer
            for _ in range(200)
        }
        # Negligible flake probability: landing on the same label 200/200 times is ~(1/4)^199
        assert len(labels_seen) > 1

    def test_repairs_when_fewer_than_4_options(self):
        data = _make_mcq()
        data["options"] = data["options"][:3]
        mcq = MCQQuestionAI.model_validate(data)
        assert len(mcq.options) == 4
        assert {opt.label for opt in mcq.options} == {"A", "B", "C", "D"}
        assert any(opt.text == "Option D" for opt in mcq.options)

    def test_repairs_when_distractor_is_missing_is_correct(self):
        data = _make_mcq()
        del data["options"][3]["is_correct"]
        mcq = MCQQuestionAI.model_validate(data)
        assert len(mcq.options) == 4
        assert sum(1 for opt in mcq.options if opt.is_correct) == 1
        assert next(opt for opt in mcq.options if opt.is_correct).text == "Use dependency injection correctly"

    def test_normalizes_mcq_question_type_variants(self):
        data = _make_mcq()
        data["question_type"] = "multiple-choice"
        mcq = MCQQuestionAI.model_validate(data)
        assert mcq.question_type == "MCQ"

    def test_raises_on_short_question_text(self):
        data = _make_mcq()
        data["question_text"] = "Bad?"
        with pytest.raises(ValidationError):
            MCQQuestionAI.model_validate(data)

    def test_raises_on_empty_explanation(self):
        data = _make_mcq()
        data["explanation"] = ""
        with pytest.raises(ValidationError):
            MCQQuestionAI.model_validate(data)


# ─── OpenEndedQuestionAI validation ──────────────────────────

class TestOpenEndedQuestionAI:

    def test_valid_open_ended(self):
        oe = OpenEndedQuestionAI.model_validate(_make_open_ended())
        assert oe.marks == 10
        assert oe.difficulty == "HARD"

    def test_accepts_short_expected_answer(self):
        data = _make_open_ended()
        data["expected_answer"] = "Short answer."
        oe = OpenEndedQuestionAI.model_validate(data)
        assert oe.expected_answer == "Short answer."

    def test_accepts_short_rubric(self):
        data = _make_open_ended()
        data["scoring_rubric"] = "Give points."
        oe = OpenEndedQuestionAI.model_validate(data)
        assert oe.scoring_rubric == "Give points."

    def test_marks_capped_at_20(self):
        data = _make_open_ended()
        data["marks"] = 25
        oe = OpenEndedQuestionAI.model_validate(data)
        assert oe.marks == 20

    def test_normalizes_open_ended_question_type_variants(self):
        data = _make_open_ended()
        data["question_type"] = "long-answer"
        oe = OpenEndedQuestionAI.model_validate(data)
        assert oe.question_type == "OPEN_ENDED"

    def test_repairs_blank_expected_answer_and_rubric(self):
        data = _make_open_ended()
        data["expected_answer"] = ""
        data["scoring_rubric"] = "   "
        oe = OpenEndedQuestionAI.model_validate(data)
        assert oe.expected_answer
        assert oe.scoring_rubric


# ─── GeneratedTestAI validation ───────────────────────────────

class TestGeneratedTestAI:

    def test_valid_full_test(self):
        result = GeneratedTestAI.model_validate(_valid_test_dict())
        assert result.title.startswith("Senior")
        assert len(result.mcq_questions) == 5
        assert len(result.open_ended_questions) == 2

    def test_auto_corrects_total_marks(self):
        data = _valid_test_dict()
        data["total_marks"] = 9999   # Way off
        result = GeneratedTestAI.model_validate(data)
        expected = sum(q["marks"] for q in data["mcq_questions"]) + sum(
            q["marks"] for q in data["open_ended_questions"]
        )
        assert result.total_marks == expected

    def test_raises_on_too_few_mcqs(self):
        data = _valid_test_dict(mcq_count=0)
        with pytest.raises(ValidationError):
            GeneratedTestAI.model_validate(data)

    def test_raises_on_too_few_open_ended(self):
        data = _valid_test_dict(oe_count=0)
        with pytest.raises(ValidationError):
            GeneratedTestAI.model_validate(data)

    def test_raises_on_invalid_difficulty(self):
        data = _valid_test_dict()
        data["difficulty"] = "SUPER_HARD"
        with pytest.raises(ValidationError):
            GeneratedTestAI.model_validate(data)

    def test_raises_on_short_title(self):
        data = _valid_test_dict()
        data["title"] = "Hi"
        with pytest.raises(ValidationError):
            GeneratedTestAI.model_validate(data)

    def test_raises_on_duration_too_short(self):
        data = _valid_test_dict()
        data["duration_minutes"] = 5
        with pytest.raises(ValidationError):
            GeneratedTestAI.model_validate(data)


# ─── _try_validate ────────────────────────────────────────────

class TestTryValidate:

    def test_valid_json_returns_result(self):
        raw = json.dumps(_valid_test_dict())
        result, error = _try_validate(raw)
        assert result is not None
        assert error == ""

    def test_invalid_json_returns_error(self):
        result, error = _try_validate("not json")
        assert result is None
        assert error != ""

    def test_valid_json_wrong_schema_returns_error(self):
        raw = json.dumps({"title": "Test", "invalid": True})
        result, error = _try_validate(raw)
        assert result is None
        assert error != ""

    def test_json_in_fence_is_parsed(self):
        raw = f"```json\n{json.dumps(_valid_test_dict())}\n```"
        result, error = _try_validate(raw)
        assert result is not None


# ─── generate_tests_for_jd (integration with mock) ────────────

class TestGenerateTestsIntegration:

    async def test_generates_3_tests_and_saves(self, db_session):
        """Mock Ollama returning valid test JSON, verify 3 DB records created."""
        from app.services.test_generation_service import generate_tests_for_jd

        valid_json = json.dumps(_valid_test_dict())

        with patch(
            "app.services.test_generation_service.ollama_client.generate",
            new=AsyncMock(return_value=valid_json),
        ):
            tests = await generate_tests_for_jd(
                jd_id="00000000-0000-0000-0000-000000000001",
                job_title="Senior Python Engineer",
                seniority_level="senior",
                must_have_skills=["Python", "FastAPI"],
                tools_technologies=["Docker"],
                recommended_test_topics=["async Python", "REST APIs"],
                difficulty_distribution={"easy_percent": 20, "medium_percent": 50, "hard_percent": 30},
                db=db_session,
            )

        assert len(tests) == 3
        types = {t.test_type.value for t in tests}
        assert types == {"TECHNICAL", "REASONING", "PROBLEM_SOLVING"}

    async def test_questions_saved_per_test(self, db_session):
        """Verify MCQ + open-ended questions are all persisted."""

        from app.services.test_generation_service import generate_tests_for_jd

        valid_json = json.dumps(_valid_test_dict())

        with patch(
            "app.services.test_generation_service.ollama_client.generate",
            new=AsyncMock(return_value=valid_json),
        ):
            tests = await generate_tests_for_jd(
                jd_id="00000000-0000-0000-0000-000000000002",
                job_title="Backend Engineer",
                seniority_level="mid",
                must_have_skills=["Python"],
                tools_technologies=[],
                recommended_test_topics=["Python basics"],
                difficulty_distribution={},
                db=db_session,
            )

        for test in tests:
            assert len(test.questions) == 7   # 5 MCQ + 2 open-ended
            mcq_q = [q for q in test.questions if q.question_type.value == "MCQ"]
            oe_q = [q for q in test.questions if q.question_type.value == "OPEN_ENDED"]
            assert len(mcq_q) == 5
            assert len(oe_q) == 2

    async def test_regeneration_deletes_old_tests(self, db_session):
        """Running generate twice should replace, not append."""
        from sqlalchemy import select

        from app.db.models.test import Test
        from app.services.test_generation_service import generate_tests_for_jd

        valid_json = json.dumps(_valid_test_dict())
        jd_id = "00000000-0000-0000-0000-000000000003"

        kwargs = dict(
            jd_id=jd_id,
            job_title="Engineer",
            seniority_level="senior",
            must_have_skills=["Python"],
            tools_technologies=[],
            recommended_test_topics=["Python"],
            difficulty_distribution={},
        )

        with patch(
            "app.services.test_generation_service.ollama_client.generate",
            new=AsyncMock(return_value=valid_json),
        ):
            await generate_tests_for_jd(**kwargs, db=db_session)
            await generate_tests_for_jd(**kwargs, db=db_session)

        result = await db_session.execute(select(Test).where(Test.jd_id == jd_id))
        all_tests = result.scalars().all()
        assert len(all_tests) == 3   # Still only 3, not 6

    async def test_partial_failure_raises_and_persists_nothing(self, db_session):
        """If any of the 3 test types fails validation after all retries, the
        whole call raises AIResponseParseError and no Test rows are persisted —
        avoiding a JD ending up with an incomplete (e.g. 2 of 3) draft test set."""
        from sqlalchemy import select

        from app.db.models.test import Test
        from app.services.test_generation_service import generate_tests_for_jd

        valid_json = json.dumps(_valid_test_dict())
        jd_id = "00000000-0000-0000-0000-000000000004"

        # 1st test type (TECHNICAL): every attempt returns unparsable JSON,
        # exhausting all retries. 2nd/3rd test types succeed on the first try.
        responses = ["not valid json"] * 4 + [valid_json, valid_json]

        with patch(
            "app.services.test_generation_service.ollama_client.generate",
            new=AsyncMock(side_effect=responses),
        ):
            with pytest.raises(AIResponseParseError):
                await generate_tests_for_jd(
                    jd_id=jd_id,
                    job_title="Engineer",
                    seniority_level="senior",
                    must_have_skills=["Python"],
                    tools_technologies=[],
                    recommended_test_topics=["Python"],
                    difficulty_distribution={},
                    db=db_session,
                )

        result = await db_session.execute(select(Test).where(Test.jd_id == jd_id))
        assert result.scalars().all() == []

    async def test_rag_context_is_injected_when_enabled(self, db_session):
        """Similar JD chunks are attached to every generation prompt when enabled."""
        from app.services import test_generation_service as svc
        from app.services.rag.retrieval_service import SearchHit

        valid_json = json.dumps(_valid_test_dict())
        settings = SimpleNamespace(
            test_mcq_count=5,
            test_oe_count=2,
            test_sequential_generation=True,
            rag_jd_context_enabled=True,
            rag_jd_context_top_k=2,
            rag_jd_context_max_chars=1200,
            rag_jd_context_source_type="jd_corpus",
        )
        hits = [
            SearchHit(
                document_id="doc-1",
                document_title="Senior Backend Engineer",
                filename="backend.pdf",
                chunk_index=0,
                content="Own Kafka pipelines, Postgres services, and production incident response.",
                score=0.91,
            )
        ]

        with (
            patch("app.services.test_generation_service.get_settings", return_value=settings),
            patch("app.services.test_generation_service.retrieval_service.search", new=AsyncMock(return_value=hits)),
            patch(
                "app.services.test_generation_service.ollama_client.generate",
                new=AsyncMock(return_value=valid_json),
            ) as mock_generate,
        ):
            await svc.generate_tests_for_jd(
                jd_id="00000000-0000-0000-0000-000000000005",
                job_title="Senior Backend Engineer",
                seniority_level="senior",
                must_have_skills=["Kafka", "Postgres"],
                tools_technologies=["Docker"],
                recommended_test_topics=["incident response"],
                difficulty_distribution={},
                db=db_session,
            )

        prompts = [call.kwargs["prompt"] for call in mock_generate.await_args_list]
        assert len(prompts) == 3
        assert all("REFERENCE JD CONTEXT FROM SIMILAR ROLES" in prompt for prompt in prompts)
        assert all("Own Kafka pipelines" in prompt for prompt in prompts)

    async def test_rag_context_disabled_does_not_search(self, db_session):
        """The default/off state keeps the legacy prompt path untouched."""
        from app.services import test_generation_service as svc

        valid_json = json.dumps(_valid_test_dict())
        settings = SimpleNamespace(
            test_mcq_count=5,
            test_oe_count=2,
            test_sequential_generation=True,
            rag_jd_context_enabled=False,
            rag_jd_context_top_k=2,
            rag_jd_context_max_chars=1200,
            rag_jd_context_source_type="jd_corpus",
        )

        with (
            patch("app.services.test_generation_service.get_settings", return_value=settings),
            patch("app.services.test_generation_service.retrieval_service.search", new=AsyncMock()) as mock_search,
            patch(
                "app.services.test_generation_service.ollama_client.generate",
                new=AsyncMock(return_value=valid_json),
            ) as mock_generate,
        ):
            await svc.generate_tests_for_jd(
                jd_id="00000000-0000-0000-0000-000000000006",
                job_title="Backend Engineer",
                seniority_level="mid",
                must_have_skills=["Python"],
                tools_technologies=[],
                recommended_test_topics=["APIs"],
                difficulty_distribution={},
                db=db_session,
            )

        mock_search.assert_not_awaited()
        prompts = [call.kwargs["prompt"] for call in mock_generate.await_args_list]
        assert all("REFERENCE JD CONTEXT FROM SIMILAR ROLES" not in prompt for prompt in prompts)

    async def test_rag_embedding_failure_falls_back_to_plain_prompt(self, db_session):
        """RAG retrieval errors should not block assessment generation."""
        from app.services import test_generation_service as svc
        from app.services.rag.embedding_provider import EmbeddingError

        valid_json = json.dumps(_valid_test_dict())
        settings = SimpleNamespace(
            test_mcq_count=5,
            test_oe_count=2,
            test_sequential_generation=True,
            rag_jd_context_enabled=True,
            rag_jd_context_top_k=2,
            rag_jd_context_max_chars=1200,
            rag_jd_context_source_type="jd_corpus",
        )

        with (
            patch("app.services.test_generation_service.get_settings", return_value=settings),
            patch(
                "app.services.test_generation_service.retrieval_service.search",
                new=AsyncMock(side_effect=EmbeddingError("embeddings disabled")),
            ),
            patch(
                "app.services.test_generation_service.ollama_client.generate",
                new=AsyncMock(return_value=valid_json),
            ) as mock_generate,
        ):
            tests = await svc.generate_tests_for_jd(
                jd_id="00000000-0000-0000-0000-000000000007",
                job_title="Backend Engineer",
                seniority_level="mid",
                must_have_skills=["Python"],
                tools_technologies=[],
                recommended_test_topics=["APIs"],
                difficulty_distribution={},
                db=db_session,
            )

        assert len(tests) == 3
        prompts = [call.kwargs["prompt"] for call in mock_generate.await_args_list]
        assert all("REFERENCE JD CONTEXT FROM SIMILAR ROLES" not in prompt for prompt in prompts)


# ─── generate_tests_background cancellation ───────────────────

class TestGenerateTestsBackgroundCancellation:

    async def test_discards_results_if_cancelled_mid_flight(self, db_session):
        """If POST /tests/cancel/{jd_id} resets generation_status to IDLE
        while generate_tests_for_jd() is still running, the background task
        must discard the tests it just saved and must NOT overwrite the
        cancellation by flipping the status back to READY."""
        import uuid
        from contextlib import asynccontextmanager

        from sqlalchemy import select

        from app.db.models.enums import (
            Difficulty,
            FileType,
            GenerationStatus,
            ParseStatus,
            TestStatus,
            TestType,
        )
        from app.db.models.job_description import JdExtractedData, JobDescription
        from app.db.models.test import Test
        from app.services import jd_service

        jd_id = str(uuid.uuid4())
        jd = JobDescription(
            id=jd_id,
            uploaded_by="00000000-0000-0000-0000-000000000000",
            original_filename="role.pdf",
            file_path="jds/role.pdf",
            file_type=FileType.PDF,
            raw_text="Senior Engineer",
            parse_status=ParseStatus.DONE,
            generation_status=GenerationStatus.GENERATING,
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
        await db_session.commit()

        # Stand in for a test that generate_tests_for_jd() just saved.
        fake_test = Test(
            id=str(uuid.uuid4()),
            jd_id=jd_id,
            test_type=TestType.TECHNICAL,
            title="Technical Screening Test",
            duration_minutes=60,
            total_marks=20,
            difficulty=Difficulty.MEDIUM,
            status=TestStatus.DRAFT,
        )
        db_session.add(fake_test)
        await db_session.commit()

        async def fake_generate_tests_for_jd(*args, db, **kwargs):
            # Simulate an admin calling /cancel/{jd_id} while this is running.
            jd_row = await db.get(JobDescription, jd_id)
            jd_row.generation_status = GenerationStatus.IDLE
            await db.commit()
            return [fake_test]

        @asynccontextmanager
        async def fake_session_factory():
            yield db_session

        with patch(
            "app.services.test_generation_service.generate_tests_for_jd",
            new=AsyncMock(side_effect=fake_generate_tests_for_jd),
        ), patch(
            "app.services.test_generation_service.clear_progress",
        ), patch(
            "app.db.session.AsyncSessionFactory",
            side_effect=fake_session_factory,
        ):
            await jd_service.generate_tests_background(jd_id)

        result = await db_session.execute(
            select(JobDescription).where(JobDescription.id == jd_id)
        )
        jd_after = result.scalar_one()
        assert jd_after.generation_status == GenerationStatus.IDLE  # not overwritten to READY

        result = await db_session.execute(select(Test).where(Test.id == fake_test.id))
        assert result.scalar_one_or_none() is None  # discarded, not persisted
