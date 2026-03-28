"""Campaign API endpoints — correlation engine results."""

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    CampaignDetail,
    CampaignIOCItem,
    CampaignListItem,
    CampaignRunResponse,
    CampaignStats,
    PaginatedCampaignResponse,
)
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


# ---------------------------------------------------------------------------
# GET /api/campaigns/stats  — MUST be before /{id} to avoid route conflict
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=CampaignStats)
async def get_campaign_stats(session: AsyncSession = Depends(get_db)):
    """Aggregate statistics across all campaigns."""
    row = await session.execute(
        text(
            "SELECT "
            "  COUNT(*) FILTER (WHERE status = 'active') AS active, "
            "  COUNT(*) FILTER (WHERE status = 'archived') AS archived, "
            "  COUNT(*) AS total, "
            "  ROUND(AVG(confidence)::numeric, 4) AS avg_conf "
            "FROM campaigns"
        )
    )
    stats_row = row.fetchone()
    active = int(stats_row[0] or 0)
    archived = int(stats_row[1] or 0)
    total = int(stats_row[2] or 0)
    avg_conf = float(stats_row[3]) if stats_row[3] is not None else None

    # Total distinct IOCs clustered across active campaigns
    ioc_row = await session.execute(
        text(
            "SELECT COALESCE(SUM(ioc_count), 0) FROM campaigns WHERE status = 'active'"
        )
    )
    total_iocs = int(ioc_row.scalar() or 0)

    # Breakdown by primary_signal
    sig_rows = await session.execute(
        text(
            "SELECT primary_signal, COUNT(*) "
            "FROM campaigns "
            "WHERE status = 'active' AND primary_signal IS NOT NULL "
            "GROUP BY primary_signal "
            "ORDER BY COUNT(*) DESC"
        )
    )
    by_signal: dict[str, int] = {row[0]: int(row[1]) for row in sig_rows.fetchall()}

    return CampaignStats(
        total_campaigns=total,
        total_clustered_iocs=total_iocs,
        avg_confidence=avg_conf,
        by_signal_type=by_signal,
        active_campaigns=active,
        archived_campaigns=archived,
    )


# ---------------------------------------------------------------------------
# POST /api/campaigns/run  — trigger correlation engine
# ---------------------------------------------------------------------------


@router.post("/run", response_model=CampaignRunResponse)
async def trigger_correlation_run(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    """Trigger the correlation engine immediately (runs in background)."""

    async def _run():
        from app.correlation.engine import CorrelationEngine
        from app.db.session import AsyncSessionLocal

        logger.info("Manual correlation engine run triggered via API")
        try:
            async with AsyncSessionLocal() as s:
                engine = CorrelationEngine()
                result = await engine.run(s)
            logger.info(
                "Manual correlation run done: %d campaigns, %d IOCs, %.1fs",
                result.campaigns_found,
                result.iocs_clustered,
                result.duration_s,
            )
        except Exception as exc:
            logger.error("Manual correlation run failed: %s", exc, exc_info=True)

    background_tasks.add_task(_run)
    return CampaignRunResponse(
        status="running",
        message="Correlation engine started in background. Poll /api/campaigns/stats to track progress.",
    )


# ---------------------------------------------------------------------------
# GET /api/campaigns  — paginated list
# ---------------------------------------------------------------------------


@router.get("", response_model=PaginatedCampaignResponse)
async def list_campaigns(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    min_confidence: float = Query(0.0, ge=0.0, le=1.0),
    status: Optional[str] = Query("active"),
    signal_type: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_db),
):
    """Paginated list of campaigns with optional filters."""
    conditions = ["1=1"]
    params: dict = {}

    if min_confidence > 0:
        conditions.append("confidence >= :min_confidence")
        params["min_confidence"] = min_confidence

    if status:
        conditions.append("status = :status")
        params["status"] = status

    if signal_type:
        conditions.append("primary_signal = :signal_type")
        params["signal_type"] = signal_type

    where = " AND ".join(conditions)
    offset = (page - 1) * page_size

    count_row = await session.execute(
        text(f"SELECT COUNT(*) FROM campaigns WHERE {where}"), params
    )
    total = int(count_row.scalar() or 0)

    rows = await session.execute(
        text(
            f"SELECT id, name, confidence, ioc_count, status, primary_signal, "
            f"       first_seen, last_seen, techniques, threat_actor_ids, created_at "
            f"FROM campaigns WHERE {where} "
            f"ORDER BY confidence DESC NULLS LAST, ioc_count DESC "
            f"LIMIT :limit OFFSET :offset"
        ),
        {**params, "limit": page_size, "offset": offset},
    )

    items = []
    for row in rows.fetchall():
        items.append(
            CampaignListItem(
                id=row[0],
                name=row[1],
                confidence=float(row[2]) if row[2] is not None else None,
                ioc_count=int(row[3]),
                status=row[4],
                primary_signal=row[5],
                first_seen=row[6],
                last_seen=row[7],
                techniques=row[8] or [],
                threat_actor_ids=row[9] or [],
                created_at=row[10],
            )
        )

    return PaginatedCampaignResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


# ---------------------------------------------------------------------------
# GET /api/campaigns/{id}  — full campaign detail
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: str,
    session: AsyncSession = Depends(get_db),
):
    """Full campaign detail with top IOCs, signal breakdown, linked actors."""
    from fastapi import HTTPException

    row = await session.execute(
        text(
            "SELECT id, name, description, confidence, ioc_count, status, "
            "       primary_signal, first_seen, last_seen, techniques, "
            "       threat_actor_ids, created_at, updated_at "
            "FROM campaigns WHERE id = :id LIMIT 1"
        ),
        {"id": campaign_id},
    )
    c = row.fetchone()
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Top 20 IOCs
    ioc_rows = await session.execute(
        text(
            "SELECT ci.ioc_id, i.value, i.type, i.severity, "
            "       ci.signal_types, ci.confidence "
            "FROM campaign_iocs ci "
            "JOIN iocs i ON i.id = ci.ioc_id "
            "WHERE ci.campaign_id = :cid "
            "ORDER BY ci.confidence DESC NULLS LAST, i.severity DESC NULLS LAST "
            "LIMIT 20"
        ),
        {"cid": campaign_id},
    )
    top_iocs = [
        CampaignIOCItem(
            id=r[0],
            value=r[1],
            type=r[2],
            severity=float(r[3]) if r[3] is not None else None,
            signal_types=r[4] or [],
            confidence=float(r[5]) if r[5] is not None else None,
        )
        for r in ioc_rows.fetchall()
    ]

    # Signal breakdown — count IOCs per signal
    sig_rows = await session.execute(
        text(
            "SELECT signal_types FROM campaign_iocs WHERE campaign_id = :cid"
        ),
        {"cid": campaign_id},
    )
    signal_breakdown: dict[str, int] = {}
    for (sig_list,) in sig_rows.fetchall():
        for sig in (sig_list or []):
            signal_breakdown[sig] = signal_breakdown.get(sig, 0) + 1

    # Linked threat actors
    actor_ids = c[10] or []
    linked_actors: list[dict] = []
    if actor_ids:
        id_list = ", ".join(f"'{aid}'" for aid in actor_ids)
        actor_rows = await session.execute(
            text(
                f"SELECT id, name, mitre_id, country, motivations, techniques "
                f"FROM threat_actors WHERE id::text IN ({id_list})"
            )
        )
        linked_actors = [
            {
                "id": str(r[0]),
                "name": r[1],
                "mitre_id": r[2],
                "country": r[3],
                "motivations": r[4] or [],
                "technique_count": len(r[5] or []),
            }
            for r in actor_rows.fetchall()
        ]

    return CampaignDetail(
        id=c[0],
        name=c[1],
        description=c[2],
        confidence=float(c[3]) if c[3] is not None else None,
        ioc_count=int(c[4]),
        status=c[5],
        primary_signal=c[6],
        first_seen=c[7],
        last_seen=c[8],
        techniques=c[9] or [],
        threat_actor_ids=c[10] or [],
        created_at=c[11],
        updated_at=c[12],
        top_iocs=top_iocs,
        signal_breakdown=signal_breakdown,
        linked_actors=linked_actors,
    )
