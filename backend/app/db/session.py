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
    # Supabase session pooler free tier allows ~15 total connections.
    # Keep the SQLAlchemy pool small so feeds + API requests share
    # the budget without hitting MaxClientsInSessionMode.
    pool_size=3,
    max_overflow=2,       # max 5 total connections under load
    pool_timeout=30,      # raise TimeoutError instead of hanging forever
    pool_recycle=1800,    # recycle connections after 30 min to drop stale ones
    pool_pre_ping=True,   # discard dead connections before use
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
