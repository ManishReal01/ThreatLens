"""Feed health and manual-trigger endpoints.

GET  /api/feeds/health        — open to any authenticated analyst
POST /api/feeds/{name}/trigger — admin-only; enqueues a background feed run
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, CurrentUser
from app.api.schemas import FeedHealthItem, FeedHealthResponse, TriggerResponse
from app.config import settings
from app.db.session import AsyncSessionLocal, get_db
from app.models import FeedRunModel
from app.models.ioc_source import IOCSourceModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feeds", tags=["feeds"])

_KNOWN_FEEDS: tuple[str, ...] = ("abuseipdb", "urlhaus", "otx")


# ---------------------------------------------------------------------------
# GET /api/feeds/health
# ---------------------------------------------------------------------------


@router.get("/health", response_model=FeedHealthResponse)
async def get_feed_health(
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> FeedHealthResponse:
    """Return the most-recently completed run for each known feed.

    ``last_run_at`` is None when the feed has never run.
    ``last_run_status`` is either ``"success"`` or ``"error"``
    (``"running"`` rows are excluded so stale in-progress rows are ignored).
    """
    # Fetch cumulative per-feed IOC counts in one query
    counts_result = await session.execute(
        select(IOCSourceModel.feed_name, func.count().label("cnt"))
        .group_by(IOCSourceModel.feed_name)
    )
    total_iocs_by_feed: dict[str, int] = {row[0]: row[1] for row in counts_result}

    items: list[FeedHealthItem] = []

    for feed_name in _KNOWN_FEEDS:
        result = await session.execute(
            select(FeedRunModel)
            .where(
                FeedRunModel.feed_name == feed_name,
                FeedRunModel.status != "running",
            )
            .order_by(FeedRunModel.started_at.desc())
            .limit(1)
        )
        run = result.scalar_one_or_none()

        if run is None:
            items.append(
                FeedHealthItem(
                    feed_name=feed_name,
                    last_run_at=None,
                    last_run_status=None,
                    last_iocs_fetched=None,
                    last_iocs_new=None,
                    last_error_msg=None,
                    total_iocs=total_iocs_by_feed.get(feed_name, 0),
                )
            )
        else:
            items.append(
                FeedHealthItem(
                    feed_name=feed_name,
                    last_run_at=run.started_at,
                    last_run_status=run.status,
                    last_iocs_fetched=run.iocs_fetched,
                    last_iocs_new=run.iocs_new,
                    last_error_msg=run.error_msg,
                    total_iocs=total_iocs_by_feed.get(feed_name, 0),
                )
            )

    return FeedHealthResponse(feeds=items)


# ---------------------------------------------------------------------------
# POST /api/feeds/{name}/trigger  (admin only)
# ---------------------------------------------------------------------------


@router.post("/{name}/trigger", response_model=TriggerResponse)
async def trigger_feed(
    name: str,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
) -> TriggerResponse:
    """Manually trigger an immediate feed sync (admin only).

    The run executes in a background task so the response is returned
    promptly.  Check ``GET /api/feeds/health`` afterwards to see the result.
    """
    if name not in _KNOWN_FEEDS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Unknown feed '{name}'. "
                f"Valid names: {', '.join(_KNOWN_FEEDS)}"
            ),
        )
    background_tasks.add_task(_run_feed_worker, name)
    return TriggerResponse(status="triggered", feed=name)


async def _run_feed_worker(feed_name: str) -> None:
    """Run a feed worker in its own session (called from BackgroundTasks)."""
    logger.info("Manual trigger: starting %s feed run", feed_name)
    try:
        if feed_name == "abuseipdb":
            from app.feeds.abuseipdb import AbuseIPDBWorker

            worker_cls = AbuseIPDBWorker
        elif feed_name == "urlhaus":
            from app.feeds.urlhaus import URLhausWorker

            worker_cls = URLhausWorker
        else:
            from app.feeds.otx import OTXWorker

            worker_cls = OTXWorker

        async with worker_cls(settings) as worker:
            async with AsyncSessionLocal() as session:
                await worker.run(session)

        logger.info("Manual trigger: %s feed run complete", feed_name)
    except Exception:
        logger.exception("Manual trigger: %s feed run failed", feed_name)
