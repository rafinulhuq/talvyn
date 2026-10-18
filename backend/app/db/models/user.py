"""
SQLAlchemy ORM model for the users table.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models._types import GUID
from app.db.models.enums import Role


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        GUID(), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_reset_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="Role", create_type=False),
        nullable=False,
        default=Role.ADMIN,
        server_default=Role.ADMIN.value,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    company_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    phone_number: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r}>"
