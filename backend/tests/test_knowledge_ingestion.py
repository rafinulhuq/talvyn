"""Tests for the RAG knowledge corpus: chunking, ingestion, OCR fallback, retrieval.

Covers the testing checklist in
docs/superpowers/specs/2026-07-05-bulk-jd-corpus-rag-ingestion-design.md.
"""

import shutil

import pytest
from sqlalchemy import func, select

from app.db.models.enums import FileType
from app.db.models.knowledge import KnowledgeChunk, KnowledgeDocument  # noqa: F401
from app.services import parser_service
from app.services.parser_service import ExtractionResult, ParseError
from app.services.rag import indexing_service, retrieval_service
from app.services.rag.chunking_service import CHUNK_SIZE, chunk_text

SAMPLE_TEXT = (
    "Senior Backend Engineer\n\n"
    + "\n\n".join(
        f"Section {i}. " + ("We build event-driven services with Kafka and Postgres. " * 6)
        for i in range(12)
    )
)


def _fake_embedding_for(text: str) -> list[float]:
    """Deterministic pseudo-embedding: direction depends on keyword presence."""
    kafka = 1.0 if "kafka" in text.lower() else 0.0
    design = 1.0 if "figma" in text.lower() else 0.0
    return [kafka, design, 1.0] + [0.0] * 765


@pytest.fixture
def fake_embeddings(monkeypatch):
    async def fake_embed(text: str) -> list[float]:
        return _fake_embedding_for(text)

    monkeypatch.setattr(indexing_service, "embed_or_raise", fake_embed)
    monkeypatch.setattr(retrieval_service, "embed_or_raise", fake_embed)


def _image_only_pdf(text: str = "Scanned Job Description for OCR") -> bytes:
    """Build a synthetic scanned PDF: render a text page to a bitmap, then
    embed only the bitmap in a fresh PDF — no text layer."""
    import fitz

    source = fitz.open()
    page = source.new_page()
    page.insert_text((72, 120), text, fontsize=24)
    pixmap = page.get_pixmap(dpi=150)

    scanned = fitz.open()
    image_page = scanned.new_page(width=page.rect.width, height=page.rect.height)
    image_page.insert_image(image_page.rect, pixmap=pixmap)
    return scanned.tobytes()


def _text_pdf(text: str) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 120), text, fontsize=12)
    return doc.tobytes()


class TestChunking:
    def test_chunking_is_deterministic(self):
        first = chunk_text(SAMPLE_TEXT)
        second = chunk_text(SAMPLE_TEXT)
        assert first == second
        assert len(first) > 1
        assert all(len(chunk) <= CHUNK_SIZE for chunk in first)

    def test_empty_text_yields_no_chunks(self):
        assert chunk_text("   \n\n  ") == []


class TestIngestion:
    async def test_ingest_and_content_hash_dedupe(self, db_session, fake_embeddings):
        extraction = ExtractionResult(text=SAMPLE_TEXT, method="native")

        first = await indexing_service.ingest_extracted_text(
            db_session, filename="backend.pdf", extraction=extraction
        )
        assert first.status == "ingested"
        assert first.chunk_count > 1

        # Same text, different filename → still skipped (hash dedupe).
        second = await indexing_service.ingest_extracted_text(
            db_session, filename="backend-copy.pdf", extraction=extraction
        )
        assert second.status == "skipped"

        docs = (await db_session.execute(select(func.count(KnowledgeDocument.id)))).scalar_one()
        chunks = (await db_session.execute(select(func.count(KnowledgeChunk.id)))).scalar_one()
        assert docs == 1
        assert chunks == first.chunk_count

        doc = (await db_session.execute(select(KnowledgeDocument))).scalar_one()
        assert doc.metadata_json["extraction_method"] == "native"
        assert doc.title == "Senior Backend Engineer"

    async def test_dry_run_writes_nothing(self, db_session, fake_embeddings):
        result = await indexing_service.ingest_extracted_text(
            db_session,
            filename="dry.pdf",
            extraction=ExtractionResult(text=SAMPLE_TEXT, method="native"),
            dry_run=True,
        )
        assert result.status == "dry_run"
        assert result.chunk_count > 0
        docs = (await db_session.execute(select(func.count(KnowledgeDocument.id)))).scalar_one()
        assert docs == 0

    async def test_embedding_failure_fails_only_that_document(self, db_session, monkeypatch):
        async def broken_embed(text: str) -> list[float]:
            raise indexing_service.EmbeddingError("ollama down")

        monkeypatch.setattr(indexing_service, "embed_or_raise", broken_embed)
        result = await indexing_service.ingest_extracted_text(
            db_session,
            filename="unlucky.pdf",
            extraction=ExtractionResult(text=SAMPLE_TEXT, method="native"),
        )
        assert result.status == "failed"
        assert "ollama down" in (result.error or "")
        docs = (await db_session.execute(select(func.count(KnowledgeDocument.id)))).scalar_one()
        assert docs == 0  # transaction rolled back — no half-indexed document


class TestOcrFallback:
    def test_scanned_pdf_rejected_without_ocr_flag(self):
        # Live JD-upload behavior must not change: scanned PDFs still fail.
        with pytest.raises(ParseError, match="no extractable text"):
            parser_service.extract_text(_image_only_pdf(), FileType.PDF, allow_ocr=False)

    def test_text_pdf_never_invokes_ocr(self, monkeypatch):
        def exploding_ocr(content: bytes) -> str:
            raise AssertionError("OCR must not run for text-layer PDFs")

        monkeypatch.setattr(parser_service, "_ocr_pdf", exploding_ocr)
        result = parser_service.extract_text_detailed(
            _text_pdf("Plain text JD"), FileType.PDF, allow_ocr=True
        )
        assert result.method == "native"
        assert "Plain text JD" in result.text

    @pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")
    def test_scanned_pdf_ocr_fallback_extracts_text(self):
        result = parser_service.extract_text_detailed(
            _image_only_pdf("Scanned Job Description for OCR"), FileType.PDF, allow_ocr=True
        )
        assert result.method == "ocr"
        assert "scanned job description" in result.text.lower()


class TestRetrieval:
    async def test_search_ranks_by_similarity(self, db_session, fake_embeddings):
        kafka_text = "Backend role.\n\nWe use Kafka streaming pipelines every day. " * 5
        design_text = "Design role.\n\nYou will craft Figma prototypes and mockups. " * 5

        for name, text_body in [("kafka.pdf", kafka_text), ("design.pdf", design_text)]:
            result = await indexing_service.ingest_extracted_text(
                db_session,
                filename=name,
                extraction=ExtractionResult(text=text_body, method="native"),
            )
            assert result.status == "ingested"

        hits = await retrieval_service.search(db_session, "kafka event streaming", top_k=3)
        assert hits
        assert hits[0].filename == "kafka.pdf"
        assert hits[0].score > 0

        design_hits = await retrieval_service.search(db_session, "figma product design", top_k=3)
        assert design_hits[0].filename == "design.pdf"
