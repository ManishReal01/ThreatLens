"""Rescore all IOCs using the current scoring formula.

Fetches max raw_confidence per IOC from ioc_sources, recomputes severity
using the current weights and recency decay, then bulk-updates in batches.

Usage:
    cd backend
    .venv/bin/python scripts/rescore_all.py
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import bindparam, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.ioc import IOCModel
from app.models.ioc_source import IOCSourceModel
from app.normalization.scoring import CURRENT_SCORE_VERSION, compute_severity

BATCH_SIZE = 500

_DIST_SQL = text("""
    SELECT
        COUNT(*) FILTER (WHERE severity >= 8.0)                        AS critical,
        COUNT(*) FILTER (WHERE severity >= 6.5 AND severity < 8.0)     AS high,
        COUNT(*) FILTER (WHERE severity >= 4.0 AND severity < 6.5)     AS medium,
        COUNT(*) FILTER (WHERE severity < 4.0)                         AS low,
        COUNT(*)                                                        AS total,
        ROUND(AVG(severity)::numeric, 2)                               AS avg_score
    FROM iocs
""")


def _print_dist(label: str, row: tuple) -> None:
    critical, high, medium, low, total, avg = row
    total = total or 0
    pct = lambda n: f"{100 * n / total:.1f}%" if total else "n/a"
    print(f"\n{'='*52}")
    print(f"  {label}")
    print(f"  critical (≥8.0): {critical:>7}  ({pct(critical)})")
    print(f"  high    (≥6.5): {high:>7}  ({pct(high)})")
    print(f"  medium  (≥4.0): {medium:>7}  ({pct(medium)})")
    print(f"  low     (<4.0): {low:>7}  ({pct(low)})")
    print(f"  avg severity  : {avg}")
    print(f"{'='*52}")


async def rescore_all() -> None:
    engine = create_async_engine(
        settings.database_url,
        connect_args={
            "statement_cache_size": 0,
            "server_settings": {"statement_timeout": "0"},
        },
    )
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # ---- before distribution ----
        before_row = (await session.execute(_DIST_SQL)).one()
        _print_dist(f"BEFORE rescore (score_version mixed)", before_row)

        # ---- load all IOC data ----
        print("\nLoading IOCs...")
        ioc_rows = (await session.execute(
            select(IOCModel.id, IOCModel.source_count, IOCModel.last_seen)
        )).all()
        print(f"  Loaded {len(ioc_rows)} IOCs")

        # ---- load max confidence per IOC from ioc_sources ----
        print("Loading source confidences...")
        conf_rows = (await session.execute(
            select(
                IOCSourceModel.ioc_id,
                func.max(IOCSourceModel.raw_score).label("max_conf"),
            ).group_by(IOCSourceModel.ioc_id)
        )).all()
        conf_map: dict = {str(row[0]): float(row[1]) for row in conf_rows}
        print(f"  Loaded confidence for {len(conf_map)} IOCs")

        # ---- compute new scores ----
        print("Computing new scores...")
        now = datetime.now(timezone.utc)
        updates = []
        for ioc_id, source_count, last_seen in ioc_rows:
            if last_seen is None:
                age_days = 0.0
            else:
                ls = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
                age_days = max((now - ls).total_seconds() / 86400, 0.0)

            confidence = conf_map.get(str(ioc_id), 0.5)
            result = compute_severity(confidence, source_count or 1, age_days)
            updates.append({
                "b_id": ioc_id,
                "b_severity": result.score,
                "b_score_version": CURRENT_SCORE_VERSION,
                "b_score_explanation": result.explanation,
            })

        # ---- bulk update in batches via core connection (bypasses ORM sync) ----
        # score_explanation is omitted here — it auto-updates on next feed ingest.
        # NOTE: If Supabase statement_timeout kills a batch, run the equivalent SQL
        # directly via MCP/psql:
        #   SET statement_timeout = 0;
        #   UPDATE iocs i
        #   SET severity = ROUND((
        #       LEAST(COALESCE(src.max_confidence,0.5),1.0)*10.0*0.35
        #       + LEAST(log(GREATEST(i.source_count::numeric+1,2))/log(11),1.0)*10.0*0.25
        #       + EXP(-0.008*GREATEST(EXTRACT(EPOCH FROM(NOW()-i.last_seen))/86400.0,0))*10.0*0.40
        #   )::numeric, 2),
        #   score_version = 3
        #   FROM (SELECT ioc_id, MAX(raw_score) AS max_confidence FROM ioc_sources GROUP BY ioc_id) src
        #   WHERE i.id = src.ioc_id;
        print(f"Updating {len(updates)} rows in batches of {BATCH_SIZE}...")
        _update_sql = text("""
            UPDATE iocs
            SET severity      = :b_severity,
                score_version = :b_score_version
            WHERE id = :b_id
        """)
        async with engine.begin() as conn:
            for i in range(0, len(updates), BATCH_SIZE):
                batch = updates[i : i + BATCH_SIZE]
                await conn.execute(_update_sql, batch)
                done = min(i + BATCH_SIZE, len(updates))
                print(f"  {done}/{len(updates)}", end="\r", flush=True)

        print(f"\nDone.")

        # ---- after distribution ----
        after_row = (await session.execute(_DIST_SQL)).one()
        _print_dist(f"AFTER rescore (score_version={CURRENT_SCORE_VERSION})", after_row)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(rescore_all())
