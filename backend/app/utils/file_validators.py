"""
File validation utilities.
Validates uploaded files by extension AND magic bytes (not just MIME header,
which can be spoofed by the client).
"""

from pathlib import Path

from app.core.exceptions import FileTooLargeError, InvalidFileTypeError
from app.db.models.enums import FileType

# Allowed types with their magic byte signatures
# PDF: %PDF  (25 50 44 46)
# DOCX: PK\x03\x04  (50 4B 03 04) — OOXML is a ZIP container
_ALLOWED_EXTENSIONS: dict[str, FileType] = {
    ".pdf": FileType.PDF,
    ".docx": FileType.DOCX,
}

_MAGIC_BYTES: dict[FileType, tuple[bytes, ...]] = {
    FileType.PDF: (b"%PDF",),
    FileType.DOCX: (b"PK\x03\x04",),  # ZIP/OOXML magic
}

ALLOWED_MIME_TYPES: set[str] = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",  # Some clients send DOCX as zip
    "application/octet-stream",  # Fallback — we validate by magic bytes anyway
}


def get_file_type(filename: str) -> FileType:
    """
    Determine FileType from filename extension.
    Raises InvalidFileTypeError if extension is not allowed.
    """
    ext = Path(filename).suffix.lower()
    file_type = _ALLOWED_EXTENSIONS.get(ext)
    if file_type is None:
        raise InvalidFileTypeError(allowed=list(_ALLOWED_EXTENSIONS.keys()))
    return file_type


def validate_magic_bytes(content: bytes, expected_type: FileType) -> bool:
    """
    Verify file content starts with the expected magic bytes.
    Returns True if valid, False if the bytes don't match.
    """
    magic_signatures = _MAGIC_BYTES.get(expected_type, ())
    return any(content.startswith(sig) for sig in magic_signatures)


def validate_upload(
    filename: str,
    content: bytes,
    max_size_bytes: int,
) -> FileType:
    """
    Full validation pipeline for an uploaded file.

    1. Check extension is allowed
    2. Check file size is within limit
    3. Verify magic bytes match claimed type

    Returns the detected FileType on success.
    Raises AppException subclass on failure.
    """
    # 1. Extension check
    file_type = get_file_type(filename)

    # 2. Size check
    if len(content) > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        raise FileTooLargeError(max_mb=max_mb)

    # 3. Magic bytes check
    if not validate_magic_bytes(content, file_type):
        raise InvalidFileTypeError(allowed=list(_ALLOWED_EXTENSIONS.keys()))

    return file_type
