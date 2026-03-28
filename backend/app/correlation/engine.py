"""Correlation engine — builds campaign clusters from signal edges.

Usage:
    engine = CorrelationEngine()
    result = await engine.run(session)
    print(result.campaigns_found, result.iocs_clustered)
"""

import hashlib
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.correlation.signals import (
    signal_cooccurrence,
    signal_malware_family,
    signal_subnet_clustering,
    signal_temporal_clustering,
    signal_ttp_overlap,
)

logger = logging.getLogger(__name__)


@dataclass
class CampaignRunResult:
    campaigns_found: int = 0
    iocs_clustered: int = 0
    campaigns_archived: int = 0
    signal_edge_counts: dict[str, int] = field(default_factory=dict)
    duration_s: float = 0.0


class CorrelationEngine:
    """Detects IOC clusters and persists them as campaign records."""

    def __init__(
        self,
        min_cluster_size: int = 5,
        min_confidence: float = 0.4,
        max_cluster_size: int = 500,
    ):
        self.min_cluster_size = min_cluster_size
        self.min_confidence = min_confidence
        self.max_cluster_size = max_cluster_size

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(self, session: AsyncSession) -> CampaignRunResult:
        t0 = time.monotonic()
        result = CampaignRunResult()

        # Disable statement timeout for this session — Supabase applies a default
        # timeout that kills long bulk operations (same pattern as feed workers).
        await session.execute(text("SET statement_timeout = 0"))
        await session.execute(text("SET lock_timeout = 0"))

        logger.info("CorrelationEngine starting (min_cluster=%d, min_confidence=%.2f)",
                    self.min_cluster_size, self.min_confidence)

        # 1. Run signals sequentially — asyncpg doesn't allow concurrent
        # operations on the same connection/session.
        signal_funcs = [
            signal_subnet_clustering,
            signal_cooccurrence,
            signal_malware_family,
            signal_temporal_clustering,
            signal_ttp_overlap,
        ]
        signal_results = []
        for fn in signal_funcs:
            try:
                signal_results.append(await fn(session))
            except Exception as exc:  # noqa: BLE001
                signal_results.append(exc)

        signal_names = [
            "subnet_clustering", "cooccurrence", "malware_family",
            "temporal_clustering", "ttp_overlap",
        ]

        # 2. Combine edges — probabilistic OR weight across signals
        # edge_signals: (a,b) -> {signal_name: weight}
        edge_signals: dict[tuple[str, str], dict[str, float]] = defaultdict(dict)

        for name, raw in zip(signal_names, signal_results):
            if isinstance(raw, Exception):
                logger.error("Signal %s failed: %s", name, raw)
                result.signal_edge_counts[name] = -1
                continue
            count = 0
            for a, b, sig_name, w in raw:
                # Canonical ordering so (a,b) == (b,a)
                key = (min(a, b), max(a, b))
                edge_signals[key][sig_name] = max(edge_signals[key].get(sig_name, 0), w)
                count += 1
            result.signal_edge_counts[name] = count
            logger.info("Signal %s contributed %d edges", name, count)

        # 3. Compute combined weight: 1 - Π(1 - w_i)  (probabilistic OR)
        # Only keep edges confirmed by ≥2 different signals — single-signal edges
        # are too noisy and create spurious BFS bridges between unrelated clusters.
        edges: dict[tuple[str, str], float] = {}
        for key, signals in edge_signals.items():
            if len(signals) < 2:
                continue
            prob_none = 1.0
            for w in signals.values():
                prob_none *= (1.0 - w)
            combined = round(1.0 - prob_none, 4)
            if combined >= self.min_confidence:
                edges[key] = combined

        logger.info("Combined edges after threshold: %d", len(edges))

        if not edges:
            result.duration_s = round(time.monotonic() - t0, 2)
            logger.info("No edges above threshold — no campaigns to create")
            return result

        # 4. Build adjacency list and find connected components (BFS)
        adjacency: dict[str, set[str]] = defaultdict(set)
        for (a, b) in edges:
            adjacency[a].add(b)
            adjacency[b].add(a)

        visited: set[str] = set()
        components: list[list[str]] = []

        for node in adjacency:
            if node in visited:
                continue
            # BFS
            cluster: list[str] = []
            queue = [node]
            while queue:
                cur = queue.pop()
                if cur in visited:
                    continue
                visited.add(cur)
                cluster.append(cur)
                queue.extend(adjacency[cur] - visited)
            components.append(cluster)

        logger.info("Found %d connected components", len(components))

        # 5. Filter by min and max size
        too_large = [c for c in components if len(c) > self.max_cluster_size]
        clusters = [
            c for c in components
            if self.min_cluster_size <= len(c) <= self.max_cluster_size
        ]
        if too_large:
            logger.warning(
                "%d oversized clusters discarded (>%d IOCs): sizes %s",
                len(too_large),
                self.max_cluster_size,
                [len(c) for c in too_large],
            )
        logger.info(
            "%d clusters pass size filter [%d, %d]",
            len(clusters), self.min_cluster_size, self.max_cluster_size,
        )

        if not clusters:
            result.duration_s = round(time.monotonic() - t0, 2)
            return result

        # 6. Fetch IOC metadata for naming and enrichment
        all_ioc_ids = {ioc_id for c in clusters for ioc_id in c}
        ioc_meta = await self._fetch_ioc_meta(session, all_ioc_ids)
        ioc_sources_meta = await self._fetch_sources_meta(session, all_ioc_ids)
        actor_meta = await self._fetch_actor_meta(session, all_ioc_ids)

        # 7. Upsert each cluster as a campaign
        for cluster_ioc_ids in clusters:
            await self._upsert_campaign(
                session,
                cluster_ioc_ids,
                edges,
                edge_signals,
                ioc_meta,
                ioc_sources_meta,
                actor_meta,
                result,
            )

        # 8. Archive stale campaigns
        archived = await self._archive_stale(session)
        result.campaigns_archived = archived

        result.duration_s = round(time.monotonic() - t0, 2)
        logger.info(
            "CorrelationEngine done: %d campaigns, %d IOCs clustered, %d archived in %.1fs",
            result.campaigns_found,
            result.iocs_clustered,
            result.campaigns_archived,
            result.duration_s,
        )
        return result

    # ------------------------------------------------------------------
    # Helpers — metadata fetching
    # ------------------------------------------------------------------

    async def _fetch_ioc_meta(
        self, session: AsyncSession, ioc_ids: set[str]
    ) -> dict[str, dict[str, Any]]:
        """Fetch type, first_seen, last_seen for all cluster IOCs."""
        if not ioc_ids:
            return {}
        id_list = ", ".join(f"'{i}'" for i in ioc_ids)
        rows = await session.execute(
            text(
                f"SELECT id::text, type, first_seen, last_seen, severity "
                f"FROM iocs WHERE id::text IN ({id_list})"
            )
        )
        return {
            row[0]: {
                "type": row[1],
                "first_seen": row[2],
                "last_seen": row[3],
                "severity": float(row[4]) if row[4] is not None else None,
            }
            for row in rows.fetchall()
        }

    async def _fetch_sources_meta(
        self, session: AsyncSession, ioc_ids: set[str]
    ) -> dict[str, list[dict[str, Any]]]:
        """Fetch feed_name + raw_payload for each IOC."""
        if not ioc_ids:
            return {}
        id_list = ", ".join(f"'{i}'" for i in ioc_ids)
        rows = await session.execute(
            text(
                f"SELECT ioc_id::text, feed_name, raw_payload "
                f"FROM ioc_sources WHERE ioc_id::text IN ({id_list})"
            )
        )
        result: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for ioc_id, feed_name, payload in rows.fetchall():
            result[ioc_id].append({"feed_name": feed_name, "payload": payload or {}})
        return result

    async def _fetch_actor_meta(
        self, session: AsyncSession, ioc_ids: set[str]
    ) -> dict[str, list[dict[str, Any]]]:
        """Fetch threat actor IDs and names linked to each IOC."""
        if not ioc_ids:
            return {}
        id_list = ", ".join(f"'{i}'" for i in ioc_ids)
        rows = await session.execute(
            text(
                f"SELECT l.ioc_id::text, ta.id::text, ta.name, ta.techniques "
                f"FROM threat_actor_ioc_links l "
                f"JOIN threat_actors ta ON ta.id = l.threat_actor_id "
                f"WHERE l.ioc_id::text IN ({id_list})"
            )
        )
        result: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for ioc_id, actor_id, name, techniques in rows.fetchall():
            result[ioc_id].append({"id": actor_id, "name": name, "techniques": techniques or []})
        return result

    # ------------------------------------------------------------------
    # Helpers — campaign upsert
    # ------------------------------------------------------------------

    async def _upsert_campaign(
        self,
        session: AsyncSession,
        cluster_ioc_ids: list[str],
        edges: dict[tuple[str, str], float],
        edge_signals: dict[tuple[str, str], dict[str, float]],
        ioc_meta: dict[str, Any],
        ioc_sources_meta: dict[str, Any],
        actor_meta: dict[str, Any],
        result: CampaignRunResult,
    ) -> None:
        # --- Cluster stats ---
        cluster_set = set(cluster_ioc_ids)

        # --- Confidence: weighted quality score ---
        # Which signals fired for this cluster?
        _SIGNAL_WEIGHTS = {
            "cooccurrence":        0.90,
            "malware_family":      0.85,
            "ttp_overlap":         0.80,
            "subnet_clustering":   0.70,
            "temporal_clustering": 0.50,
        }
        fired_signals: set[str] = set()
        for (a, b), sigs in edge_signals.items():
            if a in cluster_set and b in cluster_set:
                fired_signals.update(sigs.keys())
        # Normalise against the sum of the two strongest signals (1.75) so that
        # a cluster firing both top signals scores near 1.0, while a weak 2-signal
        # cluster scores around 0.65-0.77.  Scores beyond 1.0 are capped.
        _max_possible = sorted(_SIGNAL_WEIGHTS.values(), reverse=True)[:2]
        _max_possible_sum = sum(_max_possible)  # 0.90 + 0.85 = 1.75
        signal_score = min(
            sum(_SIGNAL_WEIGHTS.get(s, 0.5) for s in fired_signals) / _max_possible_sum,
            1.0,
        )

        # Cluster size component — 20+ IOCs = full score
        cluster_size_score = min(len(cluster_ioc_ids) / 20.0, 1.0)

        # Cross-feed diversity — 3+ distinct feed names = full score
        unique_feeds: set[str] = set()
        for ioc_id in cluster_ioc_ids:
            for src in ioc_sources_meta.get(ioc_id, []):
                if src.get("feed_name"):
                    unique_feeds.add(src["feed_name"])
        cross_feed_score = min(len(unique_feeds) / 3.0, 1.0)

        # Actor linkage — any known actor linked = full score
        has_actors = any(bool(actor_meta.get(ioc_id)) for ioc_id in cluster_ioc_ids)
        actor_link_score = 1.0 if has_actors else 0.0

        avg_confidence = round(
            signal_score     * 0.40
            + cluster_size_score * 0.25
            + cross_feed_score   * 0.20
            + actor_link_score   * 0.15,
            4,
        )

        # Dominant signal
        signal_counts: dict[str, int] = defaultdict(int)
        for (a, b), sigs in edge_signals.items():
            if a in cluster_set and b in cluster_set:
                for sig in sigs:
                    signal_counts[sig] += 1
        primary_signal = max(signal_counts, key=signal_counts.get) if signal_counts else "unknown"

        # Date range
        first_seen = None
        last_seen = None
        for ioc_id in cluster_ioc_ids:
            meta = ioc_meta.get(ioc_id, {})
            fs = meta.get("first_seen")
            ls = meta.get("last_seen")
            if fs:
                if first_seen is None or fs < first_seen:
                    first_seen = fs
            if ls:
                if last_seen is None or ls > last_seen:
                    last_seen = ls

        # Shared threat actors
        actor_id_counts: dict[str, str] = {}  # id -> name
        for ioc_id in cluster_ioc_ids:
            for actor in actor_meta.get(ioc_id, []):
                actor_id_counts[actor["id"]] = actor["name"]
        shared_actor_ids = list(actor_id_counts.keys())

        # Shared techniques (from linked actors)
        tech_set: set[str] = set()
        for ioc_id in cluster_ioc_ids:
            for actor in actor_meta.get(ioc_id, []):
                for t in actor.get("techniques", []):
                    if isinstance(t, dict) and t.get("id"):
                        tech_set.add(t["id"])
        shared_techniques = [{"id": t} for t in sorted(tech_set)]

        # Per-IOC signal list
        ioc_signal_map: dict[str, set[str]] = defaultdict(set)
        for (a, b), sigs in edge_signals.items():
            if a in cluster_set and b in cluster_set:
                for sig in sigs:
                    ioc_signal_map[a].add(sig)
                    ioc_signal_map[b].add(sig)

        # --- Campaign name ---
        name = self._generate_name(
            cluster_ioc_ids, ioc_meta, ioc_sources_meta, first_seen
        )

        # --- Upsert campaigns row (match by IOC fingerprint) ---
        # Use SHA-256 of sorted IOC IDs so the fingerprint is stable across
        # processes (Python's built-in hash() is randomised per-process).
        fingerprint = hashlib.sha256(
            ",".join(sorted(cluster_ioc_ids)).encode()
        ).hexdigest()

        existing = await session.execute(
            text(
                "SELECT id FROM campaigns "
                "WHERE metadata_->>'fingerprint' = :fp "
                "AND status = 'active' LIMIT 1"
            ),
            {"fp": fingerprint},
        )
        existing_row = existing.fetchone()

        now = datetime.now(timezone.utc)

        if existing_row:
            campaign_id = str(existing_row[0])
            await session.execute(
                text(
                    "UPDATE campaigns SET "
                    "  name = :name, "
                    "  confidence = :confidence, "
                    "  ioc_count = :ioc_count, "
                    "  primary_signal = :primary_signal, "
                    "  techniques = CAST(:techniques AS JSON), "
                    "  threat_actor_ids = CAST(:threat_actor_ids AS JSON), "
                    "  first_seen = :first_seen, "
                    "  last_seen = :last_seen, "
                    "  updated_at = :updated_at "
                    "WHERE id = :id"
                ),
                {
                    "name": name,
                    "confidence": avg_confidence,
                    "ioc_count": len(cluster_ioc_ids),
                    "primary_signal": primary_signal,
                    "techniques": _json_dumps(shared_techniques),
                    "threat_actor_ids": _json_dumps(shared_actor_ids),
                    "first_seen": first_seen,
                    "last_seen": last_seen,
                    "updated_at": now,
                    "id": campaign_id,
                },
            )
        else:
            campaign_id = str(uuid.uuid4())
            meta_json = _json_dumps({"fingerprint": fingerprint})
            await session.execute(
                text(
                    "INSERT INTO campaigns "
                    "(id, name, confidence, ioc_count, status, primary_signal, "
                    " techniques, threat_actor_ids, first_seen, last_seen, "
                    " metadata_, created_at, updated_at) "
                    "VALUES "
                    "(:id, :name, :confidence, :ioc_count, 'active', :primary_signal, "
                    " CAST(:techniques AS JSON), CAST(:threat_actor_ids AS JSON), "
                    " :first_seen, :last_seen, "
                    " CAST(:metadata_ AS JSON), :now, :now)"
                ),
                {
                    "id": campaign_id,
                    "name": name,
                    "confidence": avg_confidence,
                    "ioc_count": len(cluster_ioc_ids),
                    "primary_signal": primary_signal,
                    "techniques": _json_dumps(shared_techniques),
                    "threat_actor_ids": _json_dumps(shared_actor_ids),
                    "first_seen": first_seen,
                    "last_seen": last_seen,
                    "metadata_": meta_json,
                    "now": now,
                },
            )
            result.campaigns_found += 1

        await session.commit()

        # --- Upsert campaign_iocs (batched 100 rows per statement) ---
        _BATCH = 100
        ioc_rows = []
        for ioc_id in cluster_ioc_ids:
            signals_list = sorted(ioc_signal_map.get(ioc_id, [primary_signal]))
            ioc_confidence = max(
                (w for (a, b), w in edges.items()
                 if (a == ioc_id or b == ioc_id)
                 and a in cluster_set and b in cluster_set),
                default=avg_confidence,
            )
            ioc_rows.append((ioc_id, signals_list, round(ioc_confidence, 4)))

        for i in range(0, len(ioc_rows), _BATCH):
            batch = ioc_rows[i : i + _BATCH]
            # Build a multi-row VALUES clause with positional placeholders.
            placeholders = []
            params: dict = {"campaign_id": campaign_id, "now": now}
            for j, (ioc_id, signals_list, ioc_conf) in enumerate(batch):
                placeholders.append(
                    f"(:id_{j}, :campaign_id, :ioc_id_{j}, "
                    f"CAST(:sig_{j} AS JSON), :conf_{j}, :now)"
                )
                params[f"id_{j}"] = str(uuid.uuid4())
                params[f"ioc_id_{j}"] = ioc_id
                params[f"sig_{j}"] = _json_dumps(signals_list)
                params[f"conf_{j}"] = ioc_conf
            sql = (
                "INSERT INTO campaign_iocs "
                "(id, campaign_id, ioc_id, signal_types, confidence, added_at) "
                "VALUES " + ", ".join(placeholders) + " "
                "ON CONFLICT (campaign_id, ioc_id) DO UPDATE SET "
                "  signal_types = EXCLUDED.signal_types, "
                "  confidence   = EXCLUDED.confidence"
            )
            await session.execute(text(sql), params)

        await session.commit()
        result.iocs_clustered += len(cluster_ioc_ids)

    # ------------------------------------------------------------------
    # Helpers — archival
    # ------------------------------------------------------------------

    async def _archive_stale(self, session: AsyncSession) -> int:
        """Archive campaigns where ALL member IOCs are now inactive."""
        rows = await session.execute(
            text(
                "UPDATE campaigns SET status = 'archived', updated_at = NOW() "
                "WHERE status = 'active' "
                "  AND id NOT IN ("
                "    SELECT DISTINCT ci.campaign_id "
                "    FROM campaign_iocs ci "
                "    JOIN iocs i ON i.id = ci.ioc_id "
                "    WHERE i.is_active = true"
                "  ) "
                "RETURNING id"
            )
        )
        archived = len(rows.fetchall())
        if archived:
            await session.commit()
        return archived

    # ------------------------------------------------------------------
    # Helpers — name generation
    # ------------------------------------------------------------------

    def _generate_name(
        self,
        ioc_ids: list[str],
        ioc_meta: dict[str, Any],
        ioc_sources_meta: dict[str, Any],
        first_seen: Optional[datetime],
    ) -> str:
        from collections import Counter
        from app.correlation.signals import _extract_malware_family, _GENERIC_MALWARE_FAMILIES

        # Try to find dominant malware family
        families: list[str] = []
        feed_names: list[str] = []
        for ioc_id in ioc_ids:
            for src in ioc_sources_meta.get(ioc_id, []):
                feed_names.append(src["feed_name"])
                family = _extract_malware_family(src["payload"])
                if family and family not in _GENERIC_MALWARE_FAMILIES:
                    families.append(family.title())

        # Dominant IOC type
        types = [ioc_meta.get(i, {}).get("type", "ioc") for i in ioc_ids]
        dominant_type = Counter(types).most_common(1)[0][0] if types else "ioc"
        type_label = {
            "ip": "IP",
            "domain": "Domain",
            "url": "URL",
            "hash_md5": "Hash",
            "hash_sha256": "Hash",
            "hash_sha1": "Hash",
            "cve": "CVE",
        }.get(dominant_type, dominant_type.upper())

        # Date suffix
        date_str = ""
        if first_seen:
            if hasattr(first_seen, "strftime"):
                date_str = f" ({first_seen.strftime('%b %Y')})"

        # Build name
        if families:
            family = Counter(families).most_common(1)[0][0]
            return f"{family} {type_label} Cluster — {len(ioc_ids)} IOCs{date_str}"

        if feed_names:
            feed = Counter(feed_names).most_common(1)[0][0]
            feed_label = feed.replace("_", " ").title()
            return f"{feed_label} {type_label} Cluster — {len(ioc_ids)} IOCs{date_str}"

        return f"Unnamed {type_label} Cluster — {len(ioc_ids)} IOCs{date_str}"


def _json_dumps(obj: Any) -> str:
    """Serialize to JSON string for SQL parameter binding."""
    import json
    return json.dumps(obj)
