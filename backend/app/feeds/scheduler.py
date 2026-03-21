"""APScheduler wiring — one job per feed, wired into FastAPI lifespan."""

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import Settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def _run_abuseipdb(settings: Settings) -> None:
    from app.feeds.abuseipdb import AbuseIPDBWorker

    async with AbuseIPDBWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_urlhaus(settings: Settings) -> None:
    from app.feeds.urlhaus import URLhausWorker

    async with URLhausWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_otx(settings: Settings) -> None:
    from app.feeds.otx import OTXWorker

    async with OTXWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_threatfox(settings: Settings) -> None:
    from app.feeds.threatfox import ThreatFoxWorker

    async with ThreatFoxWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


def create_scheduler(settings: Settings) -> AsyncIOScheduler:
    """Return a configured AsyncIOScheduler (not yet started)."""
    scheduler = AsyncIOScheduler()

    now = datetime.now(timezone.utc)

    scheduler.add_job(
        _run_abuseipdb,
        trigger="interval",
        minutes=settings.abuseipdb_schedule_minutes,
        kwargs={"settings": settings},
        id="abuseipdb_feed",
        name="AbuseIPDB Feed",
        replace_existing=True,
        max_instances=1,       # prevent overlap if a run takes longer than the interval
        misfire_grace_time=300,
        next_run_time=now,     # run immediately on startup
    )

    scheduler.add_job(
        _run_urlhaus,
        trigger="interval",
        minutes=settings.urlhaus_schedule_minutes,
        kwargs={"settings": settings},
        id="urlhaus_feed",
        name="URLhaus Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=now,     # run immediately on startup
    )

    scheduler.add_job(
        _run_otx,
        trigger="interval",
        minutes=settings.otx_schedule_minutes,
        kwargs={"settings": settings},
        id="otx_feed",
        name="AlienVault OTX Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=now,     # run immediately on startup
    )

    scheduler.add_job(
        _run_threatfox,
        trigger="interval",
        minutes=settings.threatfox_schedule_minutes,
        kwargs={"settings": settings},
        id="threatfox_feed",
        name="ThreatFox Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=now,     # run immediately on startup
    )

    logger.info(
        "Scheduler configured: AbuseIPDB every %dm, URLhaus every %dm, OTX every %dm, ThreatFox every %dm",
        settings.abuseipdb_schedule_minutes,
        settings.urlhaus_schedule_minutes,
        settings.otx_schedule_minutes,
        settings.threatfox_schedule_minutes,
    )
    return scheduler
