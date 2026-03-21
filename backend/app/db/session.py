from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    # PgBouncer (Supabase Session Pooler) routes transactions across backend
    # connections, which breaks asyncpg's prepared-statement cache.
    # Disabling it prevents QueryCanceledError / statement-timeout failures.
    # statement_timeout=0 disables Supabase's default per-statement timeout so
    # bulk feed upserts are not cancelled mid-run.
    connect_args={
        "statement_cache_size": 0,
        "server_settings": {"statement_timeout": "0"},
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        yield session
