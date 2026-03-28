"""Correlation signal detectors.

Each detector is an async function that queries the DB and returns a list of
(ioc_id_a, ioc_id_b, signal_name, weight) tuples representing potential edges
in the correlation graph.  All functions must handle an empty DB gracefully
(return [] rather than raising).
"""

import ipaddress
import itertools
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# (ioc_a_id_str, ioc_b_id_str, signal_name, weight)
Edge = Tuple[str, str, str, float]

_GENERIC_MALWARE_FAMILIES = {
    "trojan", "malware", "rat", "backdoor", "spyware", "adware",
    "generic", "unknown", "virus", "worm", "ransomware", "downloader",
    "dropper", "miner", "coinminer", "pua", "pup",
}

# How many IOCs per group we allow before capping — prevents O(n²) explosion
_MAX_SUBNET_GROUP = 100
_MAX_COOCCURRENCE_GROUP = 50
_MAX_TEMPORAL_GROUP = 30
_MAX_MALWARE_GROUP = 20   # keep edges manageable; families with thousands of IOCs create noise
_MAX_TTP_GROUP = 30       # per threat actor — actors with thousands of IOCs would explode BFS


# ---------------------------------------------------------------------------
# Signal 1 — IP Subnet /24 clustering  (weight: 0.7)
# ---------------------------------------------------------------------------

async def signal_subnet_clustering(session: AsyncSession) -> List[Edge]:
    """Connect IPs that share the same /24 subnet.

    Quality filters applied:
    - Skip subnets where ALL IPs came from a single feed (no cross-feed signal).
    - Skip subnets with >50 IPs (too large = noise, not a real campaign).
    """
    rows = await session.execute(
        text(
            "SELECT i.id::text, i.value, s.feed_name "
            "FROM iocs i "
            "JOIN ioc_sources s ON s.ioc_id = i.id "
            "WHERE i.type = 'ip' AND i.is_active = true"
        )
    )
    records = rows.fetchall()

    # Group by /24 subnet: key -> list of (ioc_id, feed_name)
    subnet_groups: dict[bytes, list[tuple[str, str]]] = defaultdict(list)
    seen_per_subnet: dict[bytes, set[str]] = defaultdict(set)  # deduplicate ioc_ids
    for row_id, value, feed_name in records:
        try:
            addr = ipaddress.ip_address(value)
            if isinstance(addr, ipaddress.IPv6Address):
                if addr.ipv4_mapped:
                    addr = addr.ipv4_mapped
                else:
                    continue  # skip pure IPv6 for subnet clustering
            # Key = first 3 octets — strictly /24
            key = addr.packed[:3]
            if row_id not in seen_per_subnet[key]:
                seen_per_subnet[key].add(row_id)
                subnet_groups[key].append((row_id, feed_name))
        except ValueError:
            continue

    edges: List[Edge] = []
    for key, entries in subnet_groups.items():
        if len(entries) < 2:
            continue
        # Skip subnets that are too large (noise)
        if len(entries) > 50:
            logger.debug(
                "subnet_clustering: skipping /24 %s — %d IPs exceeds max 50",
                ".".join(str(b) for b in key),
                len(entries),
            )
            continue
        # Skip if all IPs came from a single feed (single-feed clusters are not meaningful)
        feeds_in_subnet = {feed for _, feed in entries}
        if len(feeds_in_subnet) < 2:
            continue
        ids = [ioc_id for ioc_id, _ in entries]
        density_bonus = min(0.15, len(ids) / 100)
        weight = round(0.7 + density_bonus, 3)
        for a, b in itertools.combinations(ids, 2):
            edges.append((a, b, "subnet_clustering", weight))

    logger.info("subnet_clustering: %d edges from %d IPs", len(edges), len(seen_per_subnet))
    return edges


# ---------------------------------------------------------------------------
# Signal 2 — Co-occurrence (shared feed_run_id)  (weight: 0.9)
# ---------------------------------------------------------------------------

async def signal_cooccurrence(session: AsyncSession) -> List[Edge]:
    """Connect IOCs that appeared in the same feed run."""
    rows = await session.execute(
        text(
            "SELECT ioc_id::text, feed_run_id::text "
            "FROM ioc_sources "
            "WHERE feed_run_id IS NOT NULL"
        )
    )
    records = rows.fetchall()

    # Group by feed_run_id
    run_groups: dict[str, list[str]] = defaultdict(list)
    for ioc_id, run_id in records:
        run_groups[run_id].append(ioc_id)

    # Count shared runs between IOC pairs
    pair_runs: dict[tuple[str, str], int] = defaultdict(int)
    for run_id, ids in run_groups.items():
        if len(ids) < 2:
            continue
        # Deduplicate within run
        unique_ids = list(dict.fromkeys(ids))[:_MAX_COOCCURRENCE_GROUP]
        for a, b in itertools.combinations(unique_ids, 2):
            key = (min(a, b), max(a, b))
            pair_runs[key] += 1

    edges: List[Edge] = []
    for (a, b), shared_count in pair_runs.items():
        # Require co-occurrence in ≥2 separate feed runs to avoid pairing every
        # IOC in the same batch (same-batch co-occurrence is not a campaign signal).
        if shared_count < 2:
            continue
        # More shared runs → higher confidence, capped at 0.9
        weight = min(0.9, 0.6 + shared_count * 0.1)
        edges.append((a, b, "cooccurrence", round(weight, 3)))

    logger.info("cooccurrence: %d edges across %d feed runs", len(edges), len(run_groups))
    return edges


# ---------------------------------------------------------------------------
# Signal 3 — Malware family  (weight: 0.85)
# ---------------------------------------------------------------------------

def _extract_malware_family(raw_payload: dict) -> Optional[str]:
    """Extract malware family name from raw_payload across feed formats."""
    if not raw_payload:
        return None

    # ThreatFox: {"malware": "AgentTesla"}
    val = raw_payload.get("malware")
    if val and isinstance(val, str):
        return val.strip().lower()

    # MalwareBazaar: {"tags": ["AgentTesla", "Stealer"]} — use first tag
    tags = raw_payload.get("tags")
    if tags and isinstance(tags, list) and tags:
        return str(tags[0]).strip().lower()

    # OTX / generic: {"malware_family": "Mirai"}
    val = raw_payload.get("malware_family")
    if val and isinstance(val, str):
        return val.strip().lower()

    # Feodo: {"malware": "Heodo"}
    val = raw_payload.get("malware_family_name")
    if val and isinstance(val, str):
        return val.strip().lower()

    return None


async def signal_malware_family(session: AsyncSession) -> List[Edge]:
    """Connect IOCs that share the same malware family name."""
    rows = await session.execute(
        text(
            "SELECT ioc_id::text, raw_payload "
            "FROM ioc_sources "
            "WHERE raw_payload IS NOT NULL"
        )
    )
    records = rows.fetchall()

    family_groups: dict[str, list[str]] = defaultdict(list)
    for ioc_id, payload in records:
        if not isinstance(payload, dict):
            continue
        family = _extract_malware_family(payload)
        if not family:
            continue
        if family in _GENERIC_MALWARE_FAMILIES:
            continue
        family_groups[family].append(ioc_id)

    edges: List[Edge] = []
    for family, ids in family_groups.items():
        if len(ids) < 2:
            continue
        # Deduplicate
        unique_ids = list(dict.fromkeys(ids))[:_MAX_MALWARE_GROUP]
        for a, b in itertools.combinations(unique_ids, 2):
            edges.append((a, b, "malware_family", 0.85))

    logger.info(
        "malware_family: %d edges across %d families", len(edges), len(family_groups)
    )
    return edges


# ---------------------------------------------------------------------------
# Signal 4 — Temporal clustering (±3h window, same feed)  (weight: 0.5)
# ---------------------------------------------------------------------------

async def signal_temporal_clustering(session: AsyncSession) -> List[Edge]:
    """Connect IOCs ingested within the same 3-hour window from the same feed."""
    rows = await session.execute(
        text(
            "SELECT ioc_id::text, feed_name, ingested_at "
            "FROM ioc_sources "
            "ORDER BY feed_name, ingested_at"
        )
    )
    records = rows.fetchall()

    # Group by feed_name, then sliding 3h windows
    feed_records: dict[str, list[tuple[str, datetime]]] = defaultdict(list)
    for ioc_id, feed_name, ingested_at in records:
        if ingested_at is None:
            continue
        # Ensure tz-aware
        if ingested_at.tzinfo is None:
            ingested_at = ingested_at.replace(tzinfo=timezone.utc)
        feed_records[feed_name].append((ioc_id, ingested_at))

    window = timedelta(hours=3)
    edges: List[Edge] = []

    for feed_name, items in feed_records.items():
        items.sort(key=lambda x: x[1])
        n = len(items)
        i = 0
        while i < n:
            window_start = items[i][1]
            window_end = window_start + window
            window_ids: list[str] = []
            j = i
            while j < n and items[j][1] <= window_end:
                window_ids.append(items[j][0])
                j += 1
            if len(window_ids) >= 2:
                capped = window_ids[:_MAX_TEMPORAL_GROUP]
                unique_ids = list(dict.fromkeys(capped))
                for a, b in itertools.combinations(unique_ids, 2):
                    edges.append((a, b, "temporal_clustering", 0.5))
            # Advance to next non-overlapping window
            i = j if j > i else i + 1

    logger.info("temporal_clustering: %d edges", len(edges))
    return edges


# ---------------------------------------------------------------------------
# Signal 5 — TTP overlap (shared threat actor + has techniques)  (weight: 0.8)
# ---------------------------------------------------------------------------

async def signal_ttp_overlap(session: AsyncSession) -> List[Edge]:
    """Connect IOCs linked to the same threat actor (where actor has techniques)."""
    # Get all IOC→actor links
    links_rows = await session.execute(
        text(
            "SELECT l.ioc_id::text, l.threat_actor_id::text, ta.techniques "
            "FROM threat_actor_ioc_links l "
            "JOIN threat_actors ta ON ta.id = l.threat_actor_id"
        )
    )
    links = links_rows.fetchall()

    # Group by threat_actor_id, keeping only actors with ≥1 technique
    actor_groups: dict[str, list[str]] = defaultdict(list)
    for ioc_id, actor_id, techniques in links:
        if not techniques or not isinstance(techniques, list) or len(techniques) == 0:
            continue
        actor_groups[actor_id].append(ioc_id)

    edges: List[Edge] = []
    for actor_id, ids in actor_groups.items():
        if len(ids) < 2:
            continue
        unique_ids = list(dict.fromkeys(ids))[:_MAX_TTP_GROUP]
        for a, b in itertools.combinations(unique_ids, 2):
            edges.append((a, b, "ttp_overlap", 0.8))

    logger.info(
        "ttp_overlap: %d edges across %d actors", len(edges), len(actor_groups)
    )
    return edges
