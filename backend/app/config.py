"""
Application configuration via pydantic-settings.
All values are loaded from environment variables / .env file.
"""

from functools import lru_cache
from typing import Literal

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ──────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_name: str = "Talvyn API"
    app_version: str = "0.1.0"
    debug: bool = False
    # Set SHOW_DOCS=true in staging .env to enable /docs without enabling full
    # debug mode (verbose logging, stack traces in responses, etc.)
    show_docs: bool = False

    # ─── Server ───────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000

    # ─── Database ─────────────────────────────────────────────
    database_url: str

    # ─── Redis ────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379"

    # ─── Security ─────────────────────────────────────────────
    internal_api_secret: str  # Shared with Next.js for JWT verification

    # ─── CORS ─────────────────────────────────────────────────
    # Comma-separated list of allowed origins.
    # Includes both :3000 (default) and :3001 (docker-compose dev port) so
    # candidate browser requests (directClient in attempts.ts) work regardless
    # of which local port the frontend container is mapped to.
    # Override via ALLOWED_ORIGINS env var for staging/production.
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"

    @property
    def allowed_origins_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

        if self.app_env == "production":
            # Guard against the common misconfiguration: a real production
            # domain gets added to ALLOWED_ORIGINS but the dev-default
            # localhost entries never get removed. Strip them automatically
            # — but only if at least one real origin remains, so a genuinely
            # unconfigured ALLOWED_ORIGINS (still 100% localhost) doesn't
            # silently collapse to an empty allowlist and break CORS
            # entirely. That case should keep failing loudly (see
            # /health/ready's "cors" check) until the env var is set for
            # real, not be papered over here.
            non_localhost = [o for o in origins if "localhost" not in o]
            if non_localhost:
                return non_localhost

        return origins

    # ─── Grading ──────────────────────────────────────────────
    # Pass mark a newly generated test gets, as a percentage of its total
    # marks (see core/grading.py). Admins can override per test afterwards;
    # this only decides where a test starts. Changing it does not touch tests
    # that already exist.
    default_passing_percentage: int = 80

    # ─── Ollama ───────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma3:4b"
    ollama_timeout_seconds: int = 600
    ollama_max_retries: int = 3

    # ─── Semantic similarity (pgvector, opt-in) ──────────────
    # Disabled by default — enable with EMBEDDING_ENABLED=true after
    # `ollama pull nomic-embed-text` and running on pgvector/pgvector:pg16.
    # Embedding failures are always non-fatal to the evaluation pipeline.
    embedding_enabled: bool = False
    ollama_embedding_model: str = "nomic-embed-text"

    # ─── JD corpus RAG for test generation (opt-in) ─────────────
    # Uses the bulk-ingested KnowledgeDocument/KnowledgeChunk corpus to add
    # similar JD excerpts to assessment-generation prompts. This depends on
    # embeddings being enabled, but failures are non-fatal: generation falls
    # back to the plain prompt instead of blocking admins.
    rag_jd_context_enabled: bool = False
    rag_jd_context_top_k: int = 5
    rag_jd_context_max_chars: int = 3_500
    rag_jd_context_source_type: str = "jd_corpus"

    # ─── AI-likeness estimate for open-ended answers (opt-in) ────
    # Disabled by default — this is a probabilistic writing-style signal,
    # never a definitive verdict. Like embeddings, failures are always
    # non-fatal to the evaluation pipeline (see ai_detection_service.py).
    ai_likeness_enabled: bool = False
    # "llm" (default): prompt the configured Ollama/GLM model to self-report
    # an AI-likeness estimate — a writing-style judgment call, never a
    # calibrated probability. "desklib": run the real DeBERTa-v3-large
    # classifier (desklib_detector_service.py) instead — a trained
    # probability, no JSON-correction retries needed. Independent of which
    # model JD extraction/test generation/evaluation use.
    ai_detection_backend: Literal["llm", "desklib"] = "llm"
    desklib_model_name: str = "desklib/ai-text-detector-v1.01"

    # ─── Test generation (tuned by start.sh based on hardware) ───
    # MCQ and open-ended counts per test type.
    # Reduce on low-VRAM hardware to shorten generation time.
    test_mcq_count: int = 5
    test_oe_count: int = 2
    # Sequential mode: generate one test at a time instead of all 3 in parallel.
    # Always True when OLLAMA_NUM_PARALLEL=1 (default) to avoid queue timeouts.
    test_sequential_generation: bool = True

    # ─── Question bank / sectioned exam (Master Prompt 2, opt-in) ────
    # Disabled by default — when False, every existing route/flow behaves
    # exactly as before (one Test per JD per legacy test_type, generated
    # once, no question_bank_id ever set). When True, admins can generate
    # a larger reusable bank per section and assign locked subsets per
    # candidate via QuestionBankService/ExamAssignmentService.
    question_bank_mode: bool = False
    # Per-section MCQ/CQ targets. "Minimum fallback" (20/10) is the floor
    # below which a bank is FAILED, never assignable. "Commercial" (40/20)
    # is the recommended size — a bank between the two is READY but flagged
    # as below-recommended in generation_metadata_json/the status endpoint.
    bank_mcq_minimum: int = 20
    bank_cq_minimum: int = 10
    bank_mcq_commercial: int = 40
    bank_cq_commercial: int = 20
    # Per-candidate assignment counts per section (10 MCQ + 5 CQ × 3 sections
    # = 30 MCQ + 15 CQ total, per Master Prompt 2).
    exam_section_mcq_count: int = 10
    exam_section_cq_count: int = 5

    # ─── Scoring weights (Master Prompt 2, configurable per job) ─────
    # Override per-JD via JobDescription.exam_config_json["section_weights"].
    section_weight_reasoning: float = 0.30
    section_weight_practical: float = 0.35
    section_weight_technical: float = 0.35
    # Within each section: MCQ vs CQ split (Master Prompt 3).
    section_mcq_weight: float = 0.40
    section_cq_weight: float = 0.60

    # ─── AI orchestration: cloud provider (Master Prompt 3, opt-in) ──
    # Disabled unless BOTH glm_enabled=true AND a non-empty API key are set —
    # AiTaskRouterService silently falls back to the local model when either
    # is missing, so leaving these unset is always safe (never crashes the
    # app, never blocks question-bank generation/evaluation on local-only).
    # Targets the OpenAI-compatible chat-completions wire format, which
    # covers most real "GLM cloud" options (Zhipu's official API, OpenRouter,
    # Together.ai, or a self-hosted vLLM endpoint) without code changes —
    # point glm_api_base_url/glm_model at whichever one you actually use.
    glm_enabled: bool = False
    glm_api_base_url: str = ""
    glm_api_key: str = ""
    glm_model: str = "glm-4-plus"
    # Tried once, after glm_model exhausts its own retries — covers a
    # transient outage/quota hit/timeout on the primary model so one bad
    # provider doesn't fail the whole call when a second model is available.
    # Empty (default) disables fallback entirely.
    glm_fallback_model: str = ""
    glm_timeout_seconds: int = 120
    glm_max_retries: int = 2

    # ─── Deep-review triggers (Master Prompt 3) ───────────────────────
    # Controls which candidates are eligible for an OPTIONAL GLM deep
    # review/explanation pass on top of the default local evaluation —
    # never automatic, never the sole basis for a decision (see ai_risk_service.py).
    deep_review_top_candidate_threshold: float = 85.0
    deep_review_borderline_window: float = 10.0
    deep_review_ai_risk_threshold: float = 70.0

    # ─── File Storage ─────────────────────────────────────────
    # Set STORAGE_BACKEND=s3 to route all file I/O through MinIO.
    # Local mode uses aiofiles and the uploads_data Docker volume.
    storage_backend: Literal["local", "s3", "azure"] = "local"
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10

    # MinIO / S3 settings — only used when storage_backend=s3
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "talvyn_minio"
    minio_secret_key: str = "talvyn_minio_pass"
    minio_bucket: str = "talvyn-uploads"
    minio_secure: bool = False   # True in production behind HTTPS

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    # ─── Email ────────────────────────────────────────────────
    resend_api_key: str = ""
    email_from: str = "noreply@example.com"
    email_from_name: str = "Talvyn Platform"

    # ─── SMTP (dev / Mailpit, or prod relay e.g. Brevo) ────────
    # When smtp_host is non-empty the backend sends via SMTP instead of
    # the Resend HTTP API.  Point at Mailpit for local development:
    #   docker-compose sets SMTP_HOST=mailpit  SMTP_PORT=1025
    # In production, point at a free transactional relay (e.g. Brevo:
    #   smtp-relay.brevo.com, port 587) instead of self-hosting a mailserver.
    # Leave blank to fall back to Resend.
    smtp_host: str = ""
    smtp_port: int = 1025
    smtp_username: str = ""   # Mailpit needs no auth; set for real SMTP servers
    smtp_password: str = ""

    # ─── Magic Links ──────────────────────────────────────────
    magic_link_base_url: str = "http://localhost:3000"
    magic_link_expiry_hours: int = 72
    magic_link_secret: str

    # ─── HighGarden OTP gate ────────────────────────────────────
    # Every HighGarden unlock attempt (frontend/src/app/api/highgarden/unlock)
    # requires a one-time code emailed to this fixed address — it is never
    # accepted from the request, so a hijacked Super Admin session still
    # can't redirect the code to itself. Override via HIGHGARDEN_OTP_EMAIL.
    highgarden_otp_email: str = "syedrafinulhuq@gmail.com"

    # ─── Error Tracking (GlitchTip / Sentry) ─────────────────
    # Leave empty to disable. Set to GlitchTip DSN to capture unhandled
    # exceptions with full stack traces and request context.
    # Example: http://abc123@localhost:8080/1
    glitchtip_dsn: str = ""

    @field_validator("internal_api_secret", "magic_link_secret")
    @classmethod
    def validate_secret_length(cls, v: str, info: ValidationInfo) -> str:
        if len(v) < 32:
            raise ValueError(
                f"{info.field_name.upper()} must be at least 32 characters"
            )
        return v

    @field_validator("minio_secret_key")
    @classmethod
    def validate_minio_secret_key(cls, v: str, info: ValidationInfo) -> str:
        if (
            info.data.get("app_env") == "production"
            and info.data.get("storage_backend") == "s3"
            and v == "talvyn_minio_pass"
        ):
            raise ValueError(
                "MINIO_SECRET_KEY must be set to a real value when STORAGE_BACKEND=s3 "
                "in production — cannot use the insecure default."
            )
        return v


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance. Use as a FastAPI dependency:

        from app.config import get_settings
        settings = Depends(get_settings)
    """
    return Settings()
