"""Alembic migration environment (async engine).

Overrides sqlalchemy.url from Settings.database_url so alembic.ini
can hold a placeholder value without secrets.
"""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import pool

from app.config import settings

# Import Base and ALL models to register them with Base.metadata
from app.db.base import Base
from app.models import (
    IOCModel,
    IOCSourceModel,
    IOCRelationshipModel,
    FeedRunModel,
    TagModel,
    NoteModel,
    WatchlistModel,
    ThreatActorModel,
    ThreatActorIOCLinkModel,
    CampaignModel,
    CampaignIOCModel,
)

# Alembic Config object, providing access to the .ini file
config = context.config

# Interpret the config file for Python logging if present.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The metadata object used for autogenerate support
target_metadata = Base.metadata

# Override the sqlalchemy.url with the value from pydantic Settings.
# This keeps credentials out of alembic.ini.
config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine.
    Calls to context.execute() emit SQL to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine (asyncpg driver)."""
    connectable = create_async_engine(
        settings.database_url,
        poolclass=pool.NullPool,
        connect_args={
            "statement_cache_size": 0,
            "server_settings": {"statement_timeout": "0"},
        },
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with async engine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
