"""Initial schema: all ThreatLens tables, indexes, constraints, and extensions.

Creates all 8 tables:
  1. feed_runs       — feed execution log (no FKs, created first)
  2. iocs            — canonical IOC table with UNIQUE(value, type)
  3. ioc_sources     — per-observation feed log (FK → iocs, feed_runs)
  4. ioc_relationships — adjacency table (FK → iocs ×2)
  5. tags            — analyst tags (FK → iocs, user_id NOT NULL)
  6. notes           — analyst notes (FK → iocs, user_id NOT NULL)
  7. watchlists      — analyst watchlist (FK → iocs, user_id NOT NULL)

Extensions:
  - pg_trgm  : trigram indexes for partial IOC value search (SRCH-01)
  - pgcrypto : gen_random_uuid() used as UUID server_default

Revision ID: 001_initial_schema
Revises: None (initial migration)
Create Date: 2026-03-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # STEP 1: Enable PostgreSQL extensions
    # pg_trgm must exist before any GIN index using gin_trgm_ops is created.
    # IF NOT EXISTS makes these idempotent on Supabase (may be pre-enabled).
    # ------------------------------------------------------------------
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    # ------------------------------------------------------------------
    # STEP 2: feed_runs — created FIRST because ioc_sources has a FK to it
    # ------------------------------------------------------------------
    op.create_table(
        "feed_runs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("feed_name", sa.Text(), nullable=False),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="running",
        ),  # 'running' | 'success' | 'error'
        sa.Column("iocs_fetched", sa.Integer(), server_default="0"),
        sa.Column("iocs_new", sa.Integer(), server_default="0"),
        sa.Column("iocs_updated", sa.Integer(), server_default="0"),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("last_successful_sync", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consecutive_failure_count", sa.Integer(), server_default="0"),
    )
    op.create_index("feed_runs_feed_name_idx", "feed_runs", ["feed_name"])
    op.create_index(
        "feed_runs_started_at_idx",
        "feed_runs",
        [sa.text("started_at DESC")],
    )

    # ------------------------------------------------------------------
    # STEP 3: iocs — canonical table + generated tsvector column
    # The ts_vector generated column cannot be expressed in op.create_table()
    # because Alembic's column helpers don't support GENERATED ALWAYS AS.
    # We create the base table first, then ALTER to add the generated column,
    # then create all indexes.
    # ------------------------------------------------------------------
    op.create_table(
        "iocs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("severity", sa.Numeric(4, 2), nullable=True),
        sa.Column(
            "score_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column("score_explanation", postgresql.JSONB(), nullable=True),
        sa.Column(
            "first_seen",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "last_seen",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "source_count",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column("retired_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("value", "type", name="uq_iocs_value_type"),
    )

    # Generated column: tsvector for full-text search.
    # GENERATED ALWAYS AS requires PostgreSQL 12+ (Supabase uses PG 15).
    # This is raw SQL because Alembic's op helpers don't support generated columns.
    op.execute(
        """
        ALTER TABLE iocs
        ADD COLUMN ts_vector TSVECTOR
            GENERATED ALWAYS AS (
                to_tsvector('english', value || ' ' || COALESCE(metadata::text, ''))
            ) STORED;
        """
    )

    # Indexes on iocs
    op.create_index(
        "iocs_ts_vector_idx",
        "iocs",
        [sa.text("ts_vector")],
        postgresql_using="gin",
    )
    op.create_index(
        "iocs_value_trgm_idx",
        "iocs",
        [sa.text("value gin_trgm_ops")],
        postgresql_using="gin",
    )
    op.create_index("iocs_type_idx", "iocs", ["type"])
    op.create_index(
        "iocs_severity_idx",
        "iocs",
        [sa.text("severity DESC")],
    )
    op.create_index(
        "iocs_last_seen_idx",
        "iocs",
        [sa.text("last_seen DESC")],
    )
    op.create_index(
        "iocs_type_severity",
        "iocs",
        ["type", sa.text("severity DESC")],
    )
    op.create_index(
        "iocs_type_last_seen",
        "iocs",
        ["type", sa.text("last_seen DESC")],
    )
    # Partial index — WHERE clause requires raw SQL
    op.execute(
        "CREATE INDEX iocs_active_idx ON iocs (is_active) WHERE is_active = TRUE;"
    )

    # ------------------------------------------------------------------
    # STEP 4: ioc_sources — observation log (FK → iocs, FK → feed_runs)
    # ------------------------------------------------------------------
    op.create_table(
        "ioc_sources",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "ioc_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("iocs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("feed_name", sa.Text(), nullable=False),
        sa.Column("raw_score", sa.Numeric(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "ingested_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "feed_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("feed_runs.id"),
            nullable=True,
        ),
    )
    op.create_index("ioc_sources_ioc_id_idx", "ioc_sources", ["ioc_id"])
    op.create_index("ioc_sources_feed_name_idx", "ioc_sources", ["feed_name"])
    op.create_index(
        "ioc_sources_ingested_at_idx",
        "ioc_sources",
        [sa.text("ingested_at DESC")],
    )

    # ------------------------------------------------------------------
    # STEP 5: ioc_relationships — adjacency table with BIDIRECTIONAL indexes
    # Both ioc_rel_source_idx and ioc_rel_target_idx are required for
    # recursive CTE graph traversal that follows edges in both directions.
    # ------------------------------------------------------------------
    op.create_table(
        "ioc_relationships",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "source_ioc",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("iocs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_ioc",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("iocs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "relationship",
            sa.Text(),
            nullable=False,
        ),  # 'observed_with' | 'resolves_to' | 'serves' | 'analyst_linked'
        sa.Column("confidence", sa.Numeric(4, 2), nullable=True),
        sa.Column("inferred_by", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint(
            "source_ioc", "target_ioc", "relationship", name="uq_ioc_relationship"
        ),
    )
    # Both FK directions required — do NOT remove ioc_rel_target_idx
    op.create_index("ioc_rel_source_idx", "ioc_relationships", ["source_ioc"])
    op.create_index("ioc_rel_target_idx", "ioc_relationships", ["target_ioc"])

    # ------------------------------------------------------------------
    # STEP 6: Analyst workspace tables — tags, notes, watchlists
    # All have user_id UUID NOT NULL from Phase 1 to prevent IDOR.
    # Auth is Phase 4; the column must exist before data is ever written.
    # ------------------------------------------------------------------

    # tags
    op.create_table(
        "tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "ioc_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("iocs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("ioc_id", "user_id", "tag", name="uq_tag_per_user_ioc"),
    )
    op.create_index("tags_ioc_id_idx", "tags", ["ioc_id"])
    op.create_index("tags_user_id_idx", "tags", ["user_id"])

    # notes
    op.create_table(
        "notes",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "ioc_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("iocs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("notes_ioc_id_idx", "notes", ["ioc_id"])
    op.create_index("notes_user_id_idx", "notes", ["user_id"])

    # watchlists
    op.create_table(
        "watchlists",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "ioc_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("iocs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "added_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint("user_id", "ioc_id", name="uq_watchlist_user_ioc"),
    )
    op.create_index("watchlists_user_id_idx", "watchlists", ["user_id"])
    op.create_index("watchlists_ioc_id_idx", "watchlists", ["ioc_id"])


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table("watchlists")
    op.drop_table("notes")
    op.drop_table("tags")
    op.drop_table("ioc_relationships")
    op.drop_table("ioc_sources")
    op.drop_table("iocs")
    op.drop_table("feed_runs")

    # Drop extensions last
    op.execute("DROP EXTENSION IF EXISTS pgcrypto;")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm;")
