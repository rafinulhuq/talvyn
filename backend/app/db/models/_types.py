"""
Portable SQLAlchemy column types.

PostgreSQL uses native JSONB and UUID types.
SQLite (used in tests) falls back to JSON and String(36).

Import these instead of importing JSONB/UUID directly so models
work in both environments without any code changes.
"""

from typing import Any

from sqlalchemy import JSON, String, TypeDecorator


class GUID(TypeDecorator):
    """
    Platform-independent GUID/UUID type.
    - PostgreSQL: uses the native UUID column type
    - Other dialects (SQLite): uses CHAR(36) storing as hyphenated string
    """

    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        # Prisma creates ID columns as TEXT, not native UUID
        return dialect.type_descriptor(String())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return str(value)


class JSONType(TypeDecorator):
    """
    Platform-independent JSON type.
    - PostgreSQL: uses native JSONB for indexing and operators
    - Other dialects (SQLite): uses standard JSON
    """

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Any, dialect) -> Any:
        return value

    def process_result_value(self, value: Any, dialect) -> Any:
        return value


class VectorType(TypeDecorator):
    """
    Platform-independent embedding vector type.
    - PostgreSQL (with the pgvector extension): native `vector(dim)` column,
      enabling fast nearest-neighbour search via the <-> distance operator.
    - Other dialects (SQLite, used in tests): falls back to JSON-encoded
      list of floats — read/write works, similarity search does not (raw
      SQL using <-> is only ever issued against PostgreSQL in this codebase).
    """

    impl = JSON
    cache_ok = True

    def __init__(self, dim: int, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.dim = dim

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector
            return dialect.type_descriptor(Vector(self.dim))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Any, dialect) -> Any:
        return value

    def process_result_value(self, value: Any, dialect) -> Any:
        return value
