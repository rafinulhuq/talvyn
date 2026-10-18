"""
Profile picture (avatar) storage for platform accounts (User.id).

Deterministic storage key, no DB column: every avatar lives at
avatars/{user_id}.webp via the existing FileService (local/S3-abstracted,
same persistent uploads volume as JD files and CMS media). Re-uploading
overwrites the same key, so there is never an old-file cleanup problem, and
"does this user have an avatar" is answered by whether the key exists in
storage rather than a database flag.
"""

import io

from PIL import Image, ImageOps

from app.core.exceptions import FileTooLargeError, InvalidFileTypeError
from app.core.logging import get_logger
from app.services.file_service import file_service

logger = get_logger(__name__)

MAX_AVATAR_BYTES = 5 * 1024 * 1024  # raw upload cap; stored WebP ends up far smaller
AVATAR_SIZE = 256  # square, px

# Magic-byte signatures — not just the client-supplied Content-Type, which is
# spoofable (same reasoning as app/utils/file_validators.py for JD uploads).
_MAGIC_BYTES: tuple[bytes, ...] = (
    b"\xff\xd8\xff",  # JPEG
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"RIFF",  # WebP (RIFF container; "WEBP" checked separately below)
)


def _avatar_key(user_id: str) -> str:
    return f"avatars/{user_id}.webp"


def _validate_magic_bytes(content: bytes) -> None:
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return
    if any(content.startswith(sig) for sig in _MAGIC_BYTES if sig != b"RIFF"):
        return
    raise InvalidFileTypeError(allowed=[".jpg", ".jpeg", ".png", ".webp"])


async def save_avatar(user_id: str, content: bytes) -> None:
    """Validate, resize, and store a user's avatar. Raises AppException subclasses
    (FileTooLargeError, InvalidFileTypeError) on invalid input."""
    if len(content) > MAX_AVATAR_BYTES:
        raise FileTooLargeError(max_mb=MAX_AVATAR_BYTES // (1024 * 1024))
    _validate_magic_bytes(content)

    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except Exception as exc:
        raise InvalidFileTypeError(allowed=[".jpg", ".jpeg", ".png", ".webp"]) from exc

    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")

    # Center-crop to square before resizing so the result isn't stretched.
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=85)

    await file_service.write_file(_avatar_key(user_id), buffer.getvalue(), "image/webp")
    logger.info("Avatar saved", user_id=user_id, size_bytes=buffer.tell())


async def delete_avatar(user_id: str) -> None:
    await file_service.delete_file(_avatar_key(user_id))


async def read_avatar(user_id: str) -> bytes | None:
    """Returns the stored avatar bytes, or None if the user has none —
    treats any storage read failure (missing key on either backend, or a
    genuine storage error) as "no avatar" rather than surfacing a 500 for
    what is the common case for most users.
    """
    try:
        return await file_service.read_file(_avatar_key(user_id))
    except Exception:
        return None
