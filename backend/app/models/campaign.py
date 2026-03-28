"""Campaign models for the correlation engine."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import UniqueConstraint, text
from sqlalchemy.orm import relationship

from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class CampaignModel(Base):
    """One row per detected IOC cluster (campaign)."""

    __tablename__ = "campaigns"

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    name: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    description: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(sa.Text, nullable=True)
    confidence: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(
        sa.Numeric(4, 2), nullable=True
    )
    ioc_count: sa.orm.Mapped[int] = sa.orm.mapped_column(
        sa.Integer, nullable=False, default=0, server_default="0"
    )
    status: sa.orm.Mapped[str] = sa.orm.mapped_column(
        sa.VARCHAR(32), nullable=False, default="active", server_default="active"
    )
    primary_signal: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(
        sa.VARCHAR(64), nullable=True
    )
    techniques: sa.orm.Mapped[Optional[list]] = sa.orm.mapped_column(
        sa.JSON, nullable=True, default=list
    )
    threat_actor_ids: sa.orm.Mapped[Optional[list]] = sa.orm.mapped_column(
        sa.JSON, nullable=True, default=list
    )
    first_seen: sa.orm.Mapped[Optional[datetime]] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    last_seen: sa.orm.Mapped[Optional[datetime]] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    metadata_: sa.orm.Mapped[Optional[dict]] = sa.orm.mapped_column(
        "metadata_", sa.JSON, nullable=True
    )
    created_at: sa.orm.Mapped[datetime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=text("NOW()"),
    )
    updated_at: sa.orm.Mapped[datetime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=text("NOW()"),
    )

    ioc_links: sa.orm.Mapped[list] = relationship(
        "CampaignIOCModel", back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignIOCModel(Base):
    """Junction table: which IOCs belong to which campaign."""

    __tablename__ = "campaign_iocs"
    __table_args__ = (
        UniqueConstraint("campaign_id", "ioc_id", name="uq_campaign_ioc"),
    )

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    campaign_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    ioc_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("iocs.id", ondelete="CASCADE"),
        nullable=False,
    )
    signal_types: sa.orm.Mapped[Optional[list]] = sa.orm.mapped_column(
        sa.JSON, nullable=True, default=list
    )
    confidence: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(
        sa.Numeric(4, 2), nullable=True
    )
    added_at: sa.orm.Mapped[datetime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=text("NOW()"),
    )

    campaign: sa.orm.Mapped[CampaignModel] = relationship(
        "CampaignModel", back_populates="ioc_links"
    )
    ioc = relationship("IOCModel")
