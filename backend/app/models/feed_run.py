import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import text

from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class FeedRunModel(Base):
    """Feed run execution log.

    Status values: 'running' | 'success' | 'error'
    """

    __tablename__ = "feed_runs"

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    feed_name: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    started_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False,
        default=_utcnow, server_default=text("NOW()")
    )
    completed_at: sa.orm.Mapped[Optional[sa.DateTime]] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    status: sa.orm.Mapped[str] = sa.orm.mapped_column(
        sa.Text, nullable=False, default="running", server_default="running"
    )
    iocs_fetched: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, default=0
    )
    iocs_new: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, default=0
    )
    iocs_updated: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, default=0
    )
    error_msg: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(
        sa.Text, nullable=True
    )
    last_successful_sync: sa.orm.Mapped[Optional[sa.DateTime]] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    consecutive_failure_count: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, default=0
    )
