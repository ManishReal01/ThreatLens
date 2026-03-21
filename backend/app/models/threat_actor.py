"""Threat actor models for MITRE ATT&CK group intelligence."""

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


class ThreatActorModel(Base):
    """One row per MITRE ATT&CK intrusion-set (threat actor group)."""

    __tablename__ = "threat_actors"

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    mitre_id: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False, unique=True)
    name: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False)
    aliases: sa.orm.Mapped[list] = sa.orm.mapped_column(sa.JSON, nullable=False, default=list)
    description: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(sa.Text, nullable=True)
    country: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(sa.Text, nullable=True)
    motivations: sa.orm.Mapped[list] = sa.orm.mapped_column(sa.JSON, nullable=False, default=list)
    first_seen: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(sa.Text, nullable=True)
    last_seen: sa.orm.Mapped[Optional[str]] = sa.orm.mapped_column(sa.Text, nullable=True)
    # [{id: "T1059", name: "Command and Scripting Interpreter"}, ...]
    techniques: sa.orm.Mapped[list] = sa.orm.mapped_column(sa.JSON, nullable=False, default=list)
    # [{id: "S0002", name: "Mimikatz"}, ...]
    software: sa.orm.Mapped[list] = sa.orm.mapped_column(sa.JSON, nullable=False, default=list)
    associated_malware: sa.orm.Mapped[list] = sa.orm.mapped_column(sa.JSON, nullable=False, default=list)
    metadata_: sa.orm.Mapped[Optional[dict]] = sa.orm.mapped_column(
        "metadata", sa.JSON, nullable=True
    )
    created_at: sa.orm.Mapped[datetime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False,
        default=_utcnow, server_default=text("NOW()")
    )
    updated_at: sa.orm.Mapped[datetime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False,
        default=_utcnow, server_default=text("NOW()")
    )

    ioc_links: sa.orm.Mapped[list] = relationship(
        "ThreatActorIOCLinkModel", back_populates="threat_actor", cascade="all, delete-orphan"
    )


class ThreatActorIOCLinkModel(Base):
    """Junction table linking threat actors to IOCs."""

    __tablename__ = "threat_actor_ioc_links"
    __table_args__ = (
        UniqueConstraint("threat_actor_id", "ioc_id", name="uq_ta_ioc_links"),
    )

    id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    threat_actor_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("threat_actors.id", ondelete="CASCADE"),
        nullable=False,
    )
    ioc_id: sa.orm.Mapped[uuid.UUID] = sa.orm.mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("iocs.id", ondelete="CASCADE"),
        nullable=False,
    )
    confidence: sa.orm.Mapped[Optional[float]] = sa.orm.mapped_column(sa.Numeric(4, 2), nullable=True)
    source: sa.orm.Mapped[str] = sa.orm.mapped_column(sa.Text, nullable=False, default="auto")
    created_at: sa.orm.Mapped[datetime] = sa.orm.mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=False,
        default=_utcnow, server_default=text("NOW()")
    )

    threat_actor: sa.orm.Mapped[ThreatActorModel] = relationship(
        "ThreatActorModel", back_populates="ioc_links"
    )
    ioc = relationship("IOCModel")
