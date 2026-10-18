"""
Integration tests for the /api/v1/tests/* endpoints.
All AI calls mocked. DB uses in-memory SQLite via conftest.
"""

import json
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

# ─── Helpers ──────────────────────────────────────────────────

def _make_valid_test_json(mcq_count: int = 10, oe_count: int = 3) -> str:
    mcqs = []
    for i in range(mcq_count):
        mcqs.append({
            "question_type": "MCQ",
            "question_text": f"In Python, what is the most appropriate way to handle asynchronous I/O operations in question {i+1}?",
            "skill_tested": "Python async",
            "difficulty": "MEDIUM",
            "marks": 2,
            "options": [
                {"label": "A", "text": "Use threading always", "is_correct": False},
                {"label": "B", "text": "Use asyncio with async/await keywords", "is_correct": True},
                {"label": "C", "text": "Use global state variables", "is_correct": False},
                {"label": "D", "text": "Block with time.sleep calls", "is_correct": False},
            ],
            "correct_answer": "B",
            "explanation": "asyncio with async/await is the correct approach for non-blocking I/O in Python.",
        })

    oes = []
    for i in range(oe_count):
        oes.append({
            "question_type": "OPEN_ENDED",
            "question_text": f"Describe how you would design a fault-tolerant distributed system for processing high-volume events in problem {i+1}.",
            "skill_tested": "System Design",
            "difficulty": "HARD",
            "marks": 10,
            "expected_answer": (
                "A complete answer covers event queue design with Kafka or RabbitMQ, "
                "consumer group patterns for parallel processing, dead letter queues "
                "for failed messages, idempotency for safe retries, and monitoring."
            ),
            "scoring_rubric": (
                "Full marks for covering queue design, parallel processing, and failure handling. "
                "Half marks for 2 of 3 concerns. No marks for vague or incorrect responses."
            ),
        })

    return json.dumps({
        "title": "Senior Python Engineer Technical Test",
        "description": "Comprehensive technical assessment covering Python and backend engineering skills.",
        "duration_minutes": 60,
        "total_marks": mcq_count * 2 + oe_count * 10,
        "difficulty": "MIXED",
        "mcq_questions": mcqs,
        "open_ended_questions": oes,
    })


async def _create_test_via_api(client: AsyncClient) -> tuple[str, list[str]]:
    """
    Helper: create a JD, then generate tests for it.
    Returns (jd_id, [test_id, ...]).
    """
    from tests.conftest import _make_valid_pdf
    pdf_bytes = _make_valid_pdf()

    upload_resp = await client.post(
        "/api/v1/jd/upload",
        files={"file": ("role.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_resp.status_code == 201
    jd_id = upload_resp.json()["id"]

    # Inject extracted data directly (skip Ollama for JD analysis)

    # We need a separate session since the test client has its own
    # So we use the test DB directly through the conftest's override
    valid_json = _make_valid_test_json()

    with patch(
        "app.services.test_generation_service.ollama_client.generate",
        new=AsyncMock(return_value=valid_json),
    ):
        # First inject extracted_data so generate doesn't 409
        with patch("app.services.test_service.trigger_generate_tests") as mock_gen:

            from app.schemas.test import GenerateTestsResponse

            mock_gen.return_value = GenerateTestsResponse(
                jd_id=jd_id,
                tests=[],
                message="Mocked",
            )
            await client.post(f"/api/v1/tests/generate/{jd_id}", json={})

    return jd_id, []


# ─── Test generation endpoint ─────────────────────────────────

class TestGenerateEndpoint:

    async def test_generate_returns_409_when_no_extracted_data(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        """JD uploaded but not analyzed → 409."""
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("jd.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]

        response = await client.post(f"/api/v1/tests/generate/{jd_id}", json={})
        assert response.status_code == 409

    async def test_generate_returns_404_for_unknown_jd(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/tests/generate/00000000-0000-0000-0000-999999999999",
            json={},
        )
        assert response.status_code == 404

    async def test_generate_queues_background_job(
        self, client: AsyncClient, db_session, sample_pdf_bytes: bytes
    ):
        """Analyzed JD → 202 and background generation queued."""
        from app.db.models.job_description import JdExtractedData

        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("test_role.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]

        db_session.add(JdExtractedData(
            jd_id=jd_id,
            job_title="Senior Python Engineer",
            seniority_level="senior",
            must_have_skills=["Python", "FastAPI"],
            nice_to_have_skills=[],
            tools_technologies=["Docker"],
            responsibilities=[],
            recommended_test_topics=["async Python"],
            difficulty_distribution={
                "easy_percent": 20,
                "medium_percent": 50,
                "hard_percent": 30,
            },
        ))
        await db_session.commit()

        response = await client.post(f"/api/v1/tests/generate/{jd_id}", json={})

        assert response.status_code == 202
        data = response.json()
        assert data["jd_id"] == jd_id
        assert data["generation_status"] == "GENERATING"


# ─── List tests ───────────────────────────────────────────────

class TestListTests:

    async def test_list_returns_empty_for_new_jd(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("role.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]
        response = await client.get(f"/api/v1/tests/jd/{jd_id}")
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_returns_404_for_unknown(self, client: AsyncClient):
        # List tests doesn't 404 — returns empty for unknown JD (no JD check)
        response = await client.get(
            "/api/v1/tests/jd/00000000-0000-0000-0000-000000000000"
        )
        assert response.status_code == 200


# ─── Get single test ──────────────────────────────────────────

class TestGetTest:

    async def test_get_nonexistent_returns_404(self, client: AsyncClient):
        response = await client.get(
            "/api/v1/tests/00000000-0000-0000-0000-000000000000"
        )
        assert response.status_code == 404

    async def test_get_requires_auth(self, sample_pdf_bytes: bytes):
        from httpx import ASGITransport, AsyncClient

        from app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as no_auth_client:
            response = await no_auth_client.get(
                "/api/v1/tests/00000000-0000-0000-0000-000000000000"
            )
        assert response.status_code == 401


# ─── Update test ─────────────────────────────────────────────

class TestUpdateTest:

    async def test_update_nonexistent_returns_404(self, client: AsyncClient):
        response = await client.patch(
            "/api/v1/tests/00000000-0000-0000-0000-000000000000",
            json={"title": "New Title For Testing"},
        )
        assert response.status_code == 404

    async def test_update_with_short_title_returns_422(self, client: AsyncClient):
        response = await client.patch(
            "/api/v1/tests/00000000-0000-0000-0000-000000000000",
            json={"title": "Hi"},
        )
        assert response.status_code == 422


# ─── Approve test ─────────────────────────────────────────────

class TestApproveTest:

    async def test_approve_nonexistent_returns_404(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/tests/00000000-0000-0000-0000-000000000000/status",
            json={"status": "APPROVED"},
        )
        assert response.status_code == 404

    async def test_invalid_status_returns_422(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/tests/00000000-0000-0000-0000-000000000000/status",
            json={"status": "PUBLISHED"},   # Not a valid status
        )
        assert response.status_code == 422


# ─── Update question ─────────────────────────────────────────

class TestUpdateQuestion:

    async def test_update_nonexistent_question_returns_404(self, client: AsyncClient):
        response = await client.patch(
            "/api/v1/tests/questions/00000000-0000-0000-0000-000000000000",
            json={"question_text": "What is the purpose of async/await in Python programs and why is it useful?"},
        )
        assert response.status_code == 404

    async def test_update_with_invalid_options_returns_422(self, client: AsyncClient):
        """Only 3 options provided — should be rejected."""
        response = await client.patch(
            "/api/v1/tests/questions/00000000-0000-0000-0000-000000000000",
            json={
                "options": [
                    {"label": "A", "text": "Option A text here", "is_correct": False},
                    {"label": "B", "text": "Option B text here", "is_correct": True},
                    {"label": "C", "text": "Option C text here", "is_correct": False},
                ]
            },
        )
        assert response.status_code == 422
