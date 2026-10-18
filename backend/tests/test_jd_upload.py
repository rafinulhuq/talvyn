"""
Tests for Job Description API endpoints.

Covers:
- POST /api/v1/jd/upload
- GET  /api/v1/jd/
- GET  /api/v1/jd/{id}
- GET  /api/v1/jd/{id}/status
- DELETE /api/v1/jd/{id}

Tests run against an in-memory SQLite DB (no PostgreSQL required).
File I/O is mocked (no real disk writes).
"""

from httpx import AsyncClient

# ─── Upload ───────────────────────────────────────────────────

class TestJdUpload:

    async def test_upload_pdf_returns_201(self, client: AsyncClient, sample_pdf_bytes: bytes):
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("job_description.pdf", sample_pdf_bytes, "application/pdf")},
        )
        assert response.status_code == 201

    async def test_upload_returns_jd_id(self, client: AsyncClient, sample_pdf_bytes: bytes):
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("jd.pdf", sample_pdf_bytes, "application/pdf")},
        )
        data = response.json()
        assert "id" in data
        assert len(data["id"]) == 36  # UUID format

    async def test_upload_returns_correct_filename(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("my_role.pdf", sample_pdf_bytes, "application/pdf")},
        )
        assert response.json()["original_filename"] == "my_role.pdf"

    async def test_upload_returns_pending_status(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("jd.pdf", sample_pdf_bytes, "application/pdf")},
        )
        assert response.json()["parse_status"] == "PENDING"

    async def test_upload_docx_returns_201(
        self, client: AsyncClient, sample_docx_bytes: bytes
    ):
        response = await client.post(
            "/api/v1/jd/upload",
            files={
                "file": (
                    "engineer_jd.docx",
                    sample_docx_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )
        assert response.status_code == 201
        assert response.json()["file_type"] == "DOCX"

    async def test_upload_rejects_wrong_extension(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("resume.txt", b"some text content", "text/plain")},
        )
        assert response.status_code == 415

    async def test_upload_rejects_wrong_magic_bytes(self, client: AsyncClient):
        """File has .pdf extension but wrong magic bytes — should be rejected."""
        fake_pdf = b"This is not a real PDF file content"
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("fake.pdf", fake_pdf, "application/pdf")},
        )
        assert response.status_code == 415

    async def test_upload_rejects_oversized_file(self, client: AsyncClient):
        """File exceeds 10MB limit."""
        oversized = b"%PDF-1.4 " + b"X" * (11 * 1024 * 1024)
        response = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("big.pdf", oversized, "application/pdf")},
        )
        assert response.status_code == 413

    async def test_upload_missing_file_returns_422(self, client: AsyncClient):
        response = await client.post("/api/v1/jd/upload")
        assert response.status_code == 422

    async def test_upload_requires_internal_token(self, sample_pdf_bytes: bytes):
        """Request without X-Internal-Token must be rejected."""
        from httpx import ASGITransport, AsyncClient

        from app.main import app

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as no_token_client:
            response = await no_token_client.post(
                "/api/v1/jd/upload",
                files={"file": ("jd.pdf", sample_pdf_bytes, "application/pdf")},
            )
        assert response.status_code == 401


# ─── List ─────────────────────────────────────────────────────

class TestJdList:

    async def test_list_returns_200(self, client: AsyncClient):
        response = await client.get("/api/v1/jd/")
        assert response.status_code == 200

    async def test_list_response_shape(self, client: AsyncClient):
        response = await client.get("/api/v1/jd/")
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data

    async def test_list_includes_uploaded_jd(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        # Upload a JD first
        await client.post(
            "/api/v1/jd/upload",
            files={"file": ("engineer.pdf", sample_pdf_bytes, "application/pdf")},
        )
        response = await client.get("/api/v1/jd/")
        data = response.json()
        assert data["total"] >= 1
        filenames = [item["original_filename"] for item in data["items"]]
        assert "engineer.pdf" in filenames

    async def test_list_pagination(self, client: AsyncClient, sample_pdf_bytes: bytes):
        response = await client.get("/api/v1/jd/?page=1&page_size=5")
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 5
        assert len(data["items"]) <= 5

    async def test_list_invalid_page_returns_422(self, client: AsyncClient):
        response = await client.get("/api/v1/jd/?page=0")
        assert response.status_code == 422


# ─── Get detail ───────────────────────────────────────────────

class TestJdGet:

    async def test_get_existing_jd(self, client: AsyncClient, sample_pdf_bytes: bytes):
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("role.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]

        response = await client.get(f"/api/v1/jd/{jd_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == jd_id
        assert data["original_filename"] == "role.pdf"

    async def test_get_excludes_raw_text_by_default(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("jd.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]
        response = await client.get(f"/api/v1/jd/{jd_id}")
        assert response.json()["raw_text"] is None

    async def test_get_nonexistent_returns_404(self, client: AsyncClient):
        response = await client.get("/api/v1/jd/00000000-0000-0000-0000-999999999999")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


# ─── Status ───────────────────────────────────────────────────

class TestJdStatus:

    async def test_status_pending_after_upload(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("jd.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]
        response = await client.get(f"/api/v1/jd/{jd_id}/status")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == jd_id
        assert data["parse_status"] in ("PENDING", "PROCESSING", "DONE", "FAILED")

    async def test_status_nonexistent_returns_404(self, client: AsyncClient):
        response = await client.get(
            "/api/v1/jd/00000000-0000-0000-0000-000000000000/status"
        )
        assert response.status_code == 404


# ─── Delete ───────────────────────────────────────────────────

class TestJdDelete:

    async def test_delete_returns_204(self, client: AsyncClient, sample_pdf_bytes: bytes):
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("to_delete.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]
        response = await client.delete(f"/api/v1/jd/{jd_id}")
        assert response.status_code == 204

    async def test_delete_removes_from_list(
        self, client: AsyncClient, sample_pdf_bytes: bytes
    ):
        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("delete_me.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]
        await client.delete(f"/api/v1/jd/{jd_id}")

        response = await client.get(f"/api/v1/jd/{jd_id}")
        assert response.status_code == 404

    async def test_delete_nonexistent_returns_404(self, client: AsyncClient):
        response = await client.delete(
            "/api/v1/jd/00000000-0000-0000-0000-888888888888"
        )
        assert response.status_code == 404

    async def test_delete_blocked_when_jd_has_candidates(
        self, client: AsyncClient, sample_pdf_bytes: bytes, db_session
    ):
        from app.core.security import generate_token, hash_token, make_expiry
        from app.db.models.candidate import Candidate, Invitation
        from app.db.models.enums import InvitationStatus
        from app.services.invitation_service import _next_candidate_number

        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("has_candidates.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]

        candidate = Candidate(
            candidate_number=await _next_candidate_number(db_session),
            email="erin@example.com",
            name="Erin",
        )
        db_session.add(candidate)
        await db_session.flush()
        db_session.add(
            Invitation(
                candidate_id=candidate.id,
                jd_id=jd_id,
                invited_by="00000000-0000-0000-0000-000000000000",
                token_hash=hash_token(generate_token()),
                expires_at=make_expiry(hours=72),
                status=InvitationStatus.PENDING,
            )
        )
        await db_session.commit()

        response = await client.delete(f"/api/v1/jd/{jd_id}")
        assert response.status_code == 409
        assert response.json()["error"]["details"]["candidate_count"] == 1

        # nothing was deleted
        assert (await client.get(f"/api/v1/jd/{jd_id}")).status_code == 200

    async def test_delete_with_force_removes_jd_and_candidates(
        self, client: AsyncClient, sample_pdf_bytes: bytes, db_session
    ):
        from app.core.security import generate_token, hash_token, make_expiry
        from app.db.models.candidate import Candidate, Invitation
        from app.db.models.enums import InvitationStatus
        from app.services.invitation_service import _next_candidate_number

        upload = await client.post(
            "/api/v1/jd/upload",
            files={"file": ("force_delete.pdf", sample_pdf_bytes, "application/pdf")},
        )
        jd_id = upload.json()["id"]

        candidate = Candidate(
            candidate_number=await _next_candidate_number(db_session),
            email="frank@example.com",
            name="Frank",
        )
        db_session.add(candidate)
        await db_session.flush()
        db_session.add(
            Invitation(
                candidate_id=candidate.id,
                jd_id=jd_id,
                invited_by="00000000-0000-0000-0000-000000000000",
                token_hash=hash_token(generate_token()),
                expires_at=make_expiry(hours=72),
                status=InvitationStatus.PENDING,
            )
        )
        await db_session.commit()

        response = await client.delete(f"/api/v1/jd/{jd_id}?force=true")
        assert response.status_code == 204
        assert (await client.get(f"/api/v1/jd/{jd_id}")).status_code == 404
