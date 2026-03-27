"""Feodo Tracker feed adapter (abuse.ch botnet C2 IPs).

CSV endpoint: GET https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.csv
Auth:         None required
Rate limits:  No documented rate limit

Uses the "aggressive" blocklist which includes all ever-observed C2 IPs
(~8000 entries), not just the ~5 currently-active ones in ipblocklist.json.

CSV format (after stripping # comment lines)::

    "first_seen_utc","dst_ip","dst_port","c2_status","last_online","malware"
    "2021-01-17 07:30:05","67.213.75.205","443","offline","2021-09-08","Dridex"
"""

import csv
import io
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_ENDPOINT = "https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.csv"
_CONFIDENCE = 0.85

# Column indices (0-based) after csv.reader strips quotes
_COL_FIRST_SEEN = 0
_COL_IP = 1
_COL_PORT = 2
_COL_STATUS = 3
_COL_LAST_ONLINE = 4
_COL_MALWARE = 5


class FeodoTrackerWorker(BaseFeedWorker):
    """Feed adapter for the Feodo Tracker botnet C2 IP blocklist (aggressive)."""

    FEED_NAME = "feodotracker"

    def is_configured(self) -> bool:
        return True  # no API key required

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        response = await self._get(_ENDPOINT)

        # Strip comment lines (start with #) then parse CSV
        data_lines = [
            line for line in response.text.splitlines()
            if line.strip() and not line.startswith("#")
        ]
        reader = csv.reader(data_lines)
        records = list(reader)

        # Skip header row ("first_seen_utc","dst_ip",...)
        if records and records[0][0].strip().lower() in ("first_seen_utc", "first_seen"):
            records = records[1:]

        logger.info("Feodo Tracker returned %d records", len(records))

        fetched = new = updated = 0
        for row in records:
            ioc = _map_row(row, feed_run_id)
            if ioc is None:
                continue
            _, is_new = await upsert_ioc(session, ioc)
            fetched += 1
            if is_new:
                new += 1
            else:
                updated += 1

        return fetched, new, updated


def _map_row(row: list[str], feed_run_id: str) -> Optional[NormalizedIOC]:
    if len(row) < 2:
        return None

    ip = row[_COL_IP].strip()
    if not ip:
        return None

    return NormalizedIOC(
        value=ip,
        ioc_type=IOCType.ip,
        raw_confidence=_CONFIDENCE,
        feed_name="feodotracker",
        feed_run_id=feed_run_id,
        raw_payload={"row": row},
        metadata={
            "malware": row[_COL_MALWARE].strip() if len(row) > _COL_MALWARE else None,
            "port": row[_COL_PORT].strip() if len(row) > _COL_PORT else None,
            "status": row[_COL_STATUS].strip() if len(row) > _COL_STATUS else None,
            "first_seen": row[_COL_FIRST_SEEN].strip() if len(row) > _COL_FIRST_SEEN else None,
            "last_online": row[_COL_LAST_ONLINE].strip() if len(row) > _COL_LAST_ONLINE else None,
        },
    )
