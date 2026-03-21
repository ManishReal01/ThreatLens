"""Add threat_actors and threat_actor_ioc_links tables.

Revision ID: 003_threat_actors
Revises: 002_ioc_sources_unique_feed
Create Date: 2026-03-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_threat_actors"
down_revision: Union[str, None] = "002_ioc_sources_unique_feed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "threat_actors",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("mitre_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("aliases", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("country", sa.Text(), nullable=True),
        sa.Column("motivations", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("first_seen", sa.Text(), nullable=True),
        sa.Column("last_seen", sa.Text(), nullable=True),
        sa.Column("techniques", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("software", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("associated_malware", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mitre_id", name="uq_threat_actors_mitre_id"),
    )
    op.create_index("ix_threat_actors_name", "threat_actors", ["name"])

    op.create_table(
        "threat_actor_ioc_links",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("threat_actor_id", sa.UUID(), nullable=False),
        sa.Column("ioc_id", sa.UUID(), nullable=False),
        sa.Column("confidence", sa.Numeric(4, 2), nullable=True),
        sa.Column("source", sa.Text(), nullable=False, server_default="auto"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(["threat_actor_id"], ["threat_actors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ioc_id"], ["iocs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("threat_actor_id", "ioc_id", name="uq_ta_ioc_links"),
    )
    op.create_index("ix_ta_ioc_links_threat_actor_id", "threat_actor_ioc_links", ["threat_actor_id"])
    op.create_index("ix_ta_ioc_links_ioc_id", "threat_actor_ioc_links", ["ioc_id"])


def downgrade() -> None:
    op.drop_table("threat_actor_ioc_links")
    op.drop_table("threat_actors")
