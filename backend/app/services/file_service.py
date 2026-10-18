"""
File storage service.

Supports two backends selected by STORAGE_BACKEND in settings:

  local (default)
    Stores files on the local filesystem inside the uploads Docker volume.
    Good for single-server dev and small deployments.
    Path layout: {UPLOAD_DIR}/jds/{uuid}.{ext}

  s3
    Stores files in MinIO (S3-compatible).  Survives volume wipes, has a web
    console at :9002, and scales to multi-instance deployments.
    Object key layout: jds/{uuid}.{ext}

The public interface (save_jd_file / read_file / delete_file / resolve_path)
is identical for both backends so calling code never needs to branch.
"""

import io
import uuid
from pathlib import Path
from typing import Protocol, runtime_checkable

import aiofiles

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


# ─── Backend protocol ─────────────────────────────────────────

@runtime_checkable
class StorageBackend(Protocol):
    async def save(self, key: str, content: bytes, content_type: str) -> None: ...
    async def read(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> bool: ...
    def exists_sync(self, key: str) -> bool: ...


# ─── Local filesystem backend ─────────────────────────────────

class _LocalBackend:
    def __init__(self, base_dir: Path) -> None:
        self._base = base_dir
        self._base.mkdir(parents=True, exist_ok=True)
        (self._base / "jds").mkdir(exist_ok=True)
        (self._base / "cms").mkdir(exist_ok=True)

    def _abs(self, key: str) -> Path:
        p = (self._base / key).resolve()
        try:
            p.relative_to(self._base)
        except ValueError:
            raise ValueError(f"Path traversal: {key!r}")
        return p

    async def save(self, key: str, content: bytes, content_type: str) -> None:
        path = self._abs(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(content)

    async def read(self, key: str) -> bytes:
        path = self._abs(key)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {key}")
        async with aiofiles.open(path, "rb") as f:
            return await f.read()

    async def delete(self, key: str) -> bool:
        try:
            path = self._abs(key)
        except ValueError:
            return False
        if not path.exists():
            return False
        path.unlink()
        return True

    def exists_sync(self, key: str) -> bool:
        try:
            return self._abs(key).exists()
        except ValueError:
            return False


# ─── MinIO / S3 backend ───────────────────────────────────────

class _MinioBackend:
    def __init__(self) -> None:
        from miniopy_async import Minio
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self._bucket = settings.minio_bucket

    async def _ensure_bucket(self) -> None:
        exists = await self._client.bucket_exists(self._bucket)
        if not exists:
            await self._client.make_bucket(self._bucket)
            logger.info("MinIO bucket created", bucket=self._bucket)

    async def save(self, key: str, content: bytes, content_type: str) -> None:
        await self._ensure_bucket()
        await self._client.put_object(
            self._bucket,
            key,
            io.BytesIO(content),
            length=len(content),
            content_type=content_type,
        )

    async def read(self, key: str) -> bytes:
        response = await self._client.get_object(self._bucket, key)
        return await response.read()

    async def delete(self, key: str) -> bool:
        try:
            await self._client.remove_object(self._bucket, key)
            return True
        except Exception:
            return False

    def exists_sync(self, key: str) -> bool:
        # Synchronous check — used only during startup/health probes.
        # For async paths use read() instead.
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(self._client.stat_object(self._bucket, key))
            return True
        except Exception:
            return False


# ─── FileService facade ───────────────────────────────────────

class FileService:
    """
    Unified file persistence interface.

    Switch between backends via STORAGE_BACKEND env var:
      STORAGE_BACKEND=local   → aiofiles on uploads Docker volume (default)
      STORAGE_BACKEND=s3      → MinIO / S3-compatible object store
    """

    def __init__(self) -> None:
        if settings.storage_backend == "s3":
            self._backend: StorageBackend = _MinioBackend()
            logger.info(
                "FileService using MinIO backend",
                endpoint=settings.minio_endpoint,
                bucket=settings.minio_bucket,
            )
        else:
            base = Path(settings.upload_dir).resolve()
            self._backend = _LocalBackend(base)
            logger.info("FileService using local filesystem backend", base=str(base))

    # ── Public interface ──────────────────────────────────────

    def ensure_directories(self) -> None:
        """No-op for MinIO; creates directories for local backend."""
        if isinstance(self._backend, _LocalBackend):
            (Path(settings.upload_dir) / "jds").mkdir(parents=True, exist_ok=True)
            (Path(settings.upload_dir) / "cms").mkdir(parents=True, exist_ok=True)
            (Path(settings.upload_dir) / "tmp").mkdir(parents=True, exist_ok=True)

    async def save_jd_file(
        self,
        content: bytes,
        original_filename: str,
        extension: str,
    ) -> str:
        """
        Persist a JD file and return its storage key (relative path / object key).

        The returned key is stored in job_descriptions.file_path and passed
        back to read_file() / delete_file() without modification.
        """
        file_id = str(uuid.uuid4())
        safe_ext = extension.lstrip(".").lower()
        key = f"jds/{file_id}.{safe_ext}"
        content_type = "application/pdf" if safe_ext == "pdf" else "application/octet-stream"

        await self._backend.save(key, content, content_type)

        logger.info(
            "JD file saved",
            file_id=file_id,
            original_filename=original_filename,
            size_bytes=len(content),
            key=key,
            backend=settings.storage_backend,
        )
        return key

    async def read_file(self, relative_path: str) -> bytes:
        """Read a file by its stored key / relative path."""
        return await self._backend.read(relative_path)

    async def write_file(
        self,
        relative_path: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Write bytes to an existing storage key, used by backup restore."""
        await self._backend.save(relative_path, content, content_type)

    async def delete_file(self, relative_path: str) -> bool:
        """
        Delete a stored file.  Returns True if deleted, False if not found.
        Never raises on missing files.
        """
        deleted = await self._backend.delete(relative_path)
        if deleted:
            logger.info("File deleted", path=relative_path, backend=settings.storage_backend)
        else:
            logger.debug("Delete called on non-existent file", path=relative_path)
        return deleted

    def resolve_path(self, relative_path: str) -> Path:
        """
        Return an absolute Path for local backend callers (parser_service).
        Raises RuntimeError for non-local backends — callers must use read_file().
        """
        if not isinstance(self._backend, _LocalBackend):
            # RuntimeError, not TypeError (ruff TRY004): this is a backend-
            # configuration error, not a caller passing the wrong argument
            # type — changing it would break any caller already catching
            # RuntimeError here without an audit of who does.
            raise RuntimeError(  # noqa: TRY004
                "resolve_path() is only available for the local storage backend. "
                "Use read_file() to load file content instead."
            )
        return self._backend._abs(relative_path)


# Module-level singleton — use this throughout the app
file_service = FileService()
