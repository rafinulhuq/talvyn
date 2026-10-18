"""
Custom exceptions and FastAPI exception handlers.
Register handlers via register_exception_handlers(app).
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─── Base ─────────────────────────────────────────────────────

class AppException(Exception):
    """Base exception for all application errors."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: str = "INTERNAL_ERROR",
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(message)


# ─── 400-level ────────────────────────────────────────────────

class ValidationError(AppException):
    def __init__(self, message: str, error_code: str = "VALIDATION_ERROR") -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY, error_code)


class NotFoundError(AppException):
    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(
            f"{resource} with id '{identifier}' not found",
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
        )


class UnauthorizedError(AppException):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(message, status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED")


class ForbiddenError(AppException):
    def __init__(self, message: str = "Access denied") -> None:
        super().__init__(message, status.HTTP_403_FORBIDDEN, "FORBIDDEN")


class ConflictError(AppException):
    def __init__(self, message: str, error_code: str = "CONFLICT") -> None:
        super().__init__(message, status.HTTP_409_CONFLICT, error_code)


class RateLimitExceededError(AppException):
    def __init__(self, message: str, error_code: str = "RATE_LIMIT_EXCEEDED") -> None:
        super().__init__(message, status.HTTP_429_TOO_MANY_REQUESTS, error_code)


class FileTooLargeError(AppException):
    def __init__(self, max_mb: int) -> None:
        super().__init__(
            f"File exceeds maximum allowed size of {max_mb}MB",
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "FILE_TOO_LARGE",
        )


class InvalidFileTypeError(AppException):
    def __init__(self, allowed: list[str]) -> None:
        super().__init__(
            f"Invalid file type. Allowed types: {', '.join(allowed)}",
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "INVALID_FILE_TYPE",
        )


# ─── 500-level ────────────────────────────────────────────────

class AIServiceError(AppException):
    def __init__(self, message: str = "AI service is unavailable") -> None:
        super().__init__(message, status.HTTP_503_SERVICE_UNAVAILABLE, "AI_SERVICE_ERROR")


class AIResponseParseError(AppException):
    def __init__(self, message: str = "Failed to parse AI response after retries") -> None:
        super().__init__(message, status.HTTP_502_BAD_GATEWAY, "AI_PARSE_ERROR")


class DatabaseError(AppException):
    def __init__(self, message: str = "Database operation failed") -> None:
        super().__init__(message, status.HTTP_500_INTERNAL_SERVER_ERROR, "DATABASE_ERROR")


# ─── Handlers ─────────────────────────────────────────────────

def _error_response(
    status_code: int,
    error_code: str,
    message: str,
    details: dict | None = None,
) -> JSONResponse:
    body: dict = {
        "success": False,
        "error": {
            "code": error_code,
            "message": message,
        },
    }
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        logger.warning(
            "Application error",
            error_code=exc.error_code,
            message=exc.message,
            path=str(request.url),
            status_code=exc.status_code,
        )
        return _error_response(exc.status_code, exc.error_code, exc.message)

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        return _error_response(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            f"Route {request.url.path} not found",
        )

    @app.exception_handler(405)
    async def method_not_allowed_handler(request: Request, exc: Exception) -> JSONResponse:
        return _error_response(
            status.HTTP_405_METHOD_NOT_ALLOWED,
            "METHOD_NOT_ALLOWED",
            f"Method {request.method} not allowed on {request.url.path}",
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled exception",
            path=str(request.url),
            method=request.method,
        )
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "An unexpected error occurred. Please try again later.",
        )
