"""VirusTotal Free API enrichment adapter.

Endpoints:
    GET https://www.virustotal.com/api/v3/ip_addresses/{ip}
    GET https://www.virustotal.com/api/v3/files/{hash}
    GET https://www.virustotal.com/api/v3/urls/{url_id}

Auth:       Header "x-apikey: <VT_API_KEY>"
Rate limit: 4 requests/minute on free tier → 16-second sleep between calls

ENRICHMENT feed — queries existing IOCs in the DB that have not yet been
VirusTotal-checked and enriches them with multi-engine detection data.

Strategy:
    1. Fetch up to 20 IOCs (ip, hash_md5, hash_sha1, hash_sha256, url)
       ordered by severity DESC where metadata->>'vt_checked' IS NULL
    2. Call the appropriate VT endpoint per IOC type
    3. Extract last_analysis_stats: {malicious, suspicious, harmless, undetected}
    4. Compute vt_score = malicious / (malicious + harmless + undetected)
    5. If malicious > 5 engines → boost severity by 15%
    6. Store full stats in metadata["virustotal"]
    7. Mark vt_checked=True only on success or 404 (NOT on 429 — retry next run)

URL encoding: VT URL endpoint requires base64url-encoded URL without padding.

Rate limit handling:
    - 429 → do NOT mark vt_checked; IOC will be retried on next run
    - 404 → mark vt_checked=True, no enrichment data (IOC not in VT)
    - Other errors → mark vt_checked=True with error note (avoid infinite retry)

Batch size of 20 keeps each run under ~5 minutes, safe for uvicorn --reload.
"""

import asyncio
import base64
import logging
from typing import Any, Union

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.models.ioc import IOCModel

logger = logging.getLogger(__name__)

_VT_BASE = "https://www.virustotal.com/api/v3"
_BATCH_SIZE = 20           # 20 IOCs × 16s sleep = ~5 min per run — safe for uvicorn reload
_SLEEP_BETWEEN_CALLS = 16  # slightly over 15s to stay safely under 4 req/min

_VT_SUPPORTED_TYPES = {"ip", "hash_md5", "hash_sha1", "hash_sha256", "url"}

# Sentinel: returned by _lookup_ioc when VT rate-limits us.
# IOC must NOT be marked vt_checked in this case — it needs to retry next run.
_RATE_LIMITED = object()


class VirusTotalWorker(BaseFeedWorker):
    """Enrichment adapter for the VirusTotal Free API."""

    FEED_NAME = "virustotal"

    def is_configured(self) -> bool:
        return bool(self.settings.vt_api_key)

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        # Query unchecked IOCs ordered by severity (highest priority first)
        result = await session.execute(
            select(IOCModel)
            .where(
                IOCModel.type.in_(list(_VT_SUPPORTED_TYPES)),
                or_(
                    IOCModel.metadata_.is_(None),
                    IOCModel.metadata_["vt_checked"].is_(None),
                ),
            )
            .order_by(IOCModel.severity.desc())
            .limit(_BATCH_SIZE)
        )
        iocs = result.scalars().all()
        logger.info("VirusTotal: %d unchecked IOCs to enrich", len(iocs))

        fetched = updated = 0
        for idx, ioc in enumerate(iocs):
            if idx > 0:
                # Rate limit: 4 req/min on free tier
                await asyncio.sleep(_SLEEP_BETWEEN_CALLS)

            vt_result = await self._lookup_ioc(ioc.value, ioc.type)
            fetched += 1

            if vt_result is _RATE_LIMITED:
                # Don't mark vt_checked — IOC will be retried on next run
                logger.info(
                    "VirusTotal rate limit hit — %s (%s) will be retried next run",
                    ioc.value, ioc.type,
                )
                continue

            current_meta = dict(ioc.metadata_ or {})
            current_meta["vt_checked"] = True

            if isinstance(vt_result, dict):
                stats = (
                    vt_result.get("data", {})
                    .get("attributes", {})
                    .get("last_analysis_stats", {})
                )
                malicious = stats.get("malicious", 0)
                suspicious = stats.get("suspicious", 0)
                harmless = stats.get("harmless", 0)
                undetected = stats.get("undetected", 0)

                total = malicious + harmless + undetected
                vt_score = malicious / total if total > 0 else 0.0

                current_meta["virustotal"] = {
                    "malicious": malicious,
                    "suspicious": suspicious,
                    "harmless": harmless,
                    "undetected": undetected,
                    "vt_score": round(vt_score, 4),
                }

                if malicious > 5:
                    current_severity = float(ioc.severity or 5.0)
                    ioc.severity = round(min(10.0, current_severity * 1.15), 2)
                    logger.debug(
                        "VirusTotal %s: %d malicious engines — severity %.2f → %.2f",
                        ioc.value, malicious, current_severity, ioc.severity,
                    )

            ioc.metadata_ = current_meta
            updated += 1

        if iocs:
            await session.flush()

        return fetched, 0, updated

    async def _lookup_ioc(
        self,
        value: str,
        ioc_type: str,
    ) -> Union[dict[str, Any], None, object]:
        """Call the appropriate VirusTotal endpoint for the given IOC type.

        Returns:
            dict        — successful enrichment data
            None        — IOC not found (404) or non-retryable error
            _RATE_LIMITED sentinel — HTTP 429; caller must NOT mark vt_checked

        Uses the raw HTTP client directly (not _get) to avoid retry
        overhead on normal 404/429 responses.
        """
        if ioc_type == "ip":
            url = f"{_VT_BASE}/ip_addresses/{value}"
        elif ioc_type in ("hash_md5", "hash_sha1", "hash_sha256"):
            url = f"{_VT_BASE}/files/{value}"
        elif ioc_type == "url":
            url_id = base64.urlsafe_b64encode(value.encode()).rstrip(b"=").decode()
            url = f"{_VT_BASE}/urls/{url_id}"
        else:
            logger.warning("VirusTotal: unsupported IOC type %s", ioc_type)
            return None

        try:
            resp = await self.client.get(
                url,
                headers={"x-apikey": self.settings.vt_api_key},
            )
            if resp.status_code == 404:
                logger.debug("VirusTotal: %s not found", value)
                return None
            if resp.status_code == 429:
                logger.warning(
                    "VirusTotal rate limit (429) for %s — will retry on next run", value
                )
                return _RATE_LIMITED
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.warning("VirusTotal lookup failed for %s (%s): %s", value, ioc_type, exc)
            return None
