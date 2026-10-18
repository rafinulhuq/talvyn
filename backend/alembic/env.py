"""
Alembic migration environment — async edition.

Uses SQLAlchemy's asyncio bridge so we can reuse the same asyncpg engine
as the FastAPI application without needing a separate psycopg2 install.

How autogenerate works:
  1. All ORM model modules are imported (they register on Base.metadata).
  2. Alembic compares Base.metadata against the live database schema.
  3. It emits CREATE TABLE / ADD COLUMN / CREATE INDEX statements for
     anything present in the models but not in the database.

Common commands:
  alembic upgrade head                            # apply all pending migrations
  alembic revision --autogenerate -m "add X"     # generate from model diff
  alembic downgrade -1                            # roll back one migration
  alembic history                                 # list all migrations
"""

import asyncio
import os
import re
from logging.config import fileConfig

from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context

# Arbitrary fixed 64-bit key for pg_advisory_lock — any constant works, it
# only needs to be unique to "this app's migration runner" so it doesn't
# collide with locks taken by unrelated code. Session-level (not xact-level)
# so it's held across the whole migration run, not just one transaction.
_MIGRATION_LOCK_ID = 781_234_001

# ── Alembic config ────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Import all models so autogenerate sees the full schema ────────────────────
# This must happen before we reference Base.metadata below.
import app.db.models  # noqa: F401 — side-effect import registers all ORM models
from app.db.base import Base

target_metadata = Base.metadata

# ── Database URL ──────────────────────────────────────────────────────────────
# Read from the environment (injected by Docker / .env file).
# Never commit credentials to alembic.ini — keep the placeholder there.
def _get_url() -> str:
    return (
        os.environ.get("DATABASE_URL")
        or config.get_main_option("sqlalchemy.url", "")
    )


# ── Offline mode (emit SQL without a live DB connection) ──────────────────────

def run_migrations_offline() -> None:
    """
    Offline mode: write migration SQL to stdout instead of executing it.
    Useful for reviewing what a migration will do before applying it.
    asyncpg is an async driver and can't be used offline, so we strip the
    driver suffix to let Alembic use its generic PostgreSQL dialect renderer.
    """
    url = re.sub(r"\+asyncpg", "", _get_url())
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode (apply migrations against live DB) ───────────────────────────

def do_run_migrations(connection: Connection) -> None:
    # Session-level advisory lock: if two backend containers (or a scaled-out
    # deployment) run `alembic upgrade head` at the same time, the second one
    # blocks here instead of racing the first one's DDL. Without this, two
    # concurrent "CREATE TABLE"/"ALTER TABLE" statements against the same
    # not-yet-migrated schema can both believe they're first and fail or
    # double-apply. Today's single-container prestart.sh doesn't hit this,
    # but the lock is what the existing comments in prestart.sh/Dockerfile
    # already (incorrectly) claimed was happening.
    connection.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": _MIGRATION_LOCK_ID})
    try:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()
    finally:
        connection.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": _MIGRATION_LOCK_ID})


async def run_async_migrations() -> None:
    """Create an async engine and apply migrations via the asyncio bridge."""
    engine = create_async_engine(
        _get_url(),
        poolclass=pool.NullPool,  # no persistent pool; migrations are one-shot
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
        # do_run_migrations() commits via the sync-proxy Connection alembic's
        # context.begin_transaction() opens internally — that commit doesn't
        # propagate to the DBAPI transaction the *async* connection itself is
        # tracking. Without this, AsyncConnection.close() below issues an
        # implicit ROLLBACK and every DDL statement silently vanishes: `alembic
        # upgrade head` logs "Running upgrade ..." for each revision and exits
        # 0, but a fresh database is left with zero tables and no
        # alembic_version row, as if nothing had ever run.
        await connection.commit()
    await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


# ── Entry point ───────────────────────────────────────────────────────────────

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
