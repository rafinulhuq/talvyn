"""
SQLAlchemy async engine and declarative base.
All ORM models should inherit from Base.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """
    Declarative base for all ORM models.
    Provides type-annotated column support via Mapped / mapped_column.
    """


def create_engine() -> AsyncEngine:
    """
    Create the async SQLAlchemy engine from settings.

    Pool options (pool_size, max_overflow) are only set for real
    PostgreSQL connections — SQLite (used in tests) uses StaticPool
    and does not support these arguments.
    """
    settings = get_settings()
    url = settings.database_url

    is_sqlite = url.startswith("sqlite")

    kwargs: dict = {
        "echo": settings.debug,
    }

    if not is_sqlite:
        kwargs.update(
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=3600,
        )

    return create_async_engine(url, **kwargs)


# Module-level engine instance
engine = create_engine()
