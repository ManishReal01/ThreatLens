"""SSL Blacklist (SSLBL) feed adapter (abuse.ch malicious SSL certificates).

Download URL: https://sslbl.abuse.ch/blacklist/sslblacklist.csv
Auth:         None required
Format:       CSV (comment lines prefixed with #)

CSV format (after stripping comment header)::

    Listingdate,SHA1,Listingreason
    2024-01-01 00:00:00,AABBCCDD...,Dridex C2

Note: the JSON endpoint (sslblacklist.json) does not exist — CSV is the only
machine-readable format offered by SSLBL.
"""

import csv
import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_ENDPOINT = "https://sslbl.abuse.ch/blacklist/sslblacklist.csv"
_CONFIDENCE = 0.88


class SSLBLWorker(BaseFeedWorker):
    """Feed adapter for the SSL Blacklist (SSLBL) malicious certificate feed."""

    FEED_NAME = "sslbl"

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
        logger.info("SSLBL returned %d records", len(records))

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
    """Map one SSLBL CSV row to NormalizedIOC.

    CSV columns: listing_date, sha1_fingerprint, reason
    """
    if len(row) < 2:
        return None

    sha1 = row[1].strip()
    if not sha1:
        return None

    listing_date = row[0].strip() if len(row) > 0 else None
    reason = row[2].strip() if len(row) > 2 else None

    return NormalizedIOC(
        value=sha1,
        ioc_type=IOCType.hash_sha1,
        raw_confidence=_CONFIDENCE,
        feed_name="sslbl",
        feed_run_id=feed_run_id,
        raw_payload={"sha1_fingerprint": sha1, "listing_date": listing_date, "reason": reason},
        metadata={
            "reason": reason,
            "listing_date": listing_date,
        },
    )
