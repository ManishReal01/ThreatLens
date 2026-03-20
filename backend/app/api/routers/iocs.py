"""IOC search, detail, and relationship-graph endpoints.

All endpoints require a valid Supabase JWT.  User-scoped data (tags, notes)
is always filtered with an explicit ``WHERE user_id = :current_user`` so that
cross-analyst data leakage (IDOR) is impossible at the query layer.
"""

from __future__ import annotations

import math
import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.api.schemas import (
    GraphEdge,
    GraphNode,
    GraphResponse,
    IOCDetailResponse,
    IOCListItem,
    IOCSourceResponse,
    NoteResponse,
    PaginatedIOCResponse,
    TagResponse,
)
from app.db.session import get_db
from app.models import (
    IOCModel,
    IOCRelationshipModel,
    IOCSourceModel,
    NoteModel,
    TagModel,
)

router = APIRouter(prefix="/api/iocs", tags=["iocs"])

_MAX_PAGE_SIZE = 100
_GRAPH_MAX_HOPS = 3
_GRAPH_MAX_NODES = 100


# ---------------------------------------------------------------------------
# GET /api/iocs — paginated search
# ---------------------------------------------------------------------------


@router.get("", response_model=PaginatedIOCResponse)
async def search_iocs(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(
        None,
        description="Full-text / trigram search on IOC value (partial match supported)",
    ),
    ioc_type: Optional[str] = Query(
        None,
        alias="type",
        description="IOC type: ip | domain | url | hash_md5 | hash_sha1 | hash_sha256",
    ),
    severity_min: Optional[float] = Query(None, ge=0, le=10),
    severity_max: Optional[float] = Query(None, ge=0, le=10),
    date_from: Optional[date] = Query(
        None, description="last_seen >= date_from (inclusive)"
    ),
    date_to: Optional[date] = Query(
        None, description="last_seen <= date_to (inclusive)"
    ),
    feed: Optional[str] = Query(
        None, description="Filter by feed source name (abuseipdb | urlhaus | otx)"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=_MAX_PAGE_SIZE),
) -> PaginatedIOCResponse:
    """Search IOCs across all filters.  Results are always paginated."""
    base_where: list[sa.ColumnElement] = []

    if q:
        # Full-text search via the generated ts_vector column (PostgreSQL only)
        # combined with trigram ILIKE for partial / non-English matches.
        ts_expr = text(
            "iocs.ts_vector @@ plainto_tsquery('english', :fts_q)"
        ).bindparams(fts_q=q)
        base_where.append(or_(ts_expr, IOCModel.value.ilike(f"%{q}%")))

    if ioc_type is not None:
        base_where.append(IOCModel.type == ioc_type)

    if severity_min is not None:
        base_where.append(IOCModel.severity >= severity_min)

    if severity_max is not None:
        base_where.append(IOCModel.severity <= severity_max)

    if date_from is not None:
        dt_from = datetime.combine(date_from, datetime.min.time(), timezone.utc)
        base_where.append(IOCModel.last_seen >= dt_from)

    if date_to is not None:
        dt_to = datetime.combine(date_to, datetime.max.time(), timezone.utc)
        base_where.append(IOCModel.last_seen <= dt_to)

    if feed is not None:
        # EXISTS subquery — avoids a JOIN that would multiply rows when an IOC
        # has multiple observations from the same feed.
        feed_exists = (
            select(IOCSourceModel.ioc_id)
            .where(
                IOCSourceModel.ioc_id == IOCModel.id,
                IOCSourceModel.feed_name == feed,
            )
            .exists()
        )
        base_where.append(feed_exists)

    count_q = select(func.count()).select_from(IOCModel).where(*base_where)
    total_result = await session.execute(count_q)
    total = total_result.scalar_one()

    rows_q = (
        select(IOCModel)
        .where(*base_where)
        .order_by(
            IOCModel.severity.desc().nullslast(),
            IOCModel.last_seen.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.execute(rows_q)
    iocs = result.scalars().all()

    pages = math.ceil(total / page_size) if total > 0 else 0
    return PaginatedIOCResponse(
        items=[IOCListItem.model_validate(ioc) for ioc in iocs],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


# ---------------------------------------------------------------------------
# GET /api/iocs/{ioc_id} — full detail
# ---------------------------------------------------------------------------


@router.get("/{ioc_id}", response_model=IOCDetailResponse)
async def get_ioc(
    ioc_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> IOCDetailResponse:
    """Return full IOC detail: severity formula breakdown, all feed observations,
    and the requesting analyst's own tags and notes (user-scoped, IDOR-safe)."""
    ioc_result = await session.execute(
        select(IOCModel).where(IOCModel.id == ioc_id)
    )
    ioc = ioc_result.scalar_one_or_none()
    if ioc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found."
        )

    sources_result = await session.execute(
        select(IOCSourceModel)
        .where(IOCSourceModel.ioc_id == ioc_id)
        .order_by(IOCSourceModel.ingested_at.desc())
    )
    sources = sources_result.scalars().all()

    # Explicit WHERE user_id = :current_user prevents IDOR on both tables.
    tags_result = await session.execute(
        select(TagModel).where(
            TagModel.ioc_id == ioc_id,
            TagModel.user_id == current_user,
        )
    )
    tags = tags_result.scalars().all()

    notes_result = await session.execute(
        select(NoteModel).where(
            NoteModel.ioc_id == ioc_id,
            NoteModel.user_id == current_user,
        )
    )
    notes = notes_result.scalars().all()

    return IOCDetailResponse(
        id=ioc.id,
        value=ioc.value,
        type=ioc.type,
        severity=float(ioc.severity) if ioc.severity is not None else None,
        first_seen=ioc.first_seen,
        last_seen=ioc.last_seen,
        source_count=ioc.source_count,
        is_active=ioc.is_active,
        score_version=ioc.score_version,
        score_explanation=ioc.score_explanation,
        metadata=ioc.metadata_,
        sources=[IOCSourceResponse.model_validate(s) for s in sources],
        tags=[TagResponse.model_validate(t) for t in tags],
        notes=[NoteResponse.model_validate(n) for n in notes],
    )


# ---------------------------------------------------------------------------
# GET /api/iocs/{ioc_id}/graph — relationship graph traversal
# ---------------------------------------------------------------------------


@router.get("/{ioc_id}/graph", response_model=GraphResponse)
async def get_ioc_graph(
    ioc_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> GraphResponse:
    """Return the IOC relationship graph rooted at ``ioc_id``.

    Traversal is capped at **3 hops** and **100 nodes**.  When either cap is
    hit the ``truncated`` flag in the response is set to ``true``.
    """
    seed_check = await session.execute(
        select(IOCModel.id).where(IOCModel.id == ioc_id)
    )
    if seed_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found."
        )

    visited_ids, edges, truncated = await _traverse_graph(session, ioc_id)

    node_result = await session.execute(
        select(IOCModel).where(IOCModel.id.in_(list(visited_ids)))
    )
    ioc_nodes = node_result.scalars().all()

    return GraphResponse(
        nodes=[
            GraphNode(
                id=n.id,
                value=n.value,
                type=n.type,
                severity=float(n.severity) if n.severity is not None else None,
            )
            for n in ioc_nodes
        ],
        edges=[
            GraphEdge(
                id=e.id,
                source=e.source_ioc,
                target=e.target_ioc,
                relationship=e.relationship,
                confidence=(
                    float(e.confidence) if e.confidence is not None else None
                ),
            )
            for e in edges
        ],
        truncated=truncated,
    )


async def _traverse_graph(
    session: AsyncSession,
    seed_id: uuid.UUID,
    max_hops: int = _GRAPH_MAX_HOPS,
    max_nodes: int = _GRAPH_MAX_NODES,
) -> tuple[set[uuid.UUID], list[IOCRelationshipModel], bool]:
    """BFS graph traversal capped at max_hops depth and max_nodes total nodes.

    Returns ``(visited_ids, deduplicated_edge_list, truncated)``.

    Edges are collected only when **both** endpoints are within the visited set,
    so the returned edge list is always consistent with the returned node set.

    The algorithm is dialect-agnostic (no recursive CTE) so it works against
    both PostgreSQL and the SQLite test database.
    """
    visited: set[uuid.UUID] = {seed_id}
    frontier: set[uuid.UUID] = {seed_id}
    # Keyed by edge id to deduplicate naturally.
    all_edges: dict[uuid.UUID, IOCRelationshipModel] = {}
    truncated = False

    for _ in range(max_hops):
        if not frontier:
            break

        rel_result = await session.execute(
            select(IOCRelationshipModel).where(
                or_(
                    IOCRelationshipModel.source_ioc.in_(list(frontier)),
                    IOCRelationshipModel.target_ioc.in_(list(frontier)),
                )
            )
        )
        rels = rel_result.scalars().all()

        next_frontier: set[uuid.UUID] = set()
        for rel in rels:
            src, tgt = rel.source_ioc, rel.target_ioc
            new_node: Optional[uuid.UUID] = None
            if src in visited and tgt not in visited:
                new_node = tgt
            elif tgt in visited and src not in visited:
                new_node = src

            if new_node is not None:
                if len(visited) + len(next_frontier) < max_nodes:
                    next_frontier.add(new_node)
                else:
                    truncated = True

        visited.update(next_frontier)
        frontier = next_frontier

        # Capture all edges where both endpoints are now in the graph.
        for rel in rels:
            if rel.source_ioc in visited and rel.target_ioc in visited:
                all_edges[rel.id] = rel

    return visited, list(all_edges.values()), truncated
