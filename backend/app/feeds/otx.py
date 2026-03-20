"""AlienVault OTX (Open Threat Exchange) feed adapter.

API endpoint: GET https://otx.alienvault.com/api/v1/pulses/subscribed
Auth header:  X-OTX-API-KEY: {otx_api_key}
Delta:        modified_since={ISO8601} — fetched from the last successful feed_run row

Pagination response shape::

    {
        "count": 1000,
        "next": "https://otx.alienvault.com/api/v1/pulses/subscribed?page=2&...",
        "previous": null,
        "results": [
            {
                "id": "abc123",
                "name": "Pulse Name",
                "description": "...",
                "modified": "2024-01-01T12:00:00",
                "indicators": [
                    {
                        "id": 1,
                        "type": "IPv4",
                        "indicator": "1.2.3.4",
                        "description": "C2 server",
                        "created": "2024-01-01T00:00:00"
                    },
                    ...
                ]
            }
        ]
    }

Supported indicator types (OTX type → IOCType):
  IPv4          → ip
  IPv6          → ip
  domain        → domain
  hostname      → domain
  URL           → url
  FileHash-MD5  → hash_md5
  FileHash-SHA1 → hash_sha1
  FileHash-SHA256 → hash_sha256

Unsupported types are silently skipped (CIDR, mutex, CVE, etc.).

Co-occurrence: all IOC IDs within a single pulse are linked with
'observed_with' edges at confidence 0.7.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.models.feed_run import FeedRunModel
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import infer_cooccurrence_relationships, upsert_ioc

logger = logging.getLogger(__name__)

_SUBSCRIBED_URL = "https://otx.alienvault.com/api/v1/pulses/subscribed"

# OTX indicator type string → canonical IOCType
_OTX_TYPE_MAP: dict[str, IOCType] = {
    "IPv4": IOCType.ip,
    "IPv6": IOCType.ip,
    "domain": IOCType.domain,
    "hostname": IOCType.domain,
    "URL": IOCType.url,
    "FileHash-MD5": IOCType.hash_md5,
    "FileHash-SHA1": IOCType.hash_sha1,
    "FileHash-SHA256": IOCType.hash_sha256,
}

# OTX does not provide per-indicator confidence scores on the free API
_DEFAULT_CONFIDENCE = 0.7


class OTXWorker(BaseFeedWorker):
    """Feed adapter for AlienVault OTX subscribed pulses (delta mode)."""

    FEED_NAME = "otx"

    def is_configured(self) -> bool:
        return bool(self.settings.otx_api_key)

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        modified_since = await self._get_last_sync(session)
        logger.info(
            "OTX delta since: %s",
            modified_since.isoformat() if modified_since else "beginning (first run)",
        )

        fetched = new = updated = 0
        next_url: Optional[str] = _SUBSCRIBED_URL
        first_page = True

        while next_url:
            params: Optional[dict[str, Any]] = None
            if first_page:
                params = {"limit": self.settings.otx_pulse_limit}
                if modified_since:
                    params["modified_since"] = modified_since.strftime(
                        "%Y-%m-%dT%H:%M:%S"
                    )
                first_page = False

            response = await self._get(
                next_url,
                headers={"X-OTX-API-KEY": self.settings.otx_api_key},
                params=params,
            )
            body = response.json()
            pulses: list[dict[str, Any]] = body.get("results", [])
            logger.info(
                "OTX page: %d pulses (total count=%s)", len(pulses), body.get("count")
            )

            for pulse in pulses:
                pulse_new, pulse_updated = await self._process_pulse(
                    session, pulse, feed_run_id
                )
                indicator_count = len(pulse.get("indicators", []))
                fetched += indicator_count
                new += pulse_new
                updated += pulse_updated

            next_url = body.get("next")  # None stops the loop

        return fetched, new, updated

    async def _process_pulse(
        self,
        session: AsyncSession,
        pulse: dict[str, Any],
        feed_run_id: str,
    ) -> tuple[int, int]:
        """Upsert all indicators in one pulse and infer co-occurrence edges.

        Returns (new, updated) counts.
        """
        pulse_name: str = pulse.get("name", "")
        indicators: list[dict[str, Any]] = pulse.get("indicators", [])
        new = updated = 0
        ioc_ids: list[str] = []

        for indicator in indicators:
            ioc = _map_indicator(indicator, feed_run_id, pulse_name)
            if ioc is None:
                continue
            ioc_id, is_new = await upsert_ioc(session, ioc)
            ioc_ids.append(ioc_id)
            if is_new:
                new += 1
            else:
                updated += 1

        # Build co-occurrence graph for all IOCs that appeared in this pulse
        if len(ioc_ids) >= 2:
            await infer_cooccurrence_relationships(
                session=session,
                ioc_ids=ioc_ids,
                inferred_by="otx",
                confidence=0.7,
            )

        return new, updated

    async def _get_last_sync(self, session: AsyncSession) -> Optional[datetime]:
        """Return the timestamp of the most recent successful OTX feed run."""
        result = await session.execute(
            select(FeedRunModel.last_successful_sync)
            .where(FeedRunModel.feed_name == self.FEED_NAME)
            .where(FeedRunModel.status == "success")
            .order_by(FeedRunModel.started_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


def _map_indicator(
    indicator: dict[str, Any],
    feed_run_id: str,
    pulse_name: str,
) -> Optional[NormalizedIOC]:
    """Map one OTX pulse indicator to NormalizedIOC.

    Returns None for unsupported indicator types (CIDR, mutex, CVE, email, etc.)
    or empty indicator strings.
    """
    otx_type: str = indicator.get("type", "")
    ioc_type = _OTX_TYPE_MAP.get(otx_type)
    if ioc_type is None:
        return None  # silently skip unsupported types

    value: str = indicator.get("indicator", "").strip()
    if not value:
        return None

    return NormalizedIOC(
        value=value,
        ioc_type=ioc_type,
        raw_confidence=_DEFAULT_CONFIDENCE,
        feed_name="otx",
        feed_run_id=feed_run_id,
        raw_payload=indicator,
        metadata={
            "pulse_name": pulse_name,
            "otx_type": otx_type,
            "description": indicator.get("description", ""),
            "created": indicator.get("created", ""),
        },
    )
