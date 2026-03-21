"""Threat actor endpoints — MITRE ATT&CK group intelligence."""

from __future__ import annotations

import math
import uuid
from typing import Annotated, Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.api.schemas import (
    IOCListItem,
    PaginatedIOCResponse,
    PaginatedThreatActorResponse,
    ThreatActorDetail,
    ThreatActorLinkItem,
    ThreatActorListItem,
)
from app.db.session import get_db
from app.models import IOCModel, ThreatActorIOCLinkModel, ThreatActorModel

router = APIRouter(prefix="/api/threat-actors", tags=["threat-actors"])
ioc_ta_router = APIRouter(prefix="/api/iocs", tags=["threat-actors"])

_MAX_PAGE_SIZE = 100


# ---------------------------------------------------------------------------
# GET /api/threat-actors — paginated list with search
# ---------------------------------------------------------------------------


@router.get("", response_model=PaginatedThreatActorResponse)
async def list_threat_actors(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search by name or alias"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=_MAX_PAGE_SIZE),
) -> PaginatedThreatActorResponse:
    """List all threat actor groups with IOC link counts."""
    base_where: list[sa.ColumnElement] = []

    if q:
        # Search name or any alias in the JSON array
        base_where.append(
            sa.or_(
                ThreatActorModel.name.ilike(f"%{q}%"),
                sa.cast(ThreatActorModel.aliases, sa.Text).ilike(f"%{q}%"),
            )
        )

    # Subquery: count linked IOCs per actor
    link_count_sq = (
        select(
            ThreatActorIOCLinkModel.threat_actor_id,
            func.count().label("cnt"),
        )
        .group_by(ThreatActorIOCLinkModel.threat_actor_id)
        .subquery()
    )

    count_q = (
        select(func.count())
        .select_from(ThreatActorModel)
        .where(*base_where)
    )
    total = (await session.execute(count_q)).scalar_one()

    rows_q = (
        select(
            ThreatActorModel,
            func.coalesce(link_count_sq.c.cnt, 0).label("linked_ioc_count"),
        )
        .outerjoin(link_count_sq, link_count_sq.c.threat_actor_id == ThreatActorModel.id)
        .where(*base_where)
        .order_by(
            func.coalesce(link_count_sq.c.cnt, 0).desc(),
            ThreatActorModel.name.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(rows_q)).all()

    items = [
        ThreatActorListItem(
            id=row.ThreatActorModel.id,
            mitre_id=row.ThreatActorModel.mitre_id,
            name=row.ThreatActorModel.name,
            aliases=row.ThreatActorModel.aliases or [],
            country=row.ThreatActorModel.country,
            motivations=row.ThreatActorModel.motivations or [],
            linked_ioc_count=row.linked_ioc_count,
        )
        for row in rows
    ]

    return PaginatedThreatActorResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


# ---------------------------------------------------------------------------
# GET /api/threat-actors/:id — detail view
# ---------------------------------------------------------------------------


@router.get("/{actor_id}", response_model=ThreatActorDetail)
async def get_threat_actor(
    actor_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ThreatActorDetail:
    result = await session.execute(
        select(ThreatActorModel).where(ThreatActorModel.id == actor_id)
    )
    actor = result.scalar_one_or_none()
    if actor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Threat actor not found.")

    link_count = (
        await session.execute(
            select(func.count()).select_from(ThreatActorIOCLinkModel)
            .where(ThreatActorIOCLinkModel.threat_actor_id == actor_id)
        )
    ).scalar_one()

    return ThreatActorDetail(
        id=actor.id,
        mitre_id=actor.mitre_id,
        name=actor.name,
        aliases=actor.aliases or [],
        description=actor.description,
        country=actor.country,
        motivations=actor.motivations or [],
        first_seen=actor.first_seen,
        last_seen=actor.last_seen,
        techniques=actor.techniques or [],
        software=actor.software or [],
        associated_malware=actor.associated_malware or [],
        metadata=actor.metadata_,
        linked_ioc_count=link_count,
    )


# ---------------------------------------------------------------------------
# GET /api/threat-actors/:id/iocs — IOCs linked to a threat actor
# ---------------------------------------------------------------------------


@router.get("/{actor_id}/iocs", response_model=PaginatedIOCResponse)
async def get_threat_actor_iocs(
    actor_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=_MAX_PAGE_SIZE),
) -> PaginatedIOCResponse:
    # Verify actor exists
    actor_check = await session.execute(
        select(ThreatActorModel.id).where(ThreatActorModel.id == actor_id)
    )
    if actor_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Threat actor not found.")

    linked_ioc_ids_sq = (
        select(ThreatActorIOCLinkModel.ioc_id)
        .where(ThreatActorIOCLinkModel.threat_actor_id == actor_id)
        .subquery()
    )

    total = (
        await session.execute(
            select(func.count()).select_from(IOCModel)
            .where(IOCModel.id.in_(select(linked_ioc_ids_sq)))
        )
    ).scalar_one()

    iocs = (
        await session.execute(
            select(IOCModel)
            .where(IOCModel.id.in_(select(linked_ioc_ids_sq)))
            .order_by(IOCModel.severity.desc().nullslast(), IOCModel.last_seen.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return PaginatedIOCResponse(
        items=[IOCListItem.model_validate(ioc) for ioc in iocs],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


# ---------------------------------------------------------------------------
# GET /api/iocs/:id/threat-actors — threat actors linked to an IOC
# ---------------------------------------------------------------------------


@ioc_ta_router.get("/{ioc_id}/threat-actors", response_model=list[ThreatActorLinkItem])
async def get_ioc_threat_actors(
    ioc_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[ThreatActorLinkItem]:
    # Verify IOC exists
    ioc_check = await session.execute(
        select(IOCModel.id).where(IOCModel.id == ioc_id)
    )
    if ioc_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found.")

    rows = (
        await session.execute(
            select(ThreatActorModel, ThreatActorIOCLinkModel.confidence)
            .join(
                ThreatActorIOCLinkModel,
                ThreatActorIOCLinkModel.threat_actor_id == ThreatActorModel.id,
            )
            .where(ThreatActorIOCLinkModel.ioc_id == ioc_id)
            .order_by(ThreatActorIOCLinkModel.confidence.desc().nullslast())
        )
    ).all()

    return [
        ThreatActorLinkItem(
            id=row.ThreatActorModel.id,
            mitre_id=row.ThreatActorModel.mitre_id,
            name=row.ThreatActorModel.name,
            country=row.ThreatActorModel.country,
            motivations=row.ThreatActorModel.motivations or [],
            confidence=float(row.confidence) if row.confidence is not None else None,
        )
        for row in rows
    ]
