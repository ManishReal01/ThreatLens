"""Pytest fixtures for async database testing using SQLite.

All tests run against an in-memory SQLite database — no Supabase connection
required for unit tests. Integration tests against real PostgreSQL are
validated manually (see 01-01-PLAN.md VALIDATION section).

NOTE ON SQLITE LIMITATIONS:
  - SQLite does not support TSVECTOR generated columns or pg_trgm indexes.
  - Base.metadata.create_all() uses ORM metadata (which does NOT include
    the generated column or PG-specific indexes from the Alembic migration).
  - This is correct for testing Python ORM logic. The Alembic migration
    is the source of truth for the actual PostgreSQL schema.
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Import all models so Base.metadata.create_all() can register every table
from app.db.base import Base
from app.models import (
    FeedRunModel,
    IOCModel,
    IOCRelationshipModel,
    IOCSourceModel,
    NoteModel,
    TagModel,
    WatchlistModel,
)

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

# Explicitly re-export to silence "unused import" warnings;
# the models must be imported here to register with Base.metadata
__all__ = [
    "IOCModel",
    "IOCSourceModel",
    "IOCRelationshipModel",
    "FeedRunModel",
    "TagModel",
    "NoteModel",
    "WatchlistModel",
]


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="function")
async def async_engine():
    """Create a fresh SQLite engine + schema for each test function."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="function")
async def async_session(async_engine):
    """Yield an AsyncSession; roll back after each test to keep tests isolated."""
    session_factory = async_sessionmaker(
        bind=async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
        await session.rollback()
