# Phase 1: Data Foundation - Research

**Researched:** 2026-03-20
**Domain:** PostgreSQL schema design, Python data modeling, IOC normalization contracts
**Confidence:** HIGH (PostgreSQL patterns verified from stable documentation; Python library versions verified against PyPI on research date)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IOC-01 | Ingested IOCs are normalized into a canonical schema with a unique (value, type) constraint — no duplicates across feeds | Upsert pattern with `UNIQUE(value, type)` constraint; `NormalizedIOC` struct definition; canonicalization functions per type |
| IOC-02 | Each feed observation is logged separately: which feed, when seen, raw confidence score, raw metadata | `ioc_sources` table design (separate from `iocs`); per-run `feed_run_id` FK; `raw_payload JSONB` for archival |
| IOC-03 | Each IOC has a composite severity score computed as: feed confidence (40%) + source count (35%) + recency (25%) | Stored `severity` column; formula inputs as columns on `iocs`; score computed and stored on upsert — never at query time |
| IOC-04 | Severity score decays automatically as IOC last-seen date ages (older IOCs score lower) | `last_seen TIMESTAMPTZ` column; recency weight formula; age-decay factor computed at upsert time |
| IOC-05 | IOC relationships are inferred during ingestion (co-occurrence within feed observations) and stored in an adjacency table | `ioc_relationships` adjacency table; indexes on both FKs; co-occurrence inference contract defined before any worker |
</phase_requirements>

---

## Summary

Phase 1 is the schema and contract phase. Its sole job is to produce a stable PostgreSQL schema and a Python normalization contract that every downstream component can depend on without modification. The schema must be complete enough that Phases 2–6 never need an emergency migration to add a critical column. The normalization contract (`NormalizedIOC` struct) must cover the union of all fields needed by all three feed adapters while keeping the canonical `iocs` table feed-agnostic.

The two plans this phase produces are deliberately separated: plan 01-01 is the SQL migrations (tables, indexes, constraints, extensions) and plan 01-02 is the Python layer (struct, upsert logic, severity formula, co-occurrence inference). This separation ensures the schema is reviewed and stable before application code is written against it. Neither plan touches feed API integration — that is Phase 2.

The most critical design decisions in this phase are: (1) the `(value, type)` unique constraint enforcing deduplication at the database layer, (2) the separation of `iocs` (canonical, one row per IOC) from `ioc_sources` (observation log, one row per feed observation), and (3) `user_id` FK columns on all analyst workspace tables even though those tables are not used until Phase 6. Retrofitting ownership columns into populated tables is a high-risk migration; defining them now costs nothing.

**Primary recommendation:** Write SQL migrations first, verify they run cleanly in the Supabase project, then write the Python normalization layer against that stable schema. Do not write the Python layer against a schema that hasn't been committed.

---

## Standard Stack

### Core (Phase 1 specific)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy (async) | 2.0.48 | ORM models and async session management | Standard FastAPI + PostgreSQL async pattern; type-safe; Alembic integration |
| asyncpg | 0.31.0 | PostgreSQL async driver | Fastest async PG driver for Python; required by SQLAlchemy async engine |
| Alembic | 1.18.4 | Schema migrations | SQLAlchemy's official migration tool; version-controlled schema evolution |
| Pydantic v2 | 2.12.5 | `NormalizedIOC` struct definition and validation | FastAPI dependency; v2 is Rust-backed (10x faster than v1); `model_validator` for cross-field checks |
| pydantic-settings | 2.13.1 | Typed environment variable management | Reads `.env` into validated Pydantic models; FastAPI-native pattern |
| tldextract | 5.3.1 | Domain canonicalization | Extracts registered domain correctly using maintained public suffix list; required for domain dedup |
| ipaddress (stdlib) | — | IP canonicalization | IPv4/IPv6 normalization, private-range detection, CIDR handling; zero dependencies |

### Supporting (Phase 1 optional)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-validators | 0.22.x | Supplemental format validation | Only if Pydantic v2 built-in validators are insufficient for a specific IOC format; check before adding |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLAlchemy ORM | SQLAlchemy Core (raw SQL) | Core is faster to write but loses type safety and Alembic autogenerate; ORM preferred for schema management phase |
| Alembic | Manual SQL files | Alembic provides revision history, autogenerate from models, and rollback; manual SQL is fragile |
| Pydantic v2 dataclass | Python stdlib `@dataclass` | Pydantic v2 adds field validation, type coercion, and serialization; worth the dependency since FastAPI already requires it |

**Installation (Phase 1 Python layer):**
```bash
pip install sqlalchemy[asyncio] asyncpg alembic pydantic[email] pydantic-settings tldextract
```

**Version verification:** Versions above confirmed against PyPI on 2026-03-20.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── alembic/
│   ├── env.py               # migration environment
│   ├── versions/            # migration revision files
│   │   └── 001_initial_schema.py
│   └── alembic.ini
├── app/
│   ├── models/
│   │   ├── ioc.py           # SQLAlchemy ORM: iocs table
│   │   ├── ioc_source.py    # SQLAlchemy ORM: ioc_sources table
│   │   ├── relationship.py  # SQLAlchemy ORM: ioc_relationships table
│   │   ├── feed_run.py      # SQLAlchemy ORM: feed_runs table
│   │   └── workspace.py     # SQLAlchemy ORM: tags, notes, watchlists
│   ├── normalization/
│   │   ├── schema.py        # NormalizedIOC Pydantic model
│   │   ├── canonicalize.py  # per-type canonicalization functions
│   │   ├── upsert.py        # upsert logic + relationship inference
│   │   └── scoring.py       # severity formula
│   ├── db/
│   │   ├── session.py       # async SQLAlchemy engine + session factory
│   │   └── base.py          # declarative base
│   └── config.py            # pydantic-settings Settings model
└── tests/
    ├── test_canonicalize.py
    ├── test_scoring.py
    └── test_upsert.py
```

### Pattern 1: Schema-First Migration Workflow

**What:** Write all DDL as Alembic migration files. Never apply schema changes manually via Supabase SQL editor. The migration file is the source of truth.

**When to use:** Every schema change, starting from the initial tables.

**Example:**
```python
# Source: Alembic documentation — https://alembic.sqlalchemy.org/en/latest/ops.html
# alembic/versions/001_initial_schema.py

def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    op.create_table(
        "iocs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("severity", sa.Numeric(4, 2), nullable=True),
        sa.Column("score_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("score_explanation", postgresql.JSONB(), nullable=True),
        sa.Column("first_seen", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
        sa.Column("last_seen", sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
        sa.Column("source_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("retired_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("value", "type", name="uq_iocs_value_type"),
    )
```

### Pattern 2: NormalizedIOC as the Feed Contract

**What:** A single Pydantic model that every feed adapter must produce. The model owns the canonical representation; feed-specific logic lives only in the adapter.

**When to use:** Every feed adapter produces exactly this struct — nothing more, nothing less.

**Example:**
```python
# Source: Pydantic v2 documentation — https://docs.pydantic.dev/latest/
from pydantic import BaseModel, field_validator
from enum import Enum
from typing import Optional

class IOCType(str, Enum):
    IP = "ip"
    DOMAIN = "domain"
    HASH_MD5 = "hash_md5"
    HASH_SHA1 = "hash_sha1"
    HASH_SHA256 = "hash_sha256"
    URL = "url"

class NormalizedIOC(BaseModel):
    value: str                      # canonical form (lowercase, stripped)
    ioc_type: IOCType               # typed enum — no free-form strings
    raw_confidence: float           # normalized 0.0–1.0 from feed's own score
    feed_name: str                  # 'abuseipdb' | 'urlhaus' | 'otx'
    raw_payload: dict               # original feed record for audit (stored in ioc_sources)
    metadata: dict = {}             # type-specific extras (ASN, country, filename, etc.)
    feed_run_id: Optional[str] = None  # set by worker after feed_run row is created

    @field_validator("raw_confidence")
    @classmethod
    def confidence_in_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"raw_confidence must be 0.0–1.0, got {v}")
        return v
```

### Pattern 3: Upsert-Centric Ingestion (DB-Level Dedup)

**What:** Every insert is an `INSERT ... ON CONFLICT (value, type) DO UPDATE`. Application code never checks for existence before inserting.

**When to use:** Every IOC write from every feed adapter.

**Example:**
```python
# Source: PostgreSQL documentation — https://www.postgresql.org/docs/current/sql-insert.html
# SQLAlchemy 2.x async upsert pattern

from sqlalchemy.dialects.postgresql import insert as pg_insert

async def upsert_ioc(session: AsyncSession, ioc: NormalizedIOC) -> tuple[str, bool]:
    """Returns (ioc_id, is_new)."""
    severity = compute_severity(ioc)
    stmt = (
        pg_insert(IOCModel)
        .values(
            value=ioc.value,
            type=ioc.ioc_type.value,
            severity=severity.score,
            score_version=CURRENT_SCORE_VERSION,
            score_explanation=severity.explanation,
            last_seen=func.now(),
            source_count=1,
            metadata=ioc.metadata,
        )
        .on_conflict_do_update(
            constraint="uq_iocs_value_type",
            set_={
                "last_seen": func.now(),
                "source_count": IOCModel.source_count + 1,
                "severity": severity.score,
                "score_version": CURRENT_SCORE_VERSION,
                "score_explanation": severity.explanation,
                "metadata": ioc.metadata,
                "is_active": True,
                "retired_at": None,
            }
        )
        .returning(IOCModel.id, literal_column("xmax = 0").label("is_new"))
    )
    result = await session.execute(stmt)
    row = result.fetchone()
    return str(row.id), row.is_new
```

### Pattern 4: Severity Stored as Column, Never Computed at Query Time

**What:** Severity score is computed during upsert and stored in `iocs.severity`. Search queries use `ORDER BY severity DESC` on a B-tree index — no expression evaluation.

**Why:** A computed expression in ORDER BY cannot use a B-tree index. At 500K IOCs, `SELECT ... ORDER BY (formula) DESC` causes a sequential scan. Storing severity as a column makes sort operations index-scans.

```python
# Severity formula inputs — all weights as named constants
FEED_CONFIDENCE_WEIGHT = 0.40
SOURCE_COUNT_WEIGHT = 0.35
RECENCY_WEIGHT = 0.25

import math
from datetime import datetime, timezone

def compute_severity(ioc: NormalizedIOC, current_source_count: int = 1) -> SeverityResult:
    # Feed confidence component: normalized 0.0–1.0 → scaled to 0–10
    confidence_score = ioc.raw_confidence * 10 * FEED_CONFIDENCE_WEIGHT

    # Source count component: log-scaled so 3+ sources = near-maximum score
    # log2(1)=0, log2(2)=1, log2(4)=2 — scale to 0–10
    source_score = min(math.log2(current_source_count + 1) / math.log2(11), 1.0) * 10 * SOURCE_COUNT_WEIGHT

    # Recency component: exponential decay
    # last_seen within 7 days → ~1.0; 30 days → ~0.63; 90 days → ~0.27; 180 days → ~0.07
    age_days = 0  # on first insert, IOC is fresh
    recency_score = math.exp(-0.008 * age_days) * 10 * RECENCY_WEIGHT

    total = round(confidence_score + source_score + recency_score, 2)
    explanation = {
        "confidence_component": round(confidence_score, 3),
        "source_count_component": round(source_score, 3),
        "recency_component": round(recency_score, 3),
        "score_version": CURRENT_SCORE_VERSION,
    }
    return SeverityResult(score=total, explanation=explanation)
```

### Anti-Patterns to Avoid

- **Dedup on `value` alone:** `UNIQUE(value)` silently merges an MD5 hash and an IP that happen to share a string. Constraint must be `UNIQUE(value, type)`.
- **Computing severity at query time:** `SELECT *, (formula) AS severity ORDER BY severity` cannot use an index. Store severity as a column.
- **JSONB overuse for filterable fields:** Putting `threat_category`, `url_status`, or `country_code` into the `metadata JSONB` blob makes them unindexable and slow to filter. Promote to real columns anything analysts will filter or sort on.
- **Skipping `user_id` columns now:** Tags, notes, and watchlists tables need `user_id UUID NOT NULL` from creation. Adding it after data is inserted is a nullable-column migration that creates an IDOR risk window.
- **Application-layer dedup check before insert:** `SELECT EXISTS(...)` before each `INSERT` introduces a race condition under concurrent workers and adds a round-trip per IOC. Use `ON CONFLICT` exclusively.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migrations | Custom migration scripts | Alembic | Revision history, autogenerate from ORM models, rollback support, team coordination |
| Async PostgreSQL driver | asyncio + psycopg2 wrappers | asyncpg via SQLAlchemy async | asyncpg is native async, no thread-pool fallback; used by 90%+ of FastAPI + PG deployments |
| IOC type validation | Custom regex checkers | Pydantic v2 field types + `ipaddress` stdlib | Pydantic's `IPv4Address`, `AnyHttpUrl` handle edge cases; stdlib `ipaddress` handles CIDR, private ranges |
| Domain parsing for dedup | Custom TLD parsing | tldextract | Public suffix list is complex and changes; tldextract maintains it; hand-rolled TLD parsing is routinely wrong for `.co.uk`, `.com.au`, etc. |
| Hash type detection | Length-based guessing | Explicit `hash_type` field in `NormalizedIOC` | SHA1 and MD5 both produce 40-char hex strings (MD5=32, SHA1=40, SHA256=64 — but SHA1 and SHA256 are unambiguous; MD5 and MD4 are not). Feed adapters know the algorithm; store it |
| Deduplication logic | Application-side "have I seen this?" check | PostgreSQL `ON CONFLICT DO UPDATE` | Atomic, race-condition-free, correct under concurrent writes |

**Key insight:** Phase 1 is infrastructure. Every item in the "don't hand-roll" list is a place where a custom solution introduces correctness bugs (dedup, TLD parsing) or operational fragility (migrations). The standard tools exist precisely because these problems are harder than they appear.

---

## Common Pitfalls

### Pitfall 1: Missing `user_id` FK on Analyst Workspace Tables

**What goes wrong:** Tags, notes, and watchlists tables are created without `user_id` columns because "auth is Phase 4." When Phase 4 ships, adding `user_id NOT NULL` to tables that already have data requires a multi-step migration (add nullable, backfill, add NOT NULL constraint), and all existing records have no owner — creating an IDOR vulnerability window.

**Why it happens:** Workspace tables feel like a Phase 6 concern; they're included here only as empty tables. The `user_id` column feels premature.

**How to avoid:** Include `user_id UUID NOT NULL` on `tags`, `notes`, and `watchlists` in the Phase 1 migration. The column can be present before auth is wired — Phase 2 workers don't write to these tables at all.

**Warning signs:** Workspace tables have no `user_id` column, or the column is nullable.

---

### Pitfall 2: `(value, type)` Unique Constraint Missing Hash Algorithm Granularity

**What goes wrong:** `UNIQUE(value, type)` correctly prevents merging an IP and a hash with the same string. But the constraint uses `type = 'hash_md5'` / `type = 'hash_sha1'` / `type = 'hash_sha256'` as separate enum values — meaning the IOC type enum must encode the hash algorithm. If the enum only has `type = 'hash'`, then two different hash types with the same value string get merged.

**How to avoid:** The `IOCType` enum must have distinct values for `hash_md5`, `hash_sha1`, `hash_sha256`, and `hash_sha512`. This way `UNIQUE(value, type)` correctly distinguishes them. Document this in code comments so future contributors don't "simplify" to a single `hash` type.

---

### Pitfall 3: `ts_vector` Maintained by Trigger vs Generated Column

**What goes wrong:** Implementing `ts_vector` as a trigger-maintained column works but adds trigger overhead on every upsert. PostgreSQL 12+ supports `GENERATED ALWAYS AS` for tsvector columns, which is cleaner and faster. Using the trigger pattern on PostgreSQL 15 (Supabase's current version) is unnecessary complexity.

**How to avoid:** Use a `GENERATED ALWAYS AS` expression column for `ts_vector` in the migration:
```sql
ts_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', value || ' ' || COALESCE(metadata::text, ''))
) STORED
```
This eliminates the trigger and keeps the tsvector in sync automatically.

**Caveat:** Verify Supabase's PostgreSQL version supports generated columns (PG 12+ required; Supabase typically runs PG 15).

---

### Pitfall 4: `ioc_relationships` Missing Index on Both FK Directions

**What goes wrong:** The adjacency table is created with a PK and indexes on `source_ioc` only. Graph traversal queries that follow edges in both directions (recursive CTEs look up both `WHERE source_ioc = $id` and `WHERE target_ioc = $id`) cause sequential scans on the target direction.

**How to avoid:** Create B-tree indexes on both `source_ioc` and `target_ioc` in the initial migration. These two indexes are specifically called out in the Phase 1 success criteria:
```sql
CREATE INDEX ioc_rel_source_idx ON ioc_relationships(source_ioc);
CREATE INDEX ioc_rel_target_idx ON ioc_relationships(target_ioc);
```

---

### Pitfall 5: `score_version` Column Omitted — Recalibration Requires Full Table Scan

**What goes wrong:** The severity formula weights (40/35/25) are design choices, not sourced from standards. After analysts use the platform for a few weeks, they will request recalibration. Without a `score_version` column, you cannot identify which IOCs were scored with the old formula — you must recalculate all rows regardless.

**How to avoid:** Add `score_version INTEGER NOT NULL DEFAULT 1` to the `iocs` table in Phase 1. When the formula changes, increment the constant in code and run a targeted `UPDATE iocs SET severity = ..., score_version = 2 WHERE score_version < 2`.

---

### Pitfall 6: `pg_trgm` Extension Not Enabled Before Migration

**What goes wrong:** The initial migration creates `CREATE INDEX ... USING GIN(value gin_trgm_ops)` but the `pg_trgm` extension was never enabled with `CREATE EXTENSION IF NOT EXISTS pg_trgm`. The migration fails on first run with `ERROR: operator class "gin_trgm_ops" does not exist`.

**How to avoid:** The migration file must create extensions before creating tables or indexes that depend on them. In Alembic: `op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")` at the top of the `upgrade()` function. Supabase may have `pg_trgm` pre-installed, but the `IF NOT EXISTS` guard makes the migration idempotent either way.

---

## Code Examples

Verified patterns from official sources and stable PostgreSQL documentation:

### Full `iocs` Table DDL
```sql
-- Source: PostgreSQL 15 documentation — https://www.postgresql.org/docs/15/
-- Requires: pg_trgm extension enabled first

CREATE TABLE iocs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value         TEXT NOT NULL,
    type          TEXT NOT NULL,               -- IOCType enum value
    severity      NUMERIC(4,2),               -- composite 0.0–10.0, stored on upsert
    score_version INTEGER NOT NULL DEFAULT 1, -- increment when formula changes
    score_explanation JSONB,                  -- breakdown for analyst trust
    first_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_count  INTEGER NOT NULL DEFAULT 1,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    retired_at    TIMESTAMPTZ,
    metadata      JSONB,                      -- type-specific extras, not for filtering
    CONSTRAINT uq_iocs_value_type UNIQUE (value, type)
);

-- Full-text search (generated column — no trigger needed)
ALTER TABLE iocs ADD COLUMN ts_vector TSVECTOR
    GENERATED ALWAYS AS (
        to_tsvector('english', value || ' ' || COALESCE(metadata::text, ''))
    ) STORED;

-- Indexes
CREATE INDEX iocs_ts_vector_idx  ON iocs USING GIN(ts_vector);
CREATE INDEX iocs_value_trgm_idx ON iocs USING GIN(value gin_trgm_ops);
CREATE INDEX iocs_type_idx        ON iocs (type);
CREATE INDEX iocs_severity_idx    ON iocs (severity DESC);
CREATE INDEX iocs_last_seen_idx   ON iocs (last_seen DESC);
CREATE INDEX iocs_type_severity   ON iocs (type, severity DESC);       -- composite for type+severity filter
CREATE INDEX iocs_type_last_seen  ON iocs (type, last_seen DESC);      -- composite for type+date filter
CREATE INDEX iocs_active_idx      ON iocs (is_active) WHERE is_active = TRUE;  -- partial index
```

### `ioc_sources` Table DDL
```sql
CREATE TABLE ioc_sources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_id      UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    feed_name   TEXT NOT NULL,           -- 'abuseipdb' | 'urlhaus' | 'otx'
    raw_score   NUMERIC,                 -- feed's raw confidence value (pre-normalization)
    raw_payload JSONB,                   -- original feed record for audit
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    feed_run_id UUID REFERENCES feed_runs(id)
);

CREATE INDEX ioc_sources_ioc_id_idx   ON ioc_sources(ioc_id);
CREATE INDEX ioc_sources_feed_name_idx ON ioc_sources(feed_name);
CREATE INDEX ioc_sources_ingested_at_idx ON ioc_sources(ingested_at DESC);
```

### `ioc_relationships` Table DDL
```sql
CREATE TABLE ioc_relationships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ioc   UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    target_ioc   UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,          -- 'observed_with' | 'resolves_to' | 'serves' | 'analyst_linked'
    confidence   NUMERIC(4,2),
    inferred_by  TEXT,                   -- 'abuseipdb' | 'urlhaus' | 'otx' | 'analyst'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ioc_relationship UNIQUE (source_ioc, target_ioc, relationship)
);

-- Both FK directions required for bidirectional graph traversal
CREATE INDEX ioc_rel_source_idx ON ioc_relationships(source_ioc);
CREATE INDEX ioc_rel_target_idx ON ioc_relationships(target_ioc);
```

### `feed_runs` Table DDL
```sql
CREATE TABLE feed_runs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_name      TEXT NOT NULL,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    status         TEXT NOT NULL DEFAULT 'running',   -- 'running' | 'success' | 'error'
    iocs_fetched   INTEGER DEFAULT 0,
    iocs_new       INTEGER DEFAULT 0,
    iocs_updated   INTEGER DEFAULT 0,
    error_msg      TEXT,
    last_successful_sync TIMESTAMPTZ,                 -- separate from completed_at
    consecutive_failure_count INTEGER DEFAULT 0       -- for circuit breaker in Phase 2
);

CREATE INDEX feed_runs_feed_name_idx ON feed_runs(feed_name);
CREATE INDEX feed_runs_started_at_idx ON feed_runs(started_at DESC);
```

### Analyst Workspace Tables DDL
```sql
-- user_id is UUID from Supabase Auth — must be NOT NULL from Phase 1

CREATE TABLE tags (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_id  UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    tag     TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tag_per_user_ioc UNIQUE (ioc_id, user_id, tag)
);
CREATE INDEX tags_ioc_id_idx  ON tags(ioc_id);
CREATE INDEX tags_user_id_idx ON tags(user_id);

CREATE TABLE notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_id     UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notes_ioc_id_idx  ON notes(ioc_id);
CREATE INDEX notes_user_id_idx ON notes(user_id);

CREATE TABLE watchlists (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id  UUID NOT NULL,
    ioc_id   UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_watchlist_user_ioc UNIQUE (user_id, ioc_id)
);
CREATE INDEX watchlists_user_id_idx ON watchlists(user_id);
CREATE INDEX watchlists_ioc_id_idx  ON watchlists(ioc_id);
```

### Alembic Async Session Setup
```python
# Source: SQLAlchemy 2.x async documentation
# https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

engine = create_async_engine(
    settings.database_url,  # postgresql+asyncpg://...
    echo=False,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
```

### Co-Occurrence Relationship Inference Contract
```python
# Co-occurrence inference — defined here; implemented in Phase 2 workers.
# The contract: given a list of IOC IDs co-observed in the same feed observation
# (e.g., an OTX pulse containing an IP, a domain, and a hash together),
# create 'observed_with' edges for all pairs.

from itertools import combinations

async def infer_cooccurrence_relationships(
    session: AsyncSession,
    ioc_ids: list[str],          # IDs already upserted in this feed run
    inferred_by: str,            # feed name
    confidence: float = 0.7,     # default confidence for co-occurrence
) -> int:
    """Insert observed_with edges for all pairs. Returns edge count inserted."""
    edges_inserted = 0
    for source_id, target_id in combinations(ioc_ids, 2):
        stmt = (
            pg_insert(IOCRelationshipModel)
            .values(
                source_ioc=source_id,
                target_ioc=target_id,
                relationship="observed_with",
                confidence=confidence,
                inferred_by=inferred_by,
            )
            .on_conflict_do_nothing(constraint="uq_ioc_relationship")
        )
        await session.execute(stmt)
        edges_inserted += 1
    return edges_inserted
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trigger-maintained `ts_vector` | Generated column `TSVECTOR GENERATED ALWAYS AS ... STORED` | PostgreSQL 12 (2019) | Eliminates trigger; tsvector stays in sync automatically |
| `ON CONFLICT DO UPDATE` with application-layer check | Pure `ON CONFLICT` upsert; no prior SELECT | PostgreSQL 9.5 (2016) | Removes race condition; single round-trip per IOC |
| Pydantic v1 `Config` class | Pydantic v2 `model_config` dict | Pydantic 2.0 (2023) | Faster (Rust core); `model_validator` for cross-field validation |
| SQLAlchemy 1.4 legacy async | SQLAlchemy 2.0 `AsyncSession` + `async_sessionmaker` | SQLAlchemy 2.0 (2023) | Stable async API; `expire_on_commit=False` pattern standard |
| APScheduler 4.x (breaking rewrite) | APScheduler 3.x (3.11.2 current stable) | APScheduler 4.x is not yet stable | 3.x remains current stable as of PyPI check 2026-03-20 |

**Deprecated/outdated:**
- `databases` (encode/databases): Lighter than SQLAlchemy but lacks Alembic integration. Not worth the trade-off.
- Pydantic v1 `Config` class: Replaced by `model_config = ConfigDict(...)` in v2.
- `asyncio.get_event_loop()` pattern: Deprecated in Python 3.10+. Use `asyncio.get_running_loop()` or `asyncio.run()`.

---

## Open Questions

1. **Supabase PostgreSQL version**
   - What we know: Supabase typically runs PostgreSQL 15; generated columns require PG 12+.
   - What's unclear: Whether Supabase's specific managed PG version supports `GENERATED ALWAYS AS STORED` for TSVECTOR columns.
   - Recommendation: Test the generated column syntax in Supabase SQL editor in Wave 0 of plan 01-01. If unsupported, fall back to the trigger pattern documented in ARCHITECTURE.md.

2. **`pg_trgm` extension availability on Supabase free tier**
   - What we know: `pg_trgm` is a standard PostgreSQL extension supported by Supabase.
   - What's unclear: Whether it requires explicit enablement via Supabase dashboard or is pre-enabled.
   - Recommendation: Enable explicitly with `CREATE EXTENSION IF NOT EXISTS pg_trgm` in the migration — the `IF NOT EXISTS` guard makes it safe either way.

3. **Severity formula weight calibration**
   - What we know: The 40/35/25 weights (confidence/source count/recency) are a reasonable starting point based on TIP domain practice.
   - What's unclear: Whether these weights produce useful triage signal without analyst feedback.
   - Recommendation: Implement with named constants (`FEED_CONFIDENCE_WEIGHT = 0.40`) so weights can be changed with a one-line config edit. Add `score_version` to enable targeted recalculation. Document the rationale in a code comment.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in config.json — validation section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (no test infrastructure exists yet — Wave 0 creates it) |
| Config file | `backend/pytest.ini` — Wave 0 |
| Quick run command | `pytest tests/ -x -q` |
| Full suite command | `pytest tests/ -v --tb=short` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IOC-01 | `UNIQUE(value, type)` prevents duplicate rows; second insert updates, not duplicates | unit + integration | `pytest tests/test_upsert.py -x` | Wave 0 |
| IOC-01 | `NormalizedIOC` struct validates field types and `raw_confidence` range | unit | `pytest tests/test_schema.py -x` | Wave 0 |
| IOC-01 | Canonicalization functions produce consistent lowercase, stripped output | unit | `pytest tests/test_canonicalize.py -x` | Wave 0 |
| IOC-02 | `ioc_sources` row is always inserted (even on upsert conflict); raw_payload preserved | integration | `pytest tests/test_upsert.py::test_source_always_inserted -x` | Wave 0 |
| IOC-03 | `compute_severity()` returns score within 0.0–10.0 range for all input combos | unit | `pytest tests/test_scoring.py -x` | Wave 0 |
| IOC-03 | Upserted IOC row has `severity` populated and `score_explanation` non-null | integration | `pytest tests/test_upsert.py::test_severity_stored -x` | Wave 0 |
| IOC-04 | `recency_factor` decreases monotonically as `age_days` increases | unit | `pytest tests/test_scoring.py::test_recency_decay -x` | Wave 0 |
| IOC-05 | `infer_cooccurrence_relationships()` creates N*(N-1)/2 edges for N co-observed IOCs | unit | `pytest tests/test_relationships.py -x` | Wave 0 |
| IOC-05 | Duplicate edge insert is a no-op (ON CONFLICT DO NOTHING) | integration | `pytest tests/test_relationships.py::test_no_duplicate_edges -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/ -x -q`
- **Per wave merge:** `pytest tests/ -v --tb=short`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/pytest.ini` — pytest configuration with asyncio mode
- [ ] `backend/tests/conftest.py` — async DB session fixture (in-memory SQLite or test Supabase)
- [ ] `backend/tests/test_schema.py` — covers `NormalizedIOC` struct validation (IOC-01)
- [ ] `backend/tests/test_canonicalize.py` — covers per-type canonicalization (IOC-01)
- [ ] `backend/tests/test_scoring.py` — covers severity formula and decay (IOC-03, IOC-04)
- [ ] `backend/tests/test_upsert.py` — covers upsert idempotency and source logging (IOC-01, IOC-02, IOC-03)
- [ ] `backend/tests/test_relationships.py` — covers co-occurrence inference (IOC-05)
- [ ] Framework install: `pip install pytest pytest-asyncio pytest-cov`

---

## Sources

### Primary (HIGH confidence)
- PostgreSQL 15 documentation (https://www.postgresql.org/docs/15/) — DDL syntax, GIN indexes, pg_trgm, UNIQUE constraints, generated columns, INSERT ON CONFLICT
- SQLAlchemy 2.x async documentation (https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html) — AsyncSession, async_sessionmaker, dialect-specific insert
- Alembic documentation (https://alembic.sqlalchemy.org/en/latest/) — migration environment, op.create_table, op.execute
- Pydantic v2 documentation (https://docs.pydantic.dev/latest/) — BaseModel, field_validator, model_config, IOCType enum
- PyPI version registry (checked 2026-03-20) — SQLAlchemy 2.0.48, asyncpg 0.31.0, Alembic 1.18.4, pydantic 2.12.5, tldextract 5.3.1, pydantic-settings 2.13.1, apscheduler 3.11.2

### Secondary (MEDIUM confidence)
- Project prior research (`.planning/research/ARCHITECTURE.md`) — data model, upsert pattern, adjacency table design
- Project prior research (`.planning/research/PITFALLS.md`) — schema pitfalls, scoring pitfalls, RLS bypass pattern
- Project prior research (`.planning/research/STACK.md`) — library selection rationale

### Tertiary (LOW confidence — verify before use)
- Severity formula weights (40/35/25): design recommendation, not from published TIP standards. Treat as starting point.
- Supabase-specific PG version and extension availability: verify in Supabase dashboard before running migrations.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed against PyPI on research date; PostgreSQL patterns are stable and well-documented
- Architecture: HIGH — adjacency table, upsert semantics, GIN indexing are standard PostgreSQL patterns in use since PG 9.5+
- Pitfalls: HIGH — security (user_id FK, dedup constraint) and correctness (hash type granularity, bidirectional index) pitfalls are well-understood, not speculative

**Research date:** 2026-03-20
**Valid until:** 2026-09-20 (stable PostgreSQL + Python library domain; re-verify only if SQLAlchemy 3.x or Pydantic v3 releases)
