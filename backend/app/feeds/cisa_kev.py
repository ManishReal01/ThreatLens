"""CISA Known Exploited Vulnerabilities (KEV) feed adapter.

API endpoint: GET https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
Auth:         None — public JSON feed
No pagination — the full catalogue is returned in one response.

Response shape::

    {
        "title": "CISA Catalog of Known Exploited Vulnerabilities",
        "catalogVersion": "2024.01.01",
        "dateReleased": "2024-01-01T00:00:00Z",
        "count": 1234,
        "vulnerabilities": [
            {
                "cveID": "CVE-2021-44228",
                "vendorProject": "Apache",
                "product": "Log4j2",
                "vulnerabilityName": "Apache Log4j2 Remote Code Execution Vulnerability",
                "dateAdded": "2021-12-10",
                "shortDescription": "...",
                "requiredAction": "...",
                "dueDate": "2021-12-24",
                "knownRansomwareCampaignUse": "Known",
                "notes": ""
            },
            ...
        ]
    }

Confidence is fixed at 0.9 — CISA KEV entries are confirmed actively exploited in the wild.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_CONFIDENCE = 0.9


class CISAKEVWorker(BaseFeedWorker):
    """Feed adapter for the CISA Known Exploited Vulnerabilities catalogue."""

    FEED_NAME = "cisa_kev"

    def is_configured(self) -> bool:
        # No API key required — always enabled
        return True

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        response = await self._get(_KEV_URL)
        body = response.json()

        vulnerabilities: list[dict[str, Any]] = body.get("vulnerabilities") or []
        logger.info("CISA KEV returned %d entries", len(vulnerabilities))

        fetched = new = updated = 0
        for entry in vulnerabilities:
            ioc = _map_entry(entry, feed_run_id)
            if ioc is None:
                continue
            _, is_new = await upsert_ioc(session, ioc)
            fetched += 1
            if is_new:
                new += 1
            else:
                updated += 1

        return fetched, new, updated


def _map_entry(entry: dict[str, Any], feed_run_id: str) -> Optional[NormalizedIOC]:
    """Map one KEV vulnerability entry to NormalizedIOC.

    Returns None if cveID is missing or empty.
    """
    cve_id: str = (entry.get("cveID") or "").strip()
    if not cve_id:
        return None

    # Parse dateAdded (YYYY-MM-DD) for first_seen/last_seen metadata
    date_added_str: str = entry.get("dateAdded") or ""
    try:
        date_added = datetime.strptime(date_added_str, "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
        date_added_iso = date_added.isoformat()
    except (ValueError, TypeError):
        date_added_iso = date_added_str

    return NormalizedIOC(
        value=cve_id,
        ioc_type=IOCType.cve,
        raw_confidence=_CONFIDENCE,
        feed_name="cisa_kev",
        feed_run_id=feed_run_id,
        raw_payload=entry,
        metadata={
            "vendor_project": entry.get("vendorProject"),
            "product": entry.get("product"),
            "vulnerability_name": entry.get("vulnerabilityName"),
            "short_description": entry.get("shortDescription"),
            "required_action": entry.get("requiredAction"),
            "date_added": date_added_iso,
            "due_date": entry.get("dueDate"),
            "known_ransomware_use": entry.get("knownRansomwareCampaignUse"),
            "first_seen": date_added_iso,
            "last_seen": date_added_iso,
        },
    )
