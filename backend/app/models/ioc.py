import uuid
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base import Base


class IOCModel(Base):
    """Canonical IOC table — one row per unique (value, type) pair.

    The (value, type) unique constraint enforces dedup at the DB layer.
    IOC type uses distinct values per hash algorithm (hash_md5, hash_sha1,
    hash_sha256) so UNIQUE(value, type) correctly distinguishes them.
    """

    __tablename__ = "iocs"
    __table_args__ = (
        UniqueConstraint("value", "type", name="uq_iocs_value_type"),
    )

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    value: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    # IOCType enum string values: ip, domain, hash_md5, hash_sha1, hash_sha256, url
    type: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    severity: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(
        sa.Numeric(4, 2), nullable=True
    )
    # Increment score_version when formula weights change to enable targeted recalc
    score_version: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, nullable=False, server_default="1"
    )
    score_explanation: sa.orm.Mapped[Optional[dict]] = sa.orm.mapped_column(
        JSONB, nullable=True
    )
    first_seen: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )
    last_seen: sa.orm.Mapped[sa.DateTime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False, server_default=text("NOW()")
    )
    source_count: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, nullable=False, server_default="1"
    )
    is_active: sa.orm.Mapped[bool] = sa.orm.mapped_column(
        sa.Boolean, nullable=False, server_default="true"
    )
    retired_at: sa.orm.Mapped[Optional[sa.DateTime]] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    # Python attribute name is metadata_ to avoid conflict with SQLAlchemy's
    # reserved `metadata` attribute; maps to column name "metadata" in DB
    metadata_: sa.orm.Mapped[Optional[dict]] = sa.orm.mapped_column(
        "metadata", JSONB, nullable=True
    )

    # Relationships
    sources: sa.orm.Mapped[list] = relationship(
        "IOCSourceModel", back_populates="ioc", cascade="all, delete-orphan"
    )
    tags: sa.orm.Mapped[list] = relationship(
        "TagModel", back_populates="ioc", cascade="all, delete-orphan"
    )
    notes: sa.orm.Mapped[list] = relationship(
        "NoteModel", back_populates="ioc", cascade="all, delete-orphan"
    )
    watchlists: sa.orm.Mapped[list] = relationship(
        "WatchlistModel", back_populates="ioc", cascade="all, delete-orphan"
    )
