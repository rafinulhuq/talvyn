"""
SQLAlchemy ORM models.
Import ALL models here so Alembic and create_all() can discover them.
Import order matters: parent tables before child tables.
"""

from app.db.models.ai_usage import AiUsageLog  # noqa: F401
from app.db.models.attempt import (  # noqa: F401
    CandidateAnswer,
    SuspiciousEvent,
    TestAttempt,
)
from app.db.models.audit_log import AdminAuditLog  # noqa: F401
from app.db.models.candidate import (  # noqa: F401
    Candidate,
    CandidateNumberCounter,
    Invitation,
)
from app.db.models.cms import (  # noqa: F401
    CmsBlogPost,
    CmsContentDocument,
    CmsContentVersion,
    CmsMediaAsset,
)
from app.db.models.enums import (  # noqa: F401
    AIDetectionConfidence,
    AIDetectionRecommendation,
    AIRecommendation,
    AttemptStatus,
    Difficulty,
    ExamAttemptStatus,
    ExamTemplateStatus,
    FileType,
    InvitationStatus,
    ParseStatus,
    PublicLinkStatus,
    QuestionBankStatus,
    QuestionType,
    Role,
    SectionType,
    TestStatus,
    TestType,
)
from app.db.models.evaluation import Evaluation, QuestionFeedback  # noqa: F401
from app.db.models.job_description import JdExtractedData, JobDescription  # noqa: F401
from app.db.models.knowledge import KnowledgeChunk, KnowledgeDocument  # noqa: F401
from app.db.models.public_link import PublicAssessmentLink  # noqa: F401
from app.db.models.question_bank import (  # noqa: F401  # noqa: F401  # noqa: F401
    AiRiskSignal,
    CandidateReport,
    ExamAttempt,
    ExamAttemptQuestion,
    ExamTemplate,
    QuestionBank,
)
from app.db.models.test import Question, Test  # noqa: F401
from app.db.models.user import User  # noqa: F401
from app.db.models.webhook import WebhookDelivery, WebhookSubscription  # noqa: F401
