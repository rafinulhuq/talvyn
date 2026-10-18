"""Regression tests for admin backup/restore."""

from sqlalchemy import func, select

from app.db.models.enums import (
    Difficulty,
    FileType,
    ParseStatus,
    QuestionBankStatus,
    QuestionType,
    Role,
    TestStatus,
    TestType,
)
from app.db.models.job_description import JdExtractedData, JobDescription
from app.db.models.question_bank import QuestionBank
from app.db.models.test import Question, Test
from app.db.models.user import User
from app.services import admin_service


async def test_backup_restore_preserves_question_bank_linked_tests(db_session):
    backup, actor_id, bank_id, test_id = await _seed_question_bank_backup(db_session)

    response = await admin_service.restore_application_data(db_session, backup, actor_id=actor_id)

    assert response.restored_counts["question_banks"] == 1
    assert response.restored_counts["tests"] == 1

    restored_test = (
        await db_session.execute(select(Test).where(Test.id == test_id))
    ).scalar_one()
    assert restored_test.question_bank_id == bank_id

    bank_count = (
        await db_session.execute(select(func.count()).select_from(QuestionBank))
    ).scalar_one()
    question_count = (
        await db_session.execute(select(func.count()).select_from(Question))
    ).scalar_one()
    assert bank_count == 1
    assert question_count == 1


async def test_restore_clears_question_bank_link_from_older_backup(db_session):
    backup, actor_id, _bank_id, test_id = await _seed_question_bank_backup(db_session)
    backup.tables.pop("question_banks")

    response = await admin_service.restore_application_data(db_session, backup, actor_id=actor_id)

    restored_test = (
        await db_session.execute(select(Test).where(Test.id == test_id))
    ).scalar_one()
    assert restored_test.question_bank_id is None
    assert response.restored_counts["question_banks"] == 0
    assert "optional reference" in response.message


async def _seed_question_bank_backup(db_session):
    actor_id = "00000000-0000-0000-0000-000000000001"
    db_session.add(
        User(
            id=actor_id,
            email="restore-admin@example.com",
            name="Restore Admin",
            password_hash="not-used",
            role=Role.SUPER_ADMIN,
        )
    )
    await db_session.flush()

    jd = JobDescription(
        uploaded_by=actor_id,
        original_filename="warehouse.pdf",
        file_path="jds/warehouse.pdf",
        file_type=FileType.PDF,
        raw_text="Warehouse supervisor role",
        parse_status=ParseStatus.DONE,
    )
    db_session.add(jd)
    await db_session.flush()

    db_session.add(
        JdExtractedData(
            jd_id=jd.id,
            job_title="Assistant Supervisor, Warehouse",
            seniority_level="mid",
            must_have_skills=["Inventory control"],
            nice_to_have_skills=[],
            tools_technologies=["ERP"],
            responsibilities=[],
            recommended_test_topics=["Warehouse operations"],
            difficulty_distribution={"easy_percent": 30, "medium_percent": 50, "hard_percent": 20},
        )
    )
    bank = QuestionBank(
        jd_id=jd.id,
        status=QuestionBankStatus.READY,
        generation_model="test-model",
        bank_config_json={"TECHNICAL": {"mcq": 1, "cq": 0}},
        generation_metadata_json={"source": "test"},
    )
    db_session.add(bank)
    await db_session.flush()

    test = Test(
        jd_id=jd.id,
        question_bank_id=bank.id,
        test_type=TestType.TECHNICAL,
        title="Technical Section",
        description="Question-bank backed section.",
        duration_minutes=45,
        total_marks=2,
        difficulty=Difficulty.MIXED,
        status=TestStatus.ARCHIVED,
    )
    db_session.add(test)
    await db_session.flush()

    db_session.add(
        Question(
            test_id=test.id,
            question_type=QuestionType.MCQ,
            question_text="Which inventory control step best prevents mismatched stock counts during handover?",
            skill_tested="Inventory control",
            difficulty=Difficulty.MEDIUM,
            marks=2,
            order_index=1,
            options=[
                {"label": "A", "text": "Skip the count", "is_correct": False},
                {"label": "B", "text": "Reconcile physical and system counts", "is_correct": True},
                {"label": "C", "text": "Delay reporting", "is_correct": False},
                {"label": "D", "text": "Ignore variance", "is_correct": False},
            ],
            correct_answer="B",
            explanation="Reconciliation catches mismatches before shift handover is completed.",
        )
    )
    await db_session.commit()

    backup = await admin_service.create_backup(db_session)
    assert backup.tables["question_banks"][0]["id"] == bank.id
    assert backup.tables["tests"][0]["question_bank_id"] == bank.id
    return backup, actor_id, bank.id, test.id
