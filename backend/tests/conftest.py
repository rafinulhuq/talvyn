"""
Shared pytest fixtures.

Uses an in-memory SQLite database so tests run without PostgreSQL.
FastAPI app is patched to use the test DB and skip real file I/O.
"""

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Set env vars BEFORE importing app modules.
#
# All of these are force-set (not setdefault) rather than left to whatever
# the ambient environment happens to provide — a developer's shell, or (more
# subtly) `docker compose run backend pytest`, which inherits the real
# backend/.env via env_file. A stray `export DEBUG=release` breaks
# Settings() outright (strict bool field); a real INTERNAL_API_SECRET or
# MAGIC_LINK_SECRET from .env silently mismatches the values the fixtures
# below hardcode (e.g. the `client` fixture's X-Internal-Token header),
# turning unrelated-looking 401s into a debugging trip instead of an
# obviously-environmental issue. Tests must get exactly these values
# regardless of what's lying around outside the test process.
os.environ["DEBUG"] = "false"
os.environ["APP_ENV"] = "development"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["INTERNAL_API_SECRET"] = "test_secret_that_is_32_chars_long_x"
os.environ["MAGIC_LINK_SECRET"] = "test_magic_link_secret_32chars_ok!"
os.environ["UPLOAD_DIR"] = "/tmp/jd_test_uploads"
os.environ["OLLAMA_BASE_URL"] = "http://localhost:11434"
os.environ["QUESTION_BANK_MODE"] = "false"
os.environ["GLM_ENABLED"] = "false"
os.environ["EMBEDDING_ENABLED"] = "false"
os.environ["AI_LIKENESS_ENABLED"] = "false"

# The real limiter is Redis-backed (so counters are shared across uvicorn
# workers in production) — which means it's also shared across pytest runs
# against the same Redis instance, and accumulates within a single run
# since many tests hit the same rate-limited endpoints (e.g. /attempts/start).
# Tests exercise endpoint behavior, not rate-limit enforcement, so disable
# it here rather than have unrelated tests start failing once an earlier
# test's calls eat the quota.
from app.core.ratelimit import limiter

limiter.enabled = False

import logging

import structlog

# Configure structlog for tests — use stdlib factory which supports .name attribute
logging.basicConfig(level=logging.WARNING)
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.dev.ConsoleRenderer(colors=False),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING),
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=False,
)
from app.db.base import Base
from app.db.models.job_description import JdExtractedData, JobDescription  # noqa: F401
from app.db.models.user import User  # noqa: F401 — register users table first

# ── In-memory test engine ─────────────────────────────────────

TEST_ENGINE = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)

TestSessionFactory = async_sessionmaker(
    bind=TEST_ENGINE,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once for the test session."""
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    """Provide a fresh DB session per test, rolled back after."""
    async with TEST_ENGINE.begin() as conn:
        async with AsyncSession(bind=conn, expire_on_commit=False) as session:
            yield session
            await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    """
    HTTP test client wired to the FastAPI app with:
    - Test DB session injected
    - X-Internal-Token header pre-set
    - File I/O mocked (no real disk writes)
    """
    from app.db.session import get_db
    from app.main import app
    from app.services.file_service import file_service

    # Override DB dependency
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Mock file_service so tests don't write to disk
    import uuid

    original_save = file_service.save_jd_file
    original_delete = file_service.delete_file

    async def mock_save(content, original_filename, extension):
        return f"jds/{uuid.uuid4()}.{extension.lstrip('.')}"

    async def mock_delete(path):
        return True

    file_service.save_jd_file = mock_save
    file_service.delete_file = mock_delete

    # Prevent background tasks from running in tests
    # (they create their own DB connections outside the test transaction)
    import unittest.mock as mock2
    had_arq_pool = hasattr(app.state, "arq_pool")
    original_arq_pool = getattr(app.state, "arq_pool", None)
    mock_arq_pool = mock2.Mock()
    mock_arq_pool.enqueue_job = mock2.AsyncMock()
    app.state.arq_pool = mock_arq_pool

    # webhook_service reads its own module-level pool (set at startup in
    # main.py) rather than app.state, since it's called from deep service
    # functions with no Request object — wire the same mock there too.
    from app.services import webhook_service
    webhook_service.set_arq_pool(mock_arq_pool)

    with mock2.patch("app.services.jd_service.parse_jd_background", new=mock2.AsyncMock()):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={
                "X-Internal-Token": "test_secret_that_is_32_chars_long_x",
                # Mirrors what the Next.js proxy always forwards in production
                # for an authenticated session (see api/proxy/[...path]/route.ts).
                # Tests that need a *missing* header explicitly delete it instead.
                "X-Inviter-Id": "00000000-0000-0000-0000-000000000000",
                "X-Uploader-Id": "00000000-0000-0000-0000-000000000000",
                "X-Actor-Id": "00000000-0000-0000-0000-000000000000",
            },
        ) as ac:
            yield ac

    # Restore
    file_service.save_jd_file = original_save
    file_service.delete_file = original_delete
    if had_arq_pool:
        app.state.arq_pool = original_arq_pool
    else:
        delattr(app.state, "arq_pool")
    webhook_service.set_arq_pool(None)
    app.dependency_overrides.clear()


# ── Sample file fixtures ──────────────────────────────────────

@pytest.fixture
def sample_pdf_bytes() -> bytes:
    """Minimal valid PDF bytes (real magic bytes, readable by PyMuPDF)."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\n"
        b"BT /F1 12 Tf 72 720 Td (Senior Python Engineer) Tj ET\n"
        b"endstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f\n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n9\n%%EOF"
    )


@pytest.fixture
def sample_docx_bytes() -> bytes:
    """
    Create a minimal valid DOCX file in memory using python-docx.
    Returns raw bytes with correct OOXML/ZIP magic bytes.
    """
    import io
    try:
        from docx import Document
        doc = Document()
        doc.add_heading("Senior Python Engineer", 0)
        doc.add_paragraph("We are looking for an experienced Python engineer.")
        doc.add_paragraph("Requirements: Python, FastAPI, PostgreSQL, Docker")
        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()
    except ImportError:
        # Fallback: minimal ZIP with OOXML magic if python-docx not installed
        return b"PK\x03\x04" + b"\x00" * 100



# ── Public helper usable by test modules ──────────────────────
def _make_valid_pdf() -> bytes:
    """Return a minimal valid PDF bytes for use in tests."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\n"
        b"BT /F1 12 Tf 72 720 Td (Senior Python Engineer) Tj ET\n"
        b"endstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f\n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n9\n%%EOF"
    )
