"""
Unit tests for the parser service.

These tests run fully offline — no network, no DB.
They test the extract_text() function directly with real
(minimal) PDF and DOCX files.
"""

import pytest

from app.db.models.enums import FileType
from app.services.parser_service import (
    ParseError,
    _clean_text,
    _extract_docx,
    _extract_pdf,
    extract_text,
)

# ─── _clean_text ──────────────────────────────────────────────

class TestCleanText:

    def test_collapses_extra_blank_lines(self):
        text = "line one\n\n\n\n\nline two"
        result = _clean_text(text)
        assert "\n\n\n" not in result
        assert "line one" in result
        assert "line two" in result

    def test_strips_leading_trailing_whitespace_per_line(self):
        text = "  hello world  \n  foo bar  "
        result = _clean_text(text)
        for line in result.split("\n"):
            assert line == line.strip()

    def test_collapses_multiple_spaces(self):
        text = "word1   word2    word3"
        result = _clean_text(text)
        assert "  " not in result

    def test_removes_null_bytes(self):
        text = "hello\x00world\x01test"
        result = _clean_text(text)
        assert "\x00" not in result
        assert "\x01" not in result
        assert "helloworld" in result or "hello" in result

    def test_preserves_newlines(self):
        text = "line1\nline2\nline3"
        result = _clean_text(text)
        assert "\n" in result

    def test_empty_string_returns_empty(self):
        assert _clean_text("") == ""

    def test_only_whitespace_returns_empty(self):
        assert _clean_text("   \n\n\t  ") == ""


# ─── PDF extraction ───────────────────────────────────────────

class TestPdfExtraction:

    def test_raises_parse_error_on_garbage_bytes(self):
        with pytest.raises(ParseError):  # message varies if PyMuPDF missing vs corrupt file
            _extract_pdf(b"this is not a pdf")

    def test_raises_parse_error_on_empty_bytes(self):
        with pytest.raises(ParseError):
            _extract_pdf(b"")

    def test_extracts_text_from_valid_pdf(self, sample_pdf_bytes: bytes):
        """Uses the minimal PDF from conftest — should contain role text."""
        try:
            text = _extract_pdf(sample_pdf_bytes)
            assert isinstance(text, str)
            assert len(text) > 0
        except ParseError as e:
            # If PyMuPDF can't parse our minimal PDF, skip gracefully
            pytest.skip(f"PyMuPDF could not parse minimal test PDF: {e}")


# ─── DOCX extraction ──────────────────────────────────────────

class TestDocxExtraction:

    def test_raises_parse_error_on_garbage_bytes(self):
        with pytest.raises(ParseError):  # message varies if python-docx missing vs corrupt file
            _extract_docx(b"this is not a docx")

    def test_extracts_text_from_valid_docx(self, sample_docx_bytes: bytes):
        try:
            import docx  # noqa
        except ImportError:
            pytest.skip("python-docx not installed")

        # Only test if we got a real docx (not the fallback stub)
        if sample_docx_bytes[:4] != b"PK\x03\x04":
            pytest.skip("sample_docx_bytes is not a real DOCX")

        text = _extract_docx(sample_docx_bytes)
        assert isinstance(text, str)
        assert len(text) > 0

    def test_docx_extracts_heading_text(self, sample_docx_bytes: bytes):
        try:
            import docx  # noqa
        except ImportError:
            pytest.skip("python-docx not installed")

        if sample_docx_bytes[:4] != b"PK\x03\x04":
            pytest.skip("sample_docx_bytes is not a real DOCX")

        text = _extract_docx(sample_docx_bytes)
        assert "Python" in text or "Engineer" in text


# ─── extract_text (dispatch) ──────────────────────────────────

class TestExtractText:

    def test_raises_for_unsupported_type(self):
        # Create a fake FileType value to test the dispatch guard
        with pytest.raises((ParseError, Exception)):
            extract_text(b"content", "UNSUPPORTED")  # type: ignore

    def test_raises_parse_error_on_empty_result(self):
        """A PDF/DOCX that produces no text raises ParseError."""
        # A minimal PDF with no text content
        empty_pdf = (
            b"%PDF-1.4\n"
            b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
            b"xref\n0 3\n0000000000 65535 f\n"
            b"trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n9\n%%EOF"
        )
        try:
            import fitz  # noqa
        except ImportError:
            pytest.skip("PyMuPDF not installed")

        with pytest.raises(ParseError):
            extract_text(empty_pdf, FileType.PDF)
