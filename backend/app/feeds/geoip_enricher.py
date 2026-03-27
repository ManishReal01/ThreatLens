"""GeoIP enrichment feed adapter.

Fetches up to 500 IP IOCs that have no latitude/longitude cached, calls the
free ip-api.com batch endpoint (no API key required, 100 IPs per request),
and writes the resulting coordinates back to the ``iocs`` table.

ip-api.com free-tier limits:
  - 45 requests/minute per client IP
  - 100 IPs per batch request
  - No API key required

Strategy:
  1. SELECT up to 500 IPs where latitude IS NULL
  2. Chunk into batches of 100
  3. POST to http://ip-api.com/batch for each chunk
  4. Write lat/lon/country back to IOC rows
  5. Commit once at the end

Runs every 120 minutes (configurable via ``geoip_enricher_schedule_minutes``).
Each run geocodes up to 500 IPs, so ~30k IPs will be fully covered in about
12 runs (~24 hours at 2h intervals).
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.models.ioc import IOCModel

logger = logging.getLogger(__name__)

_BATCH_SIZE = 100       # ip-api.com hard limit per batch request
_MAX_IPS_PER_RUN = 500  # cap per scheduler run to keep runtime bounded
_CHUNK_SLEEP = 1.2      # seconds between chunks — stay well under 45 req/min


class GeoIPEnricherWorker(BaseFeedWorker):
    """Background worker that geocodes uncached IP IOCs via ip-api.com/batch."""

    FEED_NAME = "geoip_enricher"

    def is_configured(self) -> bool:
        # No API key required — always enabled
        return True

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        # Fetch up to 500 IP IOCs that have no coordinates yet
        result = await session.execute(
            select(IOCModel)
            .where(
                IOCModel.type == "ip",
                IOCModel.latitude.is_(None),
            )
            .order_by(IOCModel.severity.desc().nullslast())
            .limit(_MAX_IPS_PER_RUN)
        )
        iocs = list(result.scalars().all())

        if not iocs:
            logger.info("GeoIPEnricher: all IP IOCs already geocoded — nothing to do")
            return 0, 0, 0

        logger.info("GeoIPEnricher: geocoding %d IP IOCs", len(iocs))
        fetched = len(iocs)
        updated = 0

        # Process in chunks of 100 (ip-api.com batch limit)
        for chunk_start in range(0, len(iocs), _BATCH_SIZE):
            chunk = iocs[chunk_start: chunk_start + _BATCH_SIZE]
            payload = [{"query": ioc.value} for ioc in chunk]

            try:
                resp = await self._post("http://ip-api.com/batch", json=payload)
                results = resp.json() if resp is not None else []
            except Exception as exc:
                logger.warning(
                    "GeoIPEnricher: batch request failed for chunk %d-%d: %s",
                    chunk_start, chunk_start + len(chunk), exc,
                )
                results = []

            for ioc, geo in zip(chunk, results):
                if not isinstance(geo, dict):
                    continue
                if geo.get("status") != "success":
                    continue
                lat = geo.get("lat")
                lon = geo.get("lon")
                if lat is None or lon is None:
                    continue

                ioc.latitude = lat
                ioc.longitude = lon

                # Merge country/city/ISP into metadata for tooltip display
                meta = dict(ioc.metadata_ or {})
                if geo.get("country"):
                    meta["country"] = geo["country"]
                if geo.get("city"):
                    meta["city"] = geo["city"]
                if geo.get("isp"):
                    meta["isp"] = geo["isp"]
                ioc.metadata_ = meta
                updated += 1

            if chunk_start + _BATCH_SIZE < len(iocs):
                await asyncio.sleep(_CHUNK_SLEEP)

        logger.info("GeoIPEnricher: geocoded %d / %d IPs this run", updated, fetched)
        return fetched, 0, updated
