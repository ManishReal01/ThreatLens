import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.orm import relationship

from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class IOCSourceModel(Base):
    """Feed observation log — one row per feed per IOC (latest observation)."""

    __tablename__ = "ioc_sources"
    __table_args__ = (
        sa.UniqueConstraint("ioc_id", "feed_name", name="uq_ioc_sources_ioc_feed"),
    )

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    ioc_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("iocs.id", ondelete="CASCADE"),
        nullable=False,
    )
    feed_name: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    raw_score: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(
        sa.Numeric, nullable=True
    )
    raw_payload: sa.orm.Mapped[Optional[dict]] = sa.orm.mapped_column(
        sa.JSON, nullable=True
    )
    ingested_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False,
        default=_utcnow, server_default=text("NOW()")
    )
    feed_run_id: sa.orm.Mapped[Optional[uuid.UUID]] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("feed_runs.id"),
        nullable=True,
    )

    ioc: sa.orm.Mapped["IOCModel"] = relationship(  # noqa: F821
        "IOCModel", back_populates="sources"
    )
