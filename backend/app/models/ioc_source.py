import uuid
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base import Base


class IOCSourceModel(Base):
    """Feed observation log — one row per feed observation of an IOC.

    Multiple feed observations can reference the same canonical IOC row
    (via ioc_id). This table preserves the raw feed data for audit purposes.
    """

    __tablename__ = "ioc_sources"

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
    feed_name: sa.orm.Mapped[str] = sa.orm.mapped_column(
        sa.Text, nullable=False
    )  # 'abuseipdb' | 'urlhaus' | 'otx'
    raw_score: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(
        sa.Numeric, nullable=True
    )  # feed's raw confidence value before normalization
    raw_payload: sa.orm.Mapped[Optional[dict]] = sa.orm.mapped_column(
        JSONB, nullable=True
    )  # original feed record archived for audit
    ingested_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )
    feed_run_id: sa.orm.Mapped[Optional[uuid.UUID]] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("feed_runs.id"),
        nullable=True,
    )

    # Relationships
    ioc: sa.orm.Mapped["IOCModel"] = relationship(  # noqa: F821
        "IOCModel", back_populates="sources"
    )
