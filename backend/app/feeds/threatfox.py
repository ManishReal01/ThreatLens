"""ThreatFox feed adapter (abuse.ch).

API endpoint: POST https://threatfox-api.abuse.ch/api/v1/
Auth:         Header "Auth-Key: <key>"  (same abuse.ch key as URLhaus)
Request body: {"query": "get_iocs", "days": 7}

Response shape::

    {
        "query_status": "ok",
        "data": [
            {
                "id": "1234",
                "ioc": "192.0.2.1:4444",
                "ioc_type": "ip:port",
                "ioc_type_desc": "...",
                "threat_type": "botnet_cc",
                "threat_type_desc": "...",
                "malware": "Win.Trojan.Mirai",
                "malware_printable": "Mirai",
                "malware_alias": "...",
                "malware_malpedia": "...",
                "confidence_level": 75,
                "first_seen": "2024-01-01 00:00:00 UTC",
                "last_seen": null,
                "reporter": "...",
                "reference": "",
                "tags": ["mirai"]
            },
            ...
        ]
    }

ioc_type values: "ip:port", "domain", "url", "md5_hash", "sha256_hash"
confidence_level: integer 0-100 → normalised to 0.0-1.0
"""

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_THREATFOX_ENDPOINT = "https://threatfox-api.abuse.ch/api/v1/"
_MAX_IOCS_PER_RUN = 1000

# Map ThreatFox ioc_type strings to our IOCType enum
_IOC_TYPE_MAP: dict[str, IOCType] = {
    "ip:port":    IOCType.ip,
    "domain":     IOCType.domain,
    "url":        IOCType.url,
    "md5_hash":   IOCType.hash_md5,
    "sha256_hash": IOCType.hash_sha256,
}


class ThreatFoxWorker(BaseFeedWorker):
    """Feed adapter for the ThreatFox recent IOC feed."""

    FEED_NAME = "threatfox"

    def is_configured(self) -> bool:
        return bool(self.settings.urlhaus_api_key)

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        response = await self._post(
            _THREATFOX_ENDPOINT,
            json={"query": "get_iocs", "days": 7},
            headers={"Auth-Key": self.settings.urlhaus_api_key},
        )

        body = response.json()
        query_status = body.get("query_status", "")
        if query_status not in ("ok", "no_results"):
            raise RuntimeError(
                f"ThreatFox returned unexpected query_status: '{query_status}'"
            )

        records: list[dict[str, Any]] = body.get("data") or []
        records = records[:_MAX_IOCS_PER_RUN]
        logger.info("ThreatFox returned %d records (capped at %d)", len(records), _MAX_IOCS_PER_RUN)

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
    """Map one ThreatFox IOC entry to NormalizedIOC.

    Returns None if the record has an unsupported ioc_type or missing value.
    """
    raw_value: str = (record.get("ioc") or "").strip()
    if not raw_value:
        return None

    ioc_type_str: str = (record.get("ioc_type") or "").lower()
    ioc_type = _IOC_TYPE_MAP.get(ioc_type_str)
    if ioc_type is None:
        logger.debug("ThreatFox: skipping unsupported ioc_type '%s'", ioc_type_str)
        return None

    # Strip port from ip:port values (e.g. "192.0.2.1:4444" → "192.0.2.1")
    value = raw_value
    if ioc_type_str == "ip:port" and ":" in raw_value:
        value = raw_value.rsplit(":", 1)[0]

    # confidence_level is 0-100; normalise to 0.0-1.0
    confidence_level = record.get("confidence_level")
    if isinstance(confidence_level, (int, float)) and confidence_level > 0:
        raw_confidence = min(confidence_level / 100.0, 1.0)
    else:
        raw_confidence = 0.5

    tags = record.get("tags")
    tags_list: list[str] = tags if isinstance(tags, list) else []

    return NormalizedIOC(
        value=value,
        ioc_type=ioc_type,
        raw_confidence=raw_confidence,
        feed_name="threatfox",
        feed_run_id=feed_run_id,
        raw_payload=record,
        metadata={
            "threat_type":       record.get("threat_type"),
            "malware":           record.get("malware_printable") or record.get("malware"),
            "malware_family":    record.get("malware"),
            "confidence_level":  confidence_level,
            "tags":              tags_list,
            "first_seen":        record.get("first_seen"),
            "reporter":          record.get("reporter"),
            "threatfox_id":      record.get("id"),
        },
    )
