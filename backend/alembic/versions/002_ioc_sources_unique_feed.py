"""Add unique constraint on ioc_sources(ioc_id, feed_name) and deduplicate.

Keeps the most recent row per (ioc_id, feed_name) and adds a unique constraint
so each feed can only have one observation record per IOC going forward.

Revision ID: 002_ioc_sources_unique_feed
Revises: 001_initial_schema
Create Date: 2026-03-21
"""
from typing import Sequence, Union

from alembic import op

revision: str = "002_ioc_sources_unique_feed"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Delete duplicate rows, keeping only the most recently ingested one per (ioc_id, feed_name)
    op.execute("""
        DELETE FROM ioc_sources
        WHERE id NOT IN (
            SELECT DISTINCT ON (ioc_id, feed_name) id
            FROM ioc_sources
            ORDER BY ioc_id, feed_name, ingested_at DESC
        )
    """)

    # Add the unique constraint
    op.create_unique_constraint(
        "uq_ioc_sources_ioc_feed",
        "ioc_sources",
        ["ioc_id", "feed_name"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_ioc_sources_ioc_feed", "ioc_sources", type_="unique")
