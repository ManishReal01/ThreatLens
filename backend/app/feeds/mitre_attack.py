"""MITRE ATT&CK feed adapter.

Fetches the enterprise-attack STIX 2.1 bundle and ingests all intrusion-set
objects (threat actor groups) into the threat_actors table.

After ingestion it auto-links threat actors to existing IOCs by matching
associated_malware names against ioc.metadata->>'malware_family' from ThreatFox.

Schedule: run on startup, then every 24 hours.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.session import AsyncSessionLocal
from app.feeds.base import BaseFeedWorker
from app.models.threat_actor import ThreatActorModel, ThreatActorIOCLinkModel

logger = logging.getLogger(__name__)

_STIX_URL = (
    "https://raw.githubusercontent.com/mitre/cti/master/"
    "enterprise-attack/enterprise-attack.json"
)

# Typical timeout for this large file (14+ MB)
_FETCH_TIMEOUT_SEC = 120


class MITREAttackWorker(BaseFeedWorker):
    """Feed adapter for the MITRE ATT&CK enterprise dataset."""

    FEED_NAME = "mitre_attack"

    def is_configured(self) -> bool:
        # No API key required — the STIX bundle is public.
        return True

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        import httpx

        logger.info("Fetching MITRE ATT&CK STIX bundle from %s", _STIX_URL)

        # Use a longer timeout for this large file
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(_FETCH_TIMEOUT_SEC, connect=15.0),
            follow_redirects=True,
            headers={"User-Agent": "ThreatLens/1.0"},
        ) as client:
            response = await client.get(_STIX_URL)
            response.raise_for_status()

        bundle = response.json()
        objects: list[dict[str, Any]] = bundle.get("objects", [])
        logger.info("STIX bundle has %d objects", len(objects))

        # Index all objects by id for relationship resolution
        obj_by_id: dict[str, dict] = {o["id"]: o for o in objects if "id" in o}

        # Collect all relationship objects (type=uses)
        uses_rels = [
            o for o in objects
            if o.get("type") == "relationship" and o.get("relationship_type") == "uses"
        ]

        # Build per-group lookups
        group_techniques: dict[str, list[dict]] = {}
        group_software: dict[str, list[dict]] = {}

        for rel in uses_rels:
            src_id = rel.get("source_ref", "")
            tgt_id = rel.get("target_ref", "")
            tgt_obj = obj_by_id.get(tgt_id, {})
            tgt_type = tgt_obj.get("type", "")

            src_obj = obj_by_id.get(src_id, {})
            if src_obj.get("type") != "intrusion-set":
                continue

            if tgt_type == "attack-pattern":
                # Extract technique id from external_references
                ext_refs = tgt_obj.get("external_references", [])
                technique_id = next(
                    (r["external_id"] for r in ext_refs if r.get("source_name") == "mitre-attack"),
                    None,
                )
                if technique_id:
                    group_techniques.setdefault(src_id, [])
                    # Avoid duplicates
                    existing_ids = {t["id"] for t in group_techniques[src_id]}
                    if technique_id not in existing_ids:
                        group_techniques[src_id].append({
                            "id": technique_id,
                            "name": tgt_obj.get("name", ""),
                        })

            elif tgt_type in ("tool", "malware"):
                group_software.setdefault(src_id, [])
                existing_ids = {s["id"] for s in group_software[src_id]}
                stix_id = tgt_obj.get("id", "")
                if stix_id not in existing_ids:
                    group_software[src_id].append({
                        "id": stix_id,
                        "name": tgt_obj.get("name", ""),
                    })

        # Process all intrusion-set objects
        intrusion_sets = [o for o in objects if o.get("type") == "intrusion-set"]
        logger.info("Found %d intrusion-set (threat actor group) objects", len(intrusion_sets))

        fetched = new = updated = 0

        for obj in intrusion_sets:
            stix_id = obj.get("id", "")
            ext_refs = obj.get("external_references", [])
            mitre_id = next(
                (r["external_id"] for r in ext_refs if r.get("source_name") == "mitre-attack"),
                stix_id,
            )

            aliases = obj.get("aliases", [])
            # Remove the group name itself from aliases list
            name = obj.get("name", "")
            aliases = [a for a in aliases if a != name]

            # Country from x_mitre_countries or x_mitre_country (both spellings exist)
            country = None
            countries = obj.get("x_mitre_countries") or obj.get("x_mitre_country")
            if isinstance(countries, list) and countries:
                country = countries[0]
            elif isinstance(countries, str):
                country = countries

            # Motivations from primary/secondary motivations
            motivations = list(set(
                (obj.get("primary_motivation") and [obj["primary_motivation"]] or [])
                + (obj.get("secondary_motivations") or [])
            ))

            # Software names for malware matching
            sw_list = group_software.get(stix_id, [])
            malware_names = [s["name"] for s in sw_list]

            values = {
                "mitre_id": mitre_id,
                "name": name,
                "aliases": aliases,
                "description": obj.get("description"),
                "country": country,
                "motivations": motivations,
                "first_seen": obj.get("first_seen"),
                "last_seen": obj.get("last_seen"),
                "techniques": group_techniques.get(stix_id, []),
                "software": sw_list,
                "associated_malware": malware_names,
                "metadata": {
                    "stix_id": stix_id,
                    "created": obj.get("created"),
                    "modified": obj.get("modified"),
                    "url": next(
                        (r.get("url") for r in ext_refs if r.get("source_name") == "mitre-attack"),
                        None,
                    ),
                },
                "updated_at": datetime.now(timezone.utc),
            }

            stmt = (
                pg_insert(ThreatActorModel)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["mitre_id"],
                    set_={k: v for k, v in values.items() if k != "mitre_id"},
                )
                .returning(ThreatActorModel.id, ThreatActorModel.created_at, ThreatActorModel.updated_at)
            )
            result = await session.execute(stmt)
            row = result.fetchone()

            fetched += 1
            # If created_at == updated_at (within a second), it's new
            if row and abs((row[2] - row[1]).total_seconds()) < 2:
                new += 1
            else:
                updated += 1

        await session.commit()
        logger.info(
            "MITRE ATT&CK ingestion complete: %d fetched, %d new, %d updated",
            fetched, new, updated,
        )

        # Auto-link threat actors to IOCs based on malware family matching
        linked = await _auto_link_iocs(session)
        logger.info("Auto-linked %d threat actor → IOC associations", linked)

        return fetched, new, updated


async def _auto_link_iocs(session: AsyncSession) -> int:
    """Match threat actors to IOCs via malware family names.

    Joins threat_actors.associated_malware (JSONB array of strings) against
    iocs.metadata->>'malware_family' (set by ThreatFox ingestion).
    """
    # Use a SQL-level join: unnest the associated_malware JSON array and compare
    # against the malware_family metadata field on IOCs.
    link_sql = text("""
        INSERT INTO threat_actor_ioc_links (id, threat_actor_id, ioc_id, confidence, source, created_at)
        SELECT
            gen_random_uuid(),
            ta.id,
            iocs.id,
            0.70,
            'auto_malware_match',
            NOW()
        FROM threat_actors ta
        CROSS JOIN LATERAL jsonb_array_elements_text(ta.associated_malware::jsonb) AS am(name)
        JOIN iocs ON (
            iocs.metadata->>'malware_family' ILIKE am.name
            OR iocs.metadata->>'malware' ILIKE am.name
        )
        WHERE iocs.metadata IS NOT NULL
        ON CONFLICT (threat_actor_id, ioc_id) DO NOTHING
        RETURNING id
    """)
    result = await session.execute(link_sql)
    linked = len(result.fetchall())
    await session.commit()
    return linked


async def run_mitre_attack(settings: Settings) -> None:
    """Entry point for the scheduler."""
    async with MITREAttackWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)
