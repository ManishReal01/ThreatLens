"""Add campaigns and campaign_iocs tables for correlation engine.

Revision ID: 005_campaigns
Revises: 004_geoip_columns
Create Date: 2026-03-27
"""
from typing import Sequence, Union

from alembic import op

revision: str = "005_campaigns"
down_revision: Union[str, None] = "004_geoip_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Disable statement timeout for this session — Supabase pooler applies
    # a default timeout that kills multi-statement DDL migrations.
    op.execute("SET statement_timeout = 0")
    op.execute("SET lock_timeout = 0")

    op.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT NOT NULL,
            description TEXT,
            confidence  NUMERIC(4, 2),
            ioc_count   INTEGER NOT NULL DEFAULT 0,
            status      VARCHAR(32) NOT NULL DEFAULT 'active',
            primary_signal VARCHAR(64),
            techniques  JSON,
            threat_actor_ids JSON,
            first_seen  TIMESTAMPTZ,
            last_seen   TIMESTAMPTZ,
            metadata_   JSON,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute(
        "CREATE INDEX IF NOT EXISTS campaigns_status_idx "
        "ON campaigns (status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS campaigns_confidence_idx "
        "ON campaigns (confidence DESC NULLS LAST)"
    )

    op.execute("""
        CREATE TABLE IF NOT EXISTS campaign_iocs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID NOT NULL
                        REFERENCES campaigns (id) ON DELETE CASCADE,
            ioc_id      UUID NOT NULL
                        REFERENCES iocs (id) ON DELETE CASCADE,
            signal_types JSON,
            confidence  NUMERIC(4, 2),
            added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT  uq_campaign_ioc UNIQUE (campaign_id, ioc_id)
        )
    """)

    op.execute(
        "CREATE INDEX IF NOT EXISTS campaign_iocs_campaign_idx "
        "ON campaign_iocs (campaign_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS campaign_iocs_ioc_idx "
        "ON campaign_iocs (ioc_id)"
    )


def downgrade() -> None:
    op.execute("SET statement_timeout = 0")
    op.execute("DROP INDEX IF EXISTS campaign_iocs_ioc_idx")
    op.execute("DROP INDEX IF EXISTS campaign_iocs_campaign_idx")
    op.execute("DROP TABLE IF EXISTS campaign_iocs")
    op.execute("DROP INDEX IF EXISTS campaigns_confidence_idx")
    op.execute("DROP INDEX IF EXISTS campaigns_status_idx")
    op.execute("DROP TABLE IF EXISTS campaigns")
