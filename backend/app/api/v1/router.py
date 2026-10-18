"""API v1 router — all sub-routers mounted here."""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    ai_checker,
    ats,
    attempts,
    candidates,
    cms,
    evaluation,
    exam_reports,
    exam_templates,
    exams,
    health,
    internal_emails,
    invitations,
    jd,
    public_links,
    question_banks,
    search,
    stats,
    tests,
    trash,
    users,
    webhooks,
)

router = APIRouter(prefix="/api/v1")

router.include_router(health.router)
router.include_router(jd.router, prefix="/jd", tags=["Job Descriptions"])
router.include_router(tests.router, prefix="/tests", tags=["Tests"])
router.include_router(invitations.router, prefix="/invitations", tags=["Invitations"])
router.include_router(attempts.router, prefix="/attempts", tags=["Attempts"])
router.include_router(public_links.router, prefix="/public-links", tags=["Public Links"])
router.include_router(candidates.router, prefix="/candidates", tags=["Candidates"])
router.include_router(evaluation.router, prefix="/evaluation", tags=["Evaluation"])
router.include_router(search.router, prefix="/search", tags=["Search"])
router.include_router(admin.router, prefix="/admin", tags=["Admin"])
router.include_router(ai_checker.router, prefix="/ai-checker", tags=["AI Checker"])
router.include_router(ats.router, prefix="/ats", tags=["ATS Checker"])
router.include_router(webhooks.router, prefix="/admin/webhooks", tags=["Webhooks"])
router.include_router(stats.router, prefix="/stats", tags=["Stats"])
router.include_router(trash.router, prefix="/trash", tags=["Trash"])
router.include_router(users.router, prefix="/users", tags=["Users"])
router.include_router(exam_templates.router, prefix="/templates", tags=["Templates"])
router.include_router(cms.router, prefix="/cmp", tags=["CMP"])
router.include_router(cms.router, prefix="/cms", tags=["CMP"], include_in_schema=False)
# Master Prompt 2 — question bank / sectioned exam redesign. All additive;
# none of the routers above are modified.
router.include_router(
    question_banks.router, prefix="/jd/{jd_id}/question-bank", tags=["Question Bank"]
)
router.include_router(exams.router, prefix="/candidate-exams", tags=["Sectioned Exams"])
router.include_router(exam_reports.router, prefix="/exam-admin", tags=["Exam Admin Reports"])
router.include_router(internal_emails.router, prefix="/internal/emails", tags=["Internal Emails"])
