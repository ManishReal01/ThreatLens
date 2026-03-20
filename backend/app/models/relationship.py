import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import UniqueConstraint, text

from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class IOCRelationshipModel(Base):
    """IOC relationships adjacency table.

    Both FKs (source_ioc, target_ioc) have B-tree indexes for bidirectional
    graph traversal. Recursive CTE queries look up both directions.
    """

    __tablename__ = "ioc_relationships"
    __table_args__ = (
        UniqueConstraint(
            "source_ioc", "target_ioc", "relationship", name="uq_ioc_relationship"
        ),
    )

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    source_ioc: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("iocs.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_ioc: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("iocs.id", ondelete="CASCADE"),
        nullable=False,
    )
    relationship: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    confidence: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(
        sa.Numeric(4, 2), nullable=True
    )
    inferred_by: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(
        sa.Text, nullable=True
    )
    created_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False,
        default=_utcnow, server_default=text("NOW()")
    )
