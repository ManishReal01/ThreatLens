import uuid

import sqlalchemy as sa
from sqlalchemy import UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.db.base import Base


class TagModel(Base):
    """Analyst-applied tags on IOCs.

    user_id is UUID NOT NULL from Phase 1 — required to prevent IDOR
    vulnerabilities when auth is wired in Phase 4.
    """

    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("ioc_id", "user_id", "tag", name="uq_tag_per_user_ioc"),
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
    user_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True), nullable=False
    )
    tag: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    created_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )

    # Relationship
    ioc: sa.orm.Mapped["IOCModel"] = relationship(  # noqa: F821
        "IOCModel", back_populates="tags"
    )


class NoteModel(Base):
    """Analyst freeform notes on IOCs.

    user_id is UUID NOT NULL from Phase 1 — ownership enforced at schema level.
    """

    __tablename__ = "notes"

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
    user_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True), nullable=False
    )
    body: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    created_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )
    updated_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )

    # Relationship
    ioc: sa.orm.Mapped["IOCModel"] = relationship(  # noqa: F821
        "IOCModel", back_populates="notes"
    )


class WatchlistModel(Base):
    """Analyst personal watchlist entries.

    user_id is UUID NOT NULL from Phase 1 — ownership enforced at schema level.
    uq_watchlist_user_ioc ensures each analyst watches each IOC at most once.
    """

    __tablename__ = "watchlists"
    __table_args__ = (
        UniqueConstraint("user_id", "ioc_id", name="uq_watchlist_user_ioc"),
    )

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True), nullable=False
    )
    ioc_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("iocs.id", ondelete="CASCADE"),
        nullable=False,
    )
    added_at: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )

    # Relationship
    ioc: sa.orm.Mapped["IOCModel"] = relationship(  # noqa: F821
        "IOCModel", back_populates="watchlists"
    )
