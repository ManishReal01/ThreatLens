"""APScheduler wiring — one job per feed, wired into FastAPI lifespan."""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import Settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


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


async def _run_mitre_attack(settings: Settings) -> None:
    from app.feeds.mitre_attack import MITREAttackWorker

    async with MITREAttackWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_cisa_kev(settings: Settings) -> None:
    from app.feeds.cisa_kev import CISAKEVWorker

    async with CISAKEVWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_virustotal(settings: Settings) -> None:
    from app.feeds.virustotal import VirusTotalWorker

    logger.info("VirusTotal enrichment starting — VT configured: %s", bool(settings.vt_api_key))
    async with VirusTotalWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_feodotracker(settings: Settings) -> None:
    from app.feeds.feodotracker import FeodoTrackerWorker

    async with FeodoTrackerWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_malwarebazaar(settings: Settings) -> None:
    from app.feeds.malwarebazaar import MalwareBazaarWorker

    async with MalwareBazaarWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_sslbl(settings: Settings) -> None:
    from app.feeds.sslbl import SSLBLWorker

    async with SSLBLWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_geoip_enricher(settings: Settings) -> None:
    from app.feeds.geoip_enricher import GeoIPEnricherWorker

    async with GeoIPEnricherWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)


async def _run_correlation(settings: Settings) -> None:
    from app.correlation.engine import CorrelationEngine

    logger.info("Correlation engine starting scheduled run")
    try:
        async with AsyncSessionLocal() as session:
            engine = CorrelationEngine()
            result = await engine.run(session)
        logger.info(
            "Correlation engine done: %d campaigns, %d IOCs, %.1fs",
            result.campaigns_found,
            result.iocs_clustered,
            result.duration_s,
        )
    except Exception as exc:
        logger.error("Correlation engine failed: %s", exc, exc_info=True)


def create_scheduler(settings: Settings) -> AsyncIOScheduler:
    """Return a configured AsyncIOScheduler (not yet started)."""
    scheduler = AsyncIOScheduler()

    now = datetime.now(timezone.utc)
    # Stagger feed startup runs 30s apart, beginning 60s after boot.
    # Keeps at most one feed holding a DB connection while the dashboard
    # serves its initial requests (pool budget: pool_size=3 + max_overflow=2 = 5).
    T = [now + timedelta(seconds=60 + i * 30) for i in range(10)]
    # Correlation runs 20min after startup so all feeds have had time to ingest.
    T_CORRELATION = now + timedelta(minutes=20)

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
        next_run_time=T[0],
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
        next_run_time=T[1],
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
        next_run_time=T[2],
    )

    scheduler.add_job(
        _run_mitre_attack,
        trigger="interval",
        minutes=settings.mitre_attack_schedule_minutes,
        kwargs={"settings": settings},
        id="mitre_attack_feed",
        name="MITRE ATT&CK Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=600,
        next_run_time=T[3],
    )

    scheduler.add_job(
        _run_cisa_kev,
        trigger="interval",
        minutes=settings.cisa_kev_schedule_minutes,
        kwargs={"settings": settings},
        id="cisa_kev_feed",
        name="CISA KEV Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=600,
        next_run_time=T[4],
    )

    scheduler.add_job(
        _run_virustotal,
        trigger="interval",
        minutes=settings.vt_schedule_minutes,
        kwargs={"settings": settings},
        id="virustotal_feed",
        name="VirusTotal Enrichment",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=T[5],
    )

    scheduler.add_job(
        _run_feodotracker,
        trigger="interval",
        minutes=settings.feodotracker_schedule_minutes,
        kwargs={"settings": settings},
        id="feodotracker_feed",
        name="Feodo Tracker Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=T[6],
    )

    scheduler.add_job(
        _run_malwarebazaar,
        trigger="interval",
        minutes=settings.malwarebazaar_schedule_minutes,
        kwargs={"settings": settings},
        id="malwarebazaar_feed",
        name="MalwareBazaar Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=T[7],
    )

    scheduler.add_job(
        _run_sslbl,
        trigger="interval",
        minutes=settings.sslbl_schedule_minutes,
        kwargs={"settings": settings},
        id="sslbl_feed",
        name="SSLBL Feed",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
        next_run_time=T[8],
    )

    scheduler.add_job(
        _run_geoip_enricher,
        trigger="interval",
        minutes=settings.geoip_enricher_schedule_minutes,
        kwargs={"settings": settings},
        id="geoip_enricher_feed",
        name="GeoIP Enricher",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=600,
        next_run_time=T[9],
    )

    # Correlation engine — runs after all feeds have had a chance to ingest
    scheduler.add_job(
        _run_correlation,
        trigger="interval",
        minutes=settings.correlation_schedule_minutes,
        kwargs={"settings": settings},
        id="correlation_engine",
        name="Correlation Engine",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=600,
        next_run_time=T_CORRELATION,
    )

    logger.info(
        "Scheduler configured: URLhaus every %dm, OTX every %dm, "
        "ThreatFox every %dm, MITRE ATT&CK every %dm, CISA KEV every %dm, "
        "VirusTotal every %dm, Feodo Tracker every %dm, "
        "MalwareBazaar every %dm, SSLBL every %dm, GeoIP Enricher every %dm, "
        "Correlation Engine every %dm (first run in 5m)",
        settings.urlhaus_schedule_minutes,
        settings.otx_schedule_minutes,
        settings.threatfox_schedule_minutes,
        settings.mitre_attack_schedule_minutes,
        settings.cisa_kev_schedule_minutes,
        settings.vt_schedule_minutes,
        settings.feodotracker_schedule_minutes,
        settings.malwarebazaar_schedule_minutes,
        settings.sslbl_schedule_minutes,
        settings.geoip_enricher_schedule_minutes,
        settings.correlation_schedule_minutes,
    )
    return scheduler
