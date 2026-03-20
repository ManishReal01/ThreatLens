"""AbuseIPDB feed adapter.

API endpoint: GET https://api.abuseipdb.com/api/v2/blacklist
Auth header:  Key: {abuseipdb_api_key}
Free tier:    1,000 API calls/day — one bulk blacklist fetch per scheduled run
              (4 calls/day at default 360-minute interval = safely within quota)

Response shape::

    {
        "meta": {"generatedAt": "2024-01-01T00:00:00+00:00"},
        "data": [
            {
                "ipAddress": "1.2.3.4",
                "abuseConfidenceScore": 100,
                "countryCode": "CN",
                "usageType": "Data Center/Web Hosting/Transit",
                "isp": "Some Cloud Provider",
                "domain": "provider.example",
                "totalReports": 10,
                "numDistinctUsers": 5,
                "lastReportedAt": "2024-01-01T00:00:00+00:00"
            },
            ...
        ]
    }
"""

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_BLACKLIST_URL = "https://api.abuseipdb.com/api/v2/blacklist"
# Only request IPs above this confidence threshold to stay within daily quota
_CONFIDENCE_MINIMUM = 25


class AbuseIPDBWorker(BaseFeedWorker):
    """Feed adapter for the AbuseIPDB IP blacklist."""

    FEED_NAME = "abuseipdb"

    def is_configured(self) -> bool:
        return bool(self.settings.abuseipdb_api_key)

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        response = await self._get(
            _BLACKLIST_URL,
            headers={
                "Key": self.settings.abuseipdb_api_key,
                "Accept": "application/json",
            },
            params={
                "confidenceMinimum": _CONFIDENCE_MINIMUM,
                "limit": 10000,
                "days": self.settings.abuseipdb_days_back,
            },
        )

        records: list[dict[str, Any]] = response.json().get("data", [])
        logger.info("AbuseIPDB returned %d records", len(records))

        fetched = new = updated = 0
        for record in records:
            ioc = _map_record(record, feed_run_id)
            if ioc is None:
                continue
            _, is_new = await upsert_ioc(session, ioc)
            fetched += 1
            if is_new:
                new += 1
            else:
                updated += 1

        return fetched, new, updated


def _map_record(record: dict[str, Any], feed_run_id: str) -> Optional[NormalizedIOC]:
    """Map one AbuseIPDB blacklist entry to NormalizedIOC.

    Returns None if the record has no IP address (malformed entry).
    """
    ip = record.get("ipAddress", "").strip()
    if not ip:
        return None

    # abuseConfidenceScore is 0–100; normalize to 0.0–1.0
    raw_score: int = record.get("abuseConfidenceScore", 0)
    raw_confidence = max(0.0, min(1.0, raw_score / 100.0))

    return NormalizedIOC(
        value=ip,
        ioc_type=IOCType.ip,
        raw_confidence=raw_confidence,
        feed_name="abuseipdb",
        feed_run_id=feed_run_id,
        raw_payload=record,
        metadata={
            "country_code": record.get("countryCode"),
            "isp": record.get("isp"),
            "domain": record.get("domain"),
            "total_reports": record.get("totalReports"),
            "num_distinct_users": record.get("numDistinctUsers"),
            "last_reported_at": record.get("lastReportedAt"),
            "usage_type": record.get("usageType"),
        },
    )
