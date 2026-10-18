"""
Document parsing service.

Extracts clean text from PDF and DOCX files using:
- PDF:  PyMuPDF (fitz) — handles multi-page, preserves reading order
- DOCX: python-docx   — extracts paragraphs + table cell text

Both extractors:
- Strip excessive whitespace
- Preserve paragraph breaks
- Return plain UTF-8 text (no HTML/markdown)
- Raise ParseError on corrupt or unreadable files
"""

import re
from dataclasses import dataclass
from io import BytesIO

from app.core.logging import get_logger
from app.db.models.enums import FileType

logger = get_logger(__name__)


class ParseError(Exception):
    """Raised when a document cannot be parsed."""


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    method: str  # "native" | "ocr"


def extract_text(content: bytes, file_type: FileType, allow_ocr: bool = False) -> str:
    """
    Entry point — dispatch to the correct extractor.

    Args:
        content:   Raw file bytes
        file_type: FileType.PDF or FileType.DOCX
        allow_ocr: When True and native PDF extraction yields no text
                   (scanned PDF), fall back to per-page OCR via Tesseract.
                   Defaults to False, preserving the live JD-upload flow's
                   behavior of rejecting scanned PDFs with a clear error.

    Returns:
        Extracted plain text with whitespace normalised.

    Raises:
        ParseError: If extraction fails for any reason.
    """
    return extract_text_detailed(content, file_type, allow_ocr=allow_ocr).text


def extract_text_detailed(
    content: bytes, file_type: FileType, allow_ocr: bool = False
) -> ExtractionResult:
    """Like extract_text, but also reports which extraction path was used —
    OCR output is noisier than native extraction, so bulk ingestion records
    the method for later spot-checking."""
    try:
        method = "native"
        if file_type == FileType.PDF:
            raw = _extract_pdf(content)
        elif file_type == FileType.DOCX:
            raw = _extract_docx(content)
        else:
            raise ParseError(f"Unsupported file type: {file_type}")

        cleaned = _clean_text(raw)

        if not cleaned.strip() and file_type == FileType.PDF and allow_ocr:
            cleaned = _clean_text(_ocr_pdf(content))
            method = "ocr"

        if not cleaned.strip():
            raise ParseError(
                "Document appears to be empty or contains no extractable text. "
                "If this is a scanned PDF, OCR is not currently supported."
            )

        logger.debug(
            "Text extracted",
            file_type=file_type.value,
            method=method,
            char_count=len(cleaned),
            word_count=len(cleaned.split()),
        )
        return ExtractionResult(text=cleaned, method=method)

    except ParseError:
        raise
    except Exception as exc:
        logger.error("Unexpected parse error", file_type=file_type.value, error=str(exc))
        raise ParseError(f"Failed to parse document: {exc}") from exc


# ── PDF Extractor ──────────────────────────────────────────────

def _extract_pdf(content: bytes) -> str:
    """
    Extract text from PDF using PyMuPDF.

    Strategy:
    - Open from bytes (no temp file needed)
    - Extract each page's text blocks in reading order
    - Join pages with a double newline to preserve section breaks
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ParseError(
            "PyMuPDF is not installed. Run: pip install pymupdf"
        )

    try:
        doc = fitz.open(stream=content, filetype="pdf")  # type: ignore[arg-type]
    except Exception as exc:
        raise ParseError(f"Cannot open PDF: {exc}") from exc

    if doc.is_encrypted:
        raise ParseError(
            "PDF is password-protected. Please provide an unencrypted file."
        )

    pages: list[str] = []
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        # get_text("text") returns text in reading order
        page_text = page.get_text("text")
        if page_text.strip():
            pages.append(page_text)

    doc.close()

    # No text pages (e.g. a scanned/image-only PDF) returns empty text; the
    # caller's empty-check decides between raising and the OCR fallback.
    return "\n\n".join(pages)


# ── OCR fallback (scanned PDFs) ────────────────────────────────

def _ocr_pdf(content: bytes) -> str:
    """
    OCR an image-only PDF: rasterize each page with PyMuPDF and run it
    through Tesseract. Only invoked when native extraction found no text
    AND the caller opted in (bulk knowledge ingestion) — the live JD-upload
    flow never reaches this.
    """
    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise ParseError(
            "OCR dependencies missing. Run: pip install pytesseract pillow "
            "(and install the tesseract-ocr system package)."
        ) from exc

    import fitz  # PyMuPDF — already a hard dependency of _extract_pdf

    try:
        doc = fitz.open(stream=content, filetype="pdf")  # type: ignore[arg-type]
    except Exception as exc:
        raise ParseError(f"Cannot open PDF for OCR: {exc}") from exc

    pages: list[str] = []
    try:
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # 200 DPI balances Tesseract accuracy against rasterization cost.
            pixmap = page.get_pixmap(dpi=200)
            image = Image.open(BytesIO(pixmap.tobytes("png")))
            page_text = pytesseract.image_to_string(image)
            if page_text.strip():
                pages.append(page_text)
    except Exception as exc:
        raise ParseError(f"OCR failed: {exc}") from exc
    finally:
        doc.close()

    logger.info("OCR fallback used", page_count=len(pages))
    return "\n\n".join(pages)


# ── DOCX Extractor ─────────────────────────────────────────────

def _extract_docx(content: bytes) -> str:
    """
    Extract text from DOCX using python-docx.

    Strategy:
    - Parse paragraphs in document order
    - Also extract text from table cells (important for skill matrices)
    - Preserve heading hierarchy by adding blank lines around headings
    """
    try:
        from docx import Document  # python-docx
    except ImportError:
        raise ParseError(
            "python-docx is not installed. Run: pip install python-docx"
        )

    try:
        doc = Document(BytesIO(content))
    except Exception as exc:
        raise ParseError(f"Cannot open DOCX: {exc}") from exc

    parts: list[str] = []

    # Iterate the document body in order, picking up both paragraphs and tables
    # We walk the XML directly to preserve document order
    body = doc.element.body
    for child in body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        if tag == "p":
            # Paragraph
            text = "".join(
                node.text or ""
                for node in child.iter()
                if node.tag.endswith("}t")
            ).strip()
            if text:
                parts.append(text)

        elif tag == "tbl":
            # Table — extract all cell text row by row
            rows: list[str] = []
            for row in child:
                if not row.tag.endswith("}tr"):
                    continue
                cells: list[str] = []
                for cell in row:
                    if not cell.tag.endswith("}tc"):
                        continue
                    cell_text = "".join(
                        node.text or ""
                        for node in cell.iter()
                        if node.tag.endswith("}t")
                    ).strip()
                    if cell_text:
                        cells.append(cell_text)
                if cells:
                    rows.append(" | ".join(cells))
            if rows:
                parts.append("\n".join(rows))

    return "\n\n".join(parts)


# ── Text cleaner ───────────────────────────────────────────────

def clean_text(text: str) -> str:
    """Public entry point for normalising text extracted outside this module (e.g. client-side WASM)."""
    return _clean_text(text)


def _clean_text(text: str) -> str:
    """
    Normalise extracted text:
    - Decode common Unicode issues
    - Collapse repeated whitespace (but preserve paragraph breaks)
    - Remove null bytes and control characters (except newlines/tabs)
    - Trim leading/trailing whitespace per line
    """
    # Remove null bytes and other control chars (keep \n, \t, \r)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Collapse runs of spaces/tabs to a single space within a line
    lines = text.split("\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in lines]

    # Collapse 3+ consecutive blank lines to 2
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
