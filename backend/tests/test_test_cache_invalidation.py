"""Regression tests for candidate-facing test cache invalidation."""

import uuid

from app.db.models.enums import (
    Difficulty,
    FileType,
    ParseStatus,
    QuestionType,
)
from app.db.models.enums import (
    TestStatus as DbTestStatus,
)
from app.db.models.enums import (
    TestType as DbTestType,
)
from app.db.models.job_description import JobDescription
from app.db.models.test import Question
from app.db.models.test import Test as TestModel
from app.schemas.test import (
    ApproveTestRequest,
    UpdateQuestionRequest,
    UpdateTestRequest,
)
from app.services import attempt_service, test_service


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.deleted: list[str] = []

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def setex(self, key: str, _ttl: int, value: str) -> None:
        self.store[key] = value

    async def delete(self, *keys: str) -> None:
        self.deleted.extend(keys)
        for key in keys:
            self.store.pop(key, None)


async def _seed_approved_test(db_session) -> tuple[str, str, str]:
    jd_id = str(uuid.uuid4())
    test_id = str(uuid.uuid4())
    question_id = str(uuid.uuid4())

    jd = JobDescription(
        id=jd_id,
        uploaded_by="00000000-0000-0000-0000-000000000000",
        original_filename="role.pdf",
        file_path="jds/role.pdf",
        file_type=FileType.PDF,
        raw_text="Role",
        parse_status=ParseStatus.DONE,
    )
    test = TestModel(
        id=test_id,
        jd_id=jd_id,
        test_type=DbTestType.TECHNICAL,
        title="Screening",
        duration_minutes=30,
        total_marks=2,
        difficulty=Difficulty.MIXED,
        status=DbTestStatus.APPROVED,
    )
    question = Question(
        id=question_id,
        test_id=test_id,
        question_type=QuestionType.MCQ,
        question_text="Which option best describes async I/O in Python applications?",
        skill_tested="Python async",
        difficulty=Difficulty.MEDIUM,
        marks=2,
        order_index=0,
        options=[
            {"label": "A", "text": "Use blocking sleeps", "is_correct": False},
            {"label": "B", "text": "Use async/await", "is_correct": True},
            {"label": "C", "text": "Use globals", "is_correct": False},
            {"label": "D", "text": "Use busy loops", "is_correct": False},
        ],
        correct_answer="B",
    )
    db_session.add_all([jd, test, question])
    await db_session.commit()
    return jd_id, test_id, question_id


async def _prime_cache(fake_redis: FakeRedis, jd_id: str, test_id: str, db_session) -> None:
    attempt_service.set_redis_client(fake_redis)
    await attempt_service._load_test_with_questions_cached(test_id, db_session)
    await attempt_service._load_approved_tests_for_jd_cached(jd_id, db_session)

    assert f"test:{test_id}" in fake_redis.store
    assert f"approved_tests:{jd_id}" in fake_redis.store


class TestCandidateFacingTestCacheInvalidation:
    async def test_status_change_invalidates_test_and_jd_cache(self, db_session):
        fake_redis = FakeRedis()
        jd_id, test_id, _ = await _seed_approved_test(db_session)

        try:
            await _prime_cache(fake_redis, jd_id, test_id, db_session)
            await test_service.set_test_status(
                test_id,
                ApproveTestRequest(status=DbTestStatus.DRAFT),
                db_session,
            )
        finally:
            attempt_service.set_redis_client(None)

        assert f"test:{test_id}" in fake_redis.deleted
        assert f"approved_tests:{jd_id}" in fake_redis.deleted
        assert fake_redis.store == {}

    async def test_metadata_change_invalidates_test_and_jd_cache(self, db_session):
        fake_redis = FakeRedis()
        jd_id, test_id, _ = await _seed_approved_test(db_session)

        try:
            await _prime_cache(fake_redis, jd_id, test_id, db_session)
            await test_service.update_test_metadata(
                test_id,
                UpdateTestRequest(title="Updated Screening Test"),
                db_session,
            )
        finally:
            attempt_service.set_redis_client(None)

        assert f"test:{test_id}" in fake_redis.deleted
        assert f"approved_tests:{jd_id}" in fake_redis.deleted

    async def test_question_change_invalidates_parent_test_and_jd_cache(self, db_session):
        fake_redis = FakeRedis()
        jd_id, test_id, question_id = await _seed_approved_test(db_session)

        try:
            await _prime_cache(fake_redis, jd_id, test_id, db_session)
            await test_service.update_question(
                question_id,
                UpdateQuestionRequest(marks=3),
                db_session,
            )
        finally:
            attempt_service.set_redis_client(None)

        assert f"test:{test_id}" in fake_redis.deleted
        assert f"approved_tests:{jd_id}" in fake_redis.deleted
