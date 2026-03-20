"""URLhaus feed adapter (abuse.ch).

API endpoint: POST https://urlhaus-api.abuse.ch/v1/urls/recent/
Auth:         None required
Rate limits:  No documented rate limit; URLhaus encourages polling

Response shape::

    {
        "query_status": "ok",
        "urls": [
            {
                "id": "2315960",
                "urlhaus_reference": "https://urlhaus.abuse.ch/url/2315960/",
                "url": "http://example.com/malware.exe",
                "url_status": "online",
                "host": "example.com",
                "date_added": "2024-01-01 00:00:00 UTC",
                "threat": "malware_download",
                "blacklists": {"gsb_listing": "listed", "surbl": "listed"},
                "reporter": "reporter_name",
                "larted": false,
                "tags": ["EK", "Emotet"]
            },
            ...
        ]
    }

url_status values observed in the wild: "online", "offline", "unknown"
Confidence mapping: online → 0.9 (actively serving malware), offline → 0.6 (was malicious),
                    anything else → 0.5 (unverified/unknown status)
"""

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_RECENT_URLS_ENDPOINT = "https://urlhaus-api.abuse.ch/v1/urls/recent/"
_FETCH_LIMIT = 500  # URLs per request; URLhaus free API max is ~1000

_STATUS_CONFIDENCE: dict[str, float] = {
    "online": 0.9,
    "offline": 0.6,
}
_DEFAULT_CONFIDENCE = 0.5


def _status_to_confidence(status: str) -> float:
    return _STATUS_CONFIDENCE.get((status or "").lower(), _DEFAULT_CONFIDENCE)


class URLhausWorker(BaseFeedWorker):
    """Feed adapter for the URLhaus recent malicious URL feed."""

    FEED_NAME = "urlhaus"

    def is_configured(self) -> bool:
        # URLhaus requires no API key — always ready to run
        return True

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        response = await self._post(
            _RECENT_URLS_ENDPOINT,
            data={"limit": _FETCH_LIMIT},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        body = response.json()
        status = body.get("query_status", "")
        if status != "ok":
            raise RuntimeError(
                f"URLhaus returned unexpected query_status: '{status}'"
            )

        records: list[dict[str, Any]] = body.get("urls", [])
        logger.info("URLhaus returned %d records", len(records))

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
    """Map one URLhaus recent-URL entry to NormalizedIOC.

    Returns None if the record has no URL (malformed entry).
    """
    url = record.get("url", "").strip()
    if not url:
        return None

    status: str = record.get("url_status", "")
    raw_confidence = _status_to_confidence(status)

    # tags may be a list or null
    raw_tags = record.get("tags")
    tags: list[str] = raw_tags if isinstance(raw_tags, list) else []

    return NormalizedIOC(
        value=url,
        ioc_type=IOCType.url,
        raw_confidence=raw_confidence,
        feed_name="urlhaus",
        feed_run_id=feed_run_id,
        raw_payload=record,
        metadata={
            "url_status": status,
            "host": record.get("host"),
            "threat": record.get("threat"),
            "tags": tags,
            "urlhaus_reference": record.get("urlhaus_reference"),
            "date_added": record.get("date_added"),
        },
    )
