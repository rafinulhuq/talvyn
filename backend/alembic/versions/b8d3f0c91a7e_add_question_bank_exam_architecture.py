"""add_question_bank_exam_architecture

Revision ID: b8d3f0c91a7e
Revises: 7f09e88b05e8
Create Date: 2026-06-23 00:00:00.000000

Master Prompt 2 — additive schema for the reusable question-bank / sectioned
exam redesign. Everything here is additive: new nullable columns, new tables,
one new enum value on the existing TestType. Nothing existing is dropped,
renamed, or altered in place, and the legacy single-test-per-candidate flow
(gated by QUESTION_BANK_MODE=false) keeps working unchanged against the
same `tests`/`questions`/`test_attempts` rows it always has.

New enum value:
  - TestType.PRACTICAL — added alongside the existing PROBLEM_SOLVING value
    (kept, never removed) so historical/in-flight Test rows referencing it
    stay valid. New section-based generation targets REASONING / PRACTICAL /
    TECHNICAL; PROBLEM_SOLVING is the legacy single-test label.

New tables:
  - question_banks         — one per JD; tracks generation lifecycle/config
  - exam_templates         — named, versioned exam configs (weights, counts)
                              referencing a question_bank
  - exam_attempts          — wraps the 3 per-section TestAttempt rows for one
                              candidate's whole sectioned exam
  - exam_attempt_questions — the exact question IDs locked to one candidate's
                              exam_attempt, drawn from the larger bank
  - ai_risk_signals        — individual scored signals (behavioral + textual)
                              feeding into exam_attempts.ai_risk_score
  - candidate_reports      — persisted generated report per exam_attempt

Additive columns:
  - tests.question_bank_id            (nullable FK -> question_banks)
  - questions.quality_score / estimated_time_seconds / topic_tags_json /
    is_active / usage_count
  - evaluations.section_scores_json / model_used / raw_model_output_json
  - test_attempts.exam_attempt_id     (nullable FK -> exam_attempts; the
                                        wrapper back-reference — existing
                                        per-section attempts are untouched
                                        and this stays NULL for all of them)
  - job_descriptions.exam_config_json (per-job weight/bank-size overrides)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8d3f0c91a7e'
down_revision: Union[str, None] = '7f09e88b05e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── New TestType value ─────────────────────────────────────
    op.execute(sa.text("""
        DO $$ BEGIN
            ALTER TYPE "TestType" ADD VALUE 'PRACTICAL';
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    # ── New enum types ──────────────────────────────────────────
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "QuestionBankStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'FAILED', 'ARCHIVED');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "ExamTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE "ExamAttemptStatus" AS ENUM (
                'ASSIGNED', 'STARTED', 'SECTION_SUBMITTED', 'SUBMITTED',
                'EVALUATING', 'EVALUATED', 'FAILED'
            );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """))

    # ── question_banks ──────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS question_banks (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            jd_id VARCHAR(36) NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
            status "QuestionBankStatus" NOT NULL DEFAULT 'DRAFT',
            generation_model VARCHAR(100),
            review_model VARCHAR(100),
            bank_config_json JSONB NOT NULL DEFAULT '{}',
            generation_metadata_json JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_question_banks_jd_id', 'question_banks', ['jd_id'],
        unique=False, if_not_exists=True,
    )

    # ── tests.question_bank_id ──────────────────────────────────
    op.execute(sa.text(
        "ALTER TABLE tests ADD COLUMN IF NOT EXISTS "
        "question_bank_id VARCHAR(36) REFERENCES question_banks(id) ON DELETE SET NULL"
    ))
    op.create_index(
        'ix_tests_question_bank_id', 'tests', ['question_bank_id'],
        unique=False, if_not_exists=True,
    )

    # ── questions: bank-quality + rotation columns ──────────────
    op.execute(sa.text(
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION"
    ))
    op.execute(sa.text(
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS estimated_time_seconds INTEGER"
    ))
    op.execute(sa.text(
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic_tags_json JSONB NOT NULL DEFAULT '[]'"
    ))
    op.execute(sa.text(
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"
    ))
    op.execute(sa.text(
        "ALTER TABLE questions ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0"
    ))
    op.create_index(
        'ix_questions_test_id_active', 'questions', ['test_id', 'is_active'],
        unique=False, if_not_exists=True,
    )

    # ── evaluations: section breakdown + model provenance ──────
    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS section_scores_json JSONB"
    ))
    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS model_used VARCHAR(100)"
    ))
    op.execute(sa.text(
        "ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS raw_model_output_json JSONB"
    ))

    # ── job_descriptions: per-job exam config overrides ─────────
    op.execute(sa.text(
        "ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS exam_config_json JSONB"
    ))

    # ── exam_templates ───────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS exam_templates (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            jd_id VARCHAR(36) NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
            question_bank_id VARCHAR(36) REFERENCES question_banks(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            config_json JSONB NOT NULL DEFAULT '{}',
            status "ExamTemplateStatus" NOT NULL DEFAULT 'DRAFT',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    # Guarded (not a plain op.create_index): on a fresh database, the
    # earlier `initial_schema` migration builds every table from the
    # *current* `Base.metadata` (live ORM model state, not a frozen
    # snapshot — see its own upgrade() for why). Since the ExamTemplate
    # model was later repurposed (n5p7r9t1v3x5) to drop jd_id entirely,
    # a fresh DB already has exam_templates without that column by the
    # time this migration runs, making the CREATE TABLE above a no-op
    # and an unconditional CREATE INDEX ... (jd_id) fail outright.
    # Production already has this index from when it originally ran
    # against the pre-repurpose schema, so this is fresh-DB/CI-only.
    op.execute(sa.text("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'exam_templates' AND column_name = 'jd_id'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_exam_templates_jd_id ON exam_templates (jd_id);
            END IF;
        END $$
    """))

    # ── exam_attempts ────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS exam_attempts (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            candidate_id VARCHAR(36) NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
            invitation_id VARCHAR(36) NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
            jd_id VARCHAR(36) NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
            exam_template_id VARCHAR(36) REFERENCES exam_templates(id) ON DELETE SET NULL,
            status "ExamAttemptStatus" NOT NULL DEFAULT 'ASSIGNED',
            assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            started_at TIMESTAMP WITH TIME ZONE,
            submitted_at TIMESTAMP WITH TIME ZONE,
            total_score DOUBLE PRECISION,
            mcq_score DOUBLE PRECISION,
            cq_score DOUBLE PRECISION,
            ai_risk_score DOUBLE PRECISION,
            metadata_json JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_exam_attempts_invitation_id', 'exam_attempts', ['invitation_id'],
        unique=False, if_not_exists=True,
    )
    op.create_index(
        'ix_exam_attempts_candidate_id', 'exam_attempts', ['candidate_id'],
        unique=False, if_not_exists=True,
    )
    op.create_index(
        'ix_exam_attempts_jd_id', 'exam_attempts', ['jd_id'],
        unique=False, if_not_exists=True,
    )
    # One exam_attempt per invitation — matches the existing one-active-attempt
    # convention on test_attempts (ix_attempts_inv_test) at the wrapper level.
    op.create_index(
        'ux_exam_attempts_invitation', 'exam_attempts', ['invitation_id'],
        unique=True, if_not_exists=True,
    )

    # ── test_attempts.exam_attempt_id (wrapper back-reference) ──
    op.execute(sa.text(
        "ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS "
        "exam_attempt_id VARCHAR(36) REFERENCES exam_attempts(id) ON DELETE SET NULL"
    ))
    op.create_index(
        'ix_test_attempts_exam_attempt_id', 'test_attempts', ['exam_attempt_id'],
        unique=False, if_not_exists=True,
    )

    # ── exam_attempt_questions ───────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS exam_attempt_questions (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            exam_attempt_id VARCHAR(36) NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
            question_id VARCHAR(36) NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            section_type VARCHAR(30) NOT NULL,
            question_type VARCHAR(20) NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0,
            assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_eaq_exam_attempt_id', 'exam_attempt_questions', ['exam_attempt_id'],
        unique=False, if_not_exists=True,
    )
    # Locks the assignment: the same question can never be assigned twice
    # within one candidate's exam attempt.
    op.create_index(
        'ux_eaq_attempt_question', 'exam_attempt_questions',
        ['exam_attempt_id', 'question_id'], unique=True, if_not_exists=True,
    )

    # ── ai_risk_signals ───────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_risk_signals (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            exam_attempt_id VARCHAR(36) NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
            signal_type VARCHAR(50) NOT NULL,
            signal_value_json JSONB NOT NULL DEFAULT '{}',
            risk_points DOUBLE PRECISION NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))
    op.create_index(
        'ix_ai_risk_signals_exam_attempt_id', 'ai_risk_signals', ['exam_attempt_id'],
        unique=False, if_not_exists=True,
    )

    # ── candidate_reports ─────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS candidate_reports (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            exam_attempt_id VARCHAR(36) NOT NULL UNIQUE REFERENCES exam_attempts(id) ON DELETE CASCADE,
            report_json JSONB NOT NULL DEFAULT '{}',
            report_markdown TEXT,
            generated_by_model VARCHAR(100),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
    """))


def downgrade() -> None:
    op.drop_table('candidate_reports')

    op.drop_index('ix_ai_risk_signals_exam_attempt_id', table_name='ai_risk_signals')
    op.drop_table('ai_risk_signals')

    op.drop_index('ux_eaq_attempt_question', table_name='exam_attempt_questions')
    op.drop_index('ix_eaq_exam_attempt_id', table_name='exam_attempt_questions')
    op.drop_table('exam_attempt_questions')

    op.drop_index('ix_test_attempts_exam_attempt_id', table_name='test_attempts')
    op.drop_column('test_attempts', 'exam_attempt_id')

    op.drop_index('ux_exam_attempts_invitation', table_name='exam_attempts')
    op.drop_index('ix_exam_attempts_jd_id', table_name='exam_attempts')
    op.drop_index('ix_exam_attempts_candidate_id', table_name='exam_attempts')
    op.drop_index('ix_exam_attempts_invitation_id', table_name='exam_attempts')
    op.drop_table('exam_attempts')

    # Plain execute, not op.drop_index: on a fresh DB this index may never
    # have been created (see the guarded CREATE INDEX in upgrade() above).
    op.execute(sa.text("DROP INDEX IF EXISTS ix_exam_templates_jd_id"))
    op.drop_table('exam_templates')

    op.drop_column('job_descriptions', 'exam_config_json')

    op.drop_column('evaluations', 'raw_model_output_json')
    op.drop_column('evaluations', 'model_used')
    op.drop_column('evaluations', 'section_scores_json')

    op.drop_index('ix_questions_test_id_active', table_name='questions')
    op.drop_column('questions', 'usage_count')
    op.drop_column('questions', 'is_active')
    op.drop_column('questions', 'topic_tags_json')
    op.drop_column('questions', 'estimated_time_seconds')
    op.drop_column('questions', 'quality_score')

    op.drop_index('ix_tests_question_bank_id', table_name='tests')
    op.drop_column('tests', 'question_bank_id')

    op.drop_index('ix_question_banks_jd_id', table_name='question_banks')
    op.drop_table('question_banks')

    op.execute(sa.text('DROP TYPE IF EXISTS "ExamAttemptStatus"'))
    op.execute(sa.text('DROP TYPE IF EXISTS "ExamTemplateStatus"'))
    op.execute(sa.text('DROP TYPE IF EXISTS "QuestionBankStatus"'))
    # Postgres has no ALTER TYPE ... DROP VALUE — leaving 'PRACTICAL' on
    # TestType on downgrade is the standard, accepted tradeoff already used
    # elsewhere in this migration history (see 39c7dbf5068d).
