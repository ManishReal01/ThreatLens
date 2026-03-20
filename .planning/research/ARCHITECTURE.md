# Architecture Patterns

**Project:** ThreatLens
**Researched:** 2026-03-20
**Confidence note:** Web search and WebFetch were unavailable during this research session. All findings are from training data (cutoff August 2025) covering MISP, OpenCTI, and PostgreSQL patterns. Confidence levels are marked accordingly; critical decisions should be spot-checked against official docs before implementation.

---

## Recommended Architecture

ThreatLens follows a **pipeline-and-hub** architecture: independent ingestion workers push normalized records into a central PostgreSQL store, which serves as the single source of truth for all downstream consumers (API, search, graph, analyst workspace).

```
                        +------------------+
                        |  Scheduled Cron  |
                        |  (APScheduler or |
                        |   system cron)   |
                        +--------+---------+
                                 |
             +-------------------+-------------------+
             |                   |                   |
    +--------v-------+  +--------v-------+  +--------v-------+
    | AbuseIPDB      |  | URLhaus        |  | AlienVault OTX |
    | Worker         |  | Worker         |  | Worker         |
    | (FastAPI BG    |  | (FastAPI BG    |  | (FastAPI BG    |
    |  task / celery)|  |  task / celery)|  |  task / celery)|
    +--------+-------+  +--------+-------+  +--------+-------+
             |                   |                   |
             +-------------------+-------------------+
                                 |
                    +------------v-----------+
                    |  Normalization Layer   |
                    |  (shared lib, called   |
                    |   by each worker)      |
                    +------------+-----------+
                                 |
                    +------------v-----------+
                    |  PostgreSQL (Supabase) |
                    |  - iocs table          |
                    |  - ioc_sources table   |
                    |  - ioc_relationships   |
                    |  - feed_runs           |
                    |  - analyst workspace   |
                    +--+------+------+-------+
                       |      |      |
            +----------+  +---+  +---+----------+
            |              |          |
   +--------v----+  +------v----+  +--v-----------+
   | FastAPI     |  | PG Full-  |  | Graph Query  |
   | REST API    |  | Text +    |  | (SQL adj.    |
   |             |  | GIN Index |  |  table)      |
   +--------+----+  +-----------+  +--------------+
            |
   +--------v----+
   | Next.js     |
   | Frontend    |
   | - Dashboard |
   | - Search UI |
   | - Graph Viz |
   | - Workspace |
   +-------------+
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Owns |
|-----------|---------------|-------------------|------|
| Feed Workers (per-source) | Poll external APIs on schedule; fetch raw feed data; respect rate limits | Normalization Layer (call), PostgreSQL (write `ioc_sources`, `feed_runs`) | Nothing persistent — stateless per run |
| Normalization Layer | Parse raw feed payloads; extract IOC value + type; compute initial severity; dedup check | PostgreSQL (read for dedup, write canonical IOC) | Shared schema/type definitions |
| PostgreSQL / Supabase | Persist all IOCs, source observations, relationships, analyst data | Everything | All persistent state |
| FastAPI REST API | Expose IOC search, CRUD for workspace, feed health, graph endpoints | PostgreSQL (read-heavy), Supabase Auth (verify JWT) | Request validation, response shaping |
| Next.js Frontend | Render dashboard, search, graph, workspace; call FastAPI | FastAPI REST API only | No direct DB access |
| Supabase Auth | Issue JWTs; manage user accounts | FastAPI (JWT verification), Next.js (login flow) | Identity, sessions |

**Boundary rules:**
- Workers never write to the `iocs` table directly — they call the normalization layer, which handles dedup and upsert.
- Frontend never calls Supabase directly (no direct DB queries from the browser) — all reads go through FastAPI.
- Graph queries are SQL-only against the `ioc_relationships` table — no separate graph DB needed at v1 scale.

---

## Data Model

### Core Tables

```sql
-- Canonical IOC record (one row per unique value+type)
CREATE TABLE iocs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value       TEXT NOT NULL,           -- "1.2.3.4", "evil.com", "abc123...", "http://..."
    type        TEXT NOT NULL,           -- 'ip', 'domain', 'hash_md5', 'hash_sha256', 'url'
    severity    NUMERIC(4,2),            -- composite score 0.0–10.0
    first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_count INT NOT NULL DEFAULT 1,
    metadata    JSONB,                   -- type-specific extras (ASN, country, filename, etc.)
    ts_vector   TSVECTOR,               -- generated for full-text search
    UNIQUE(value, type)
);

-- GIN index for full-text search
CREATE INDEX iocs_ts_vector_idx ON iocs USING GIN(ts_vector);

-- B-tree indexes for filter queries
CREATE INDEX iocs_type_idx ON iocs(type);
CREATE INDEX iocs_severity_idx ON iocs(severity DESC);
CREATE INDEX iocs_last_seen_idx ON iocs(last_seen DESC);
CREATE INDEX iocs_source_count_idx ON iocs(source_count DESC);

-- Trigram index for substring/prefix search (requires pg_trgm)
CREATE INDEX iocs_value_trgm_idx ON iocs USING GIN(value gin_trgm_ops);
```

```sql
-- Per-source observation record (one row per IOC per feed per ingestion run)
CREATE TABLE ioc_sources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_id      UUID REFERENCES iocs(id) ON DELETE CASCADE,
    feed_name   TEXT NOT NULL,           -- 'abuseipdb', 'urlhaus', 'otx'
    raw_score   NUMERIC,                 -- feed's own confidence/score field
    raw_payload JSONB,                   -- original feed record for audit
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    feed_run_id UUID REFERENCES feed_runs(id)
);

CREATE INDEX ioc_sources_ioc_id_idx ON ioc_sources(ioc_id);
CREATE INDEX ioc_sources_feed_name_idx ON ioc_sources(feed_name);
```

```sql
-- Feed ingestion run log (for health dashboard)
CREATE TABLE feed_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_name    TEXT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status       TEXT NOT NULL DEFAULT 'running',  -- 'running', 'success', 'error'
    iocs_fetched INT DEFAULT 0,
    iocs_new     INT DEFAULT 0,
    iocs_updated INT DEFAULT 0,
    error_msg    TEXT
);
```

```sql
-- IOC relationship graph (adjacency table)
CREATE TABLE ioc_relationships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ioc   UUID REFERENCES iocs(id) ON DELETE CASCADE,
    target_ioc   UUID REFERENCES iocs(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,   -- 'resolves_to', 'observed_with', 'serves', 'downloads'
    confidence   NUMERIC(4,2),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_ioc, target_ioc, relationship)
);

CREATE INDEX ioc_rel_source_idx ON ioc_relationships(source_ioc);
CREATE INDEX ioc_rel_target_idx ON ioc_relationships(target_ioc);
```

```sql
-- Analyst workspace tables
CREATE TABLE tags (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_id  UUID REFERENCES iocs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,   -- from Supabase Auth
    tag     TEXT NOT NULL,
    UNIQUE(ioc_id, user_id, tag)
);

CREATE TABLE notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ioc_id     UUID REFERENCES iocs(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE watchlists (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    ioc_id  UUID REFERENCES iocs(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, ioc_id)
);
```

**Why this schema over alternatives:**
- Normalized `iocs` + `ioc_sources` (not JSONB blob per IOC): enables efficient filter queries (by type, severity, feed, date) without JSON extraction; JOIN cost is acceptable at v1 scale (millions of rows, not billions).
- `metadata JSONB` column on `iocs`: holds type-specific fields (ASN for IPs, file extension for hashes) that don't warrant their own columns, avoiding premature column sprawl.
- `ts_vector` + GIN for full-text search: handles prefix/substring searches across `value` field without Elasticsearch. `pg_trgm` trigram index handles partial matches (e.g., "evil.co" finding "evil.com"). Both are built into PostgreSQL — no additional service.
- Adjacency table for relationships (not a graph DB like Neo4j): sufficient for the relationship depth expected in v1. A domain resolves to an IP resolves to an ASN — rarely more than 3 hops. SQL recursive CTEs handle traversal. Graph DB adds operational complexity unjustified at this scale.

**Confidence: HIGH** — These patterns (GIN index for FTS, trigram for substring, adjacency tables for light graphs) are well-documented PostgreSQL practices verified against PostgreSQL 15/16 documentation known as of training cutoff.

---

## Feed Ingestion Architecture

### Polling vs Webhooks

AbuseIPDB, URLhaus, and AlienVault OTX all expose **pull-based REST APIs** — none offer push/webhook delivery for their free tiers. Polling is the only option for v1.

**Recommended approach: APScheduler inside FastAPI** (not Celery).

At v1 scale (3 feeds, polling every 15–60 minutes), APScheduler running as a background scheduler within the FastAPI process is sufficient. Celery adds broker infrastructure (Redis/RabbitMQ) that is unnecessary overhead until you have 10+ feeds or need job retries at scale.

```python
# main.py — scheduler setup
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def start_scheduler():
    scheduler.add_job(run_abuseipdb_worker, "interval", hours=1, id="abuseipdb")
    scheduler.add_job(run_urlhaus_worker, "interval", hours=4, id="urlhaus")
    scheduler.add_job(run_otx_worker, "interval", hours=6, id="otx")
    scheduler.start()
```

**Polling intervals (guidance based on API terms of free tiers):**
- AbuseIPDB: max 1,000 requests/day on free tier — poll every 60 minutes
- URLhaus: no rate limit documented for bulk download — poll every 4 hours (feed refreshes ~hourly)
- AlienVault OTX: free API key, documented at 1,000 requests/hour — poll every 6 hours

### Deduplication Strategy

```
For each IOC value extracted from a feed response:
  1. Normalize: lowercase, strip whitespace, validate type
  2. Compute canonical key: (value, type) pair
  3. Upsert into `iocs`: INSERT ... ON CONFLICT(value, type) DO UPDATE SET last_seen, severity, source_count
  4. Always INSERT into `ioc_sources`: one record per ingestion observation (raw payload preserved)
  5. Update `feed_runs` counters: iocs_new vs iocs_updated via RETURNING clause
```

PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` (upsert) is the dedup primitive. No application-layer dedup logic needed — the DB constraint enforces uniqueness.

**Confidence: HIGH** — PostgreSQL upsert on `UNIQUE(value, type)` is a standard, well-documented pattern.

### Normalization Schema

Each worker outputs a `NormalizedIOC` struct before writing:

```python
@dataclass
class NormalizedIOC:
    value: str           # canonical form
    ioc_type: str        # 'ip' | 'domain' | 'hash_md5' | 'hash_sha256' | 'url'
    raw_score: float     # feed's confidence score (0–100 or 0–1, normalized to 0–10)
    feed_name: str       # 'abuseipdb' | 'urlhaus' | 'otx'
    raw_payload: dict    # original record for audit
    metadata: dict       # type-specific extras
```

Workers are responsible for mapping feed-specific field names to this struct. The normalization layer owns the DB write and severity computation. This keeps workers thin and testable independently.

---

## Severity Scoring

Composite score formula (applied in normalization layer, stored on `iocs.severity`):

```
severity = (
    feed_confidence_score * 0.40   +   # normalized 0–10 from feed's own score
    source_count_factor   * 0.35   +   # log-scaled: 1 source=0, 3+=10
    recency_factor        * 0.25       # last_seen within 7d=10, 30d=5, 90d+=0
)
```

Recomputed on every upsert. Stored denormalized on `iocs` for sort/filter efficiency — do not compute on query.

**Confidence: MEDIUM** — Weighting is a design choice not sourced from official docs; the formula above is a reasonable starting point based on how MISP and ThreatConnect approach composite scoring. Teams should adjust weights based on analyst feedback.

---

## IOC Search Architecture

No Elasticsearch. PostgreSQL handles all search needs at v1:

| Search Type | Mechanism | Index |
|-------------|-----------|-------|
| Exact lookup | `WHERE value = $1 AND type = $2` | B-tree on `(value, type)` UNIQUE constraint |
| Prefix search | `WHERE value LIKE 'evil.co%'` | trigram GIN (`gin_trgm_ops`) |
| Substring search | `WHERE value ILIKE '%evil%'` | trigram GIN |
| Full-text on metadata | `WHERE ts_vector @@ to_tsquery($1)` | GIN on `ts_vector` |
| Filter by type | `WHERE type = 'ip'` | B-tree on `type` |
| Filter by severity | `WHERE severity >= 7.0 ORDER BY severity DESC` | B-tree on `severity` |
| Filter by date range | `WHERE last_seen >= $1 AND last_seen <= $2` | B-tree on `last_seen` |
| Filter by feed | `WHERE id IN (SELECT ioc_id FROM ioc_sources WHERE feed_name = $1)` | B-tree on `ioc_sources.feed_name` |

The `ts_vector` column should be maintained by a PostgreSQL trigger on INSERT/UPDATE to stay current:

```sql
CREATE OR REPLACE FUNCTION update_ioc_tsvector() RETURNS TRIGGER AS $$
BEGIN
    NEW.ts_vector := to_tsvector('english', NEW.value || ' ' || COALESCE(NEW.metadata::text, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER iocs_tsvector_update
    BEFORE INSERT OR UPDATE ON iocs
    FOR EACH ROW EXECUTE FUNCTION update_ioc_tsvector();
```

**When to add Elasticsearch:** Only if query latency exceeds ~500ms for common searches at scale, or if you need fuzzy matching beyond trigram. At v1 scale (single-digit million IOCs), PostgreSQL with proper indexes is sufficient.

**Confidence: HIGH** — `pg_trgm` and `GIN` indexes for FTS are core PostgreSQL features (available since PG 9.x), well-documented and production-proven.

---

## Graph Visualization Architecture

### Data Model (adjacency table, established above)

Graph queries use recursive CTEs for hop traversal:

```sql
-- Get 2-hop neighbors of an IOC
WITH RECURSIVE graph AS (
    SELECT source_ioc, target_ioc, relationship, 1 as depth
    FROM ioc_relationships
    WHERE source_ioc = $1 OR target_ioc = $1
    UNION
    SELECT r.source_ioc, r.target_ioc, r.relationship, g.depth + 1
    FROM ioc_relationships r
    JOIN graph g ON (r.source_ioc = g.target_ioc OR r.source_ioc = g.source_ioc)
    WHERE g.depth < 2
)
SELECT DISTINCT * FROM graph;
```

Cap traversal depth at 3 hops for UI rendering performance.

### Frontend Rendering

D3.js force-directed layout or Cytoscape.js — both handle the node counts expected (tens to low hundreds per query). Cytoscape.js has better built-in layout algorithms and TypeScript types; D3 gives more control but more implementation work.

**Recommendation: Cytoscape.js** — its `cytoscape-fcose` layout is well-suited to sparse security graphs and requires less custom code than D3 force simulation.

**Confidence: MEDIUM** — Cytoscape.js recommendation based on training data community usage patterns; no web verification available.

### How Relationships Are Created

In v1, relationships are inferred during ingestion based on co-occurrence:
- OTX pulse: if an IP and domain appear in the same pulse record, create `observed_with` relationship.
- URLhaus: if a URL and its resolved domain both appear in the same fetch, create `serves` relationship.
- Manual: analyst can assert relationships via workspace UI (stored as `confidence=1.0`, `relationship='analyst_linked'`).

Do not attempt automated DNS-based relationship building in v1 — rate limits and API costs add complexity. Defer to a future milestone.

---

## How MISP and OpenCTI Structure Their Data Models (Reference)

These are architectural references, not things to copy directly. ThreatLens is intentionally simpler.

### MISP

**Confidence: MEDIUM** (training data, no verification)

- Core entity: **Event** — a container for a set of related Attributes (their term for IOCs).
- **Attribute** = IOC value + type + category + comment + IDS flag (whether to use in blocking rules).
- Events have **Tags** (taxonomic labels from MISP taxonomies or custom).
- **Object Templates**: groups of related Attributes (e.g., a "domain-ip" object linking a domain and its resolved IP).
- **Galaxies**: structured threat actor / technique metadata (maps to MITRE ATT&CK).
- Storage: MySQL, flat attribute rows, with relationships encoded in MISP Objects.
- Key takeaway for ThreatLens: MISP's "Object" concept (grouping co-occurring IOCs) is what the `ioc_relationships` table handles. Start simpler — don't implement the full taxonomy system.

### OpenCTI

**Confidence: MEDIUM** (training data, no verification)

- Built on **STIX 2.1** data model natively — everything is a STIX object.
- Entities: Indicator, Observable, Threat Actor, Campaign, Malware, Attack Pattern (MITRE), Report.
- Storage: ElasticSearch for entities + MinIO for files + Redis for caching + RabbitMQ for async.
- Uses **Connector** pattern for feed ingestion — each feed is a separate connector process, messages go through RabbitMQ, OpenCTI workers consume and write.
- Key takeaway for ThreatLens: The Connector pattern (isolated feed worker per source) is the right model. But OpenCTI's full stack (ES + Redis + RabbitMQ + MinIO) is operationally heavy. ThreatLens's approach of APScheduler workers writing to PostgreSQL is a deliberate simplification appropriate for v1.
- OpenCTI's STIX-native model is powerful but adds complexity (STIX relationship types, Bundle serialization). ThreatLens uses a pragmatic custom schema instead.

**ThreatLens design decision:** Do not adopt STIX 2.1 natively in v1. It adds significant schema complexity (Bundle/SDO/SRO model) with no user-facing benefit at this stage. Use the simpler normalized schema above and document that future STIX export is possible via a serialization layer.

---

## Data Flow (End-to-End)

```
External Feed APIs
       |
       | (HTTP polling, scheduled)
       v
Feed Workers (FastAPI background tasks, per feed)
  - Fetch paginated API response
  - Extract raw IOC records
  - Pass each to Normalization Layer
       |
       v
Normalization Layer (shared Python module)
  - Parse + validate IOC value and type
  - Map feed score → 0–10 scale
  - Compute composite severity score
  - Build NormalizedIOC struct
  - Execute upsert: INSERT ... ON CONFLICT DO UPDATE on `iocs`
  - INSERT into `ioc_sources` (always, preserves raw payload)
  - Infer co-occurrence relationships → INSERT into `ioc_relationships`
  - UPDATE `feed_runs` counters
       |
       v
PostgreSQL (Supabase)
  - `iocs` (canonical store)
  - `ioc_sources` (per-observation log)
  - `ioc_relationships` (graph edges)
  - `feed_runs` (ingestion health)
  - `tags`, `notes`, `watchlists` (analyst workspace)
       |
  +---------+
  |         |
  v         v
FastAPI     (direct — future: Supabase Realtime for dashboard)
REST API
  - /api/iocs/search
  - /api/iocs/{id}
  - /api/iocs/{id}/graph
  - /api/feeds/status
  - /api/workspace/tags|notes|watchlists
  - /api/export (CSV/JSON)
  |
  | JWT verified against Supabase Auth
  v
Next.js Frontend
  - Dashboard (recent IOCs, feed health)
  - Search UI (filters + results table)
  - IOC detail page (sources, severity, relationships)
  - Graph viz (Cytoscape.js, fetched from /graph endpoint)
  - Analyst workspace (tags, notes, watchlists)
  - Auth pages (Supabase Auth UI or custom)
```

---

## Patterns to Follow

### Pattern 1: Upsert-Centric Ingestion

**What:** Every worker run is idempotent. Workers fetch all available records from a feed and upsert — existing IOCs get `last_seen` and severity updated, new ones are inserted. No "have I seen this before?" check in application code.

**When:** Every feed ingestion run.

**Why:** Simplifies workers enormously. PostgreSQL `ON CONFLICT DO UPDATE` is atomic and correct. Workers become stateless — no need to track cursor position per feed in application memory (though storing a `since` timestamp in `feed_runs` is useful for incremental fetches on feeds that support it).

### Pattern 2: Thin Workers, Fat Normalization Layer

**What:** Each feed worker contains only feed-specific API client code. All schema mapping, severity computation, dedup logic, and DB writes live in a shared normalization module.

**When:** Adding any new feed.

**Why:** Adding feed #4 (e.g., MalwareBazaar) requires writing only a thin API client that produces `NormalizedIOC` structs — no DB logic to duplicate.

### Pattern 3: Separate `ioc_sources` from `iocs`

**What:** `iocs` stores one canonical row per unique IOC. `ioc_sources` stores one row per feed observation per ingestion run.

**When:** Always — never merge these.

**Why:** Analysts need to answer "which feeds reported this IP?" and "what did AbuseIPDB say the score was last Tuesday?" Both require the observation log. Merging into a single row loses this audit capability.

### Pattern 4: Graph as Adjacency Table (Not Graph DB)

**What:** Store IOC relationships as rows in `ioc_relationships(source_ioc, target_ioc, relationship)`. Query with recursive CTEs.

**When:** v1 — up to ~1M IOCs and low relationship density.

**Why:** Avoids Neo4j/ArangoDB operational overhead. PostgreSQL recursive CTEs handle 2–3 hop traversal adequately. Revisit if graph queries exceed 1 second at production scale.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: One JSONB Blob Per IOC

**What:** Storing the entire feed record as JSONB on the IOC row and querying with JSON operators.

**Why bad:** JSON operator queries (`->>`, `@>`) can't use B-tree indexes efficiently. Filter queries (by type, severity, date range) become full table scans. Reporting ("how many IPs with severity > 7?") becomes slow.

**Instead:** Normalize the fields you filter/sort on into columns. Keep `metadata JSONB` only for type-specific extras that aren't query predicates.

### Anti-Pattern 2: Dedup in Application Code Before Insert

**What:** Querying `SELECT id FROM iocs WHERE value=$1 AND type=$2` before each insert to check existence.

**Why bad:** Race condition under concurrent workers. Two workers fetching the same IOC simultaneously both see "not exists" and both try to insert — one fails. Adds a round-trip per IOC.

**Instead:** Use `INSERT ... ON CONFLICT DO UPDATE`. Let the DB enforce uniqueness atomically.

### Anti-Pattern 3: Frontend Calling Supabase Directly

**What:** Using Supabase JS client in Next.js to query the `iocs` table directly from the browser.

**Why bad:** Bypasses FastAPI business logic (severity computation, access control, rate limiting). Supabase Row Level Security (RLS) can partially mitigate this, but you'd duplicate business rules in RLS policies. Couples frontend directly to DB schema — any schema change breaks the frontend.

**Instead:** All reads go through FastAPI. FastAPI owns the query logic, pagination, and response shaping.

### Anti-Pattern 4: Shared Mutable State in Workers

**What:** Workers sharing in-memory state (e.g., a Python set of "seen IOC values this run") to skip dedup.

**Why bad:** Fails on process restart. Doesn't work if workers ever become distributed. Creates inconsistency bugs.

**Instead:** All state lives in PostgreSQL. Workers are stateless except for the `since` timestamp they read from `feed_runs` at startup.

### Anti-Pattern 5: Computing Severity at Query Time

**What:** `SELECT *, (formula) AS severity FROM iocs ORDER BY severity DESC`.

**Why bad:** Can't index a computed expression efficiently. Every search re-computes severity for all matching rows.

**Instead:** Store `severity` as a column, updated on upsert. Index it. Recompute only on ingestion (cheap, batch).

---

## Scalability Considerations

| Concern | At 100K IOCs | At 5M IOCs | At 50M IOCs |
|---------|--------------|------------|-------------|
| Search latency | GIN + B-tree indexes, <50ms | Same, <200ms | May need partial indexes or read replicas |
| Feed ingestion throughput | APScheduler in-process, fine | APScheduler fine | Consider Celery + worker pool |
| Graph queries | Recursive CTE <100ms | CTE <500ms, add depth limit | Consider Neo4j or Dgraph |
| Storage | ~1GB | ~50GB (Supabase free tier: 500MB — upgrade required) | Dedicated PG instance |
| API concurrency | FastAPI async handles 100s RPS | Same | Add caching layer (Redis) |

**Supabase free tier constraint:** 500MB database storage. At ~500 bytes per IOC row (with source observations), this allows ~1M IOCs before hitting the free tier limit. Plan for a paid Supabase tier or self-hosted Postgres before going to production with real feeds.

**Confidence: MEDIUM** — Supabase tier limits from training data; verify current pricing at supabase.com before making decisions.

---

## Suggested Build Order

Dependencies flow bottom-up. Each phase must be complete before the next is useful.

```
Phase 1: Data Foundation
├── PostgreSQL schema (iocs, ioc_sources, ioc_relationships, feed_runs)
├── Normalization layer (NormalizedIOC struct, upsert logic, severity formula)
└── Dependency: everything else depends on this schema being stable

Phase 2: Feed Ingestion
├── AbuseIPDB worker (simplest — single IOC type: IP)
├── URLhaus worker (URL type, bulk download pattern)
├── OTX worker (multi-type: IPs, domains, hashes, URLs via pulses API)
├── APScheduler wiring in FastAPI
└── Dependency: Phase 1 schema + normalization layer

Phase 3: API Layer
├── FastAPI endpoints: search, IOC detail, feed health
├── Supabase Auth JWT verification middleware
├── Pagination + filter query logic
└── Dependency: Phase 2 data to develop against

Phase 4: Frontend Core (Dashboard + Search)
├── Next.js app setup, Supabase Auth integration
├── Dashboard page: recent IOCs, feed health status
├── Search page: filter bar, results table, IOC detail view
└── Dependency: Phase 3 API

Phase 5: Graph Visualization
├── Recursive CTE graph query endpoint (/api/iocs/{id}/graph)
├── Cytoscape.js graph component in Next.js
└── Dependency: Phase 3 API + Phase 2 relationship data populated

Phase 6: Analyst Workspace
├── Tags, notes, watchlists API endpoints + DB tables
├── Frontend workspace UI
├── CSV/JSON export endpoint
└── Dependency: Phase 3 API + Phase 4 auth flow

Phase 7: Hardening
├── Rate limiting for feed API calls
├── Error handling + alerting for failed feed runs
├── Feed run history UI in dashboard
└── Dependency: All prior phases
```

**Rationale for this order:**
- Schema first — a schema change mid-project forces data migrations that cascade through API and frontend.
- Workers before API — you need real data to develop and test search queries against; seeding with fixtures works but real feed data reveals edge cases faster.
- Search before graph — search is the core value proposition; graph is a differentiator. Get the foundation right first.
- Auth integrated at Phase 3 API layer — simpler to add auth to a working API than to build auth into a skeleton and debug both simultaneously.

---

## Sources

**Note:** Web search and WebFetch were unavailable during this research session. All findings are from training data (cutoff August 2025).

| Claim | Confidence | Basis |
|-------|------------|-------|
| PostgreSQL GIN index for full-text search | HIGH | PG documentation patterns, widely documented |
| pg_trgm trigram index for substring/prefix | HIGH | Core PostgreSQL extension, documented since PG 9.1 |
| Adjacency table + recursive CTE for graph traversal | HIGH | Standard SQL pattern, PG documentation |
| INSERT ON CONFLICT DO UPDATE for dedup | HIGH | PostgreSQL UPSERT documented in PG 9.5+ |
| APScheduler sufficiency over Celery at v1 scale | MEDIUM | Community practice, no official benchmark |
| AbuseIPDB / URLhaus / OTX rate limits | MEDIUM | Training data from feed documentation; verify against current API docs before implementation |
| Cytoscape.js recommendation over D3 | MEDIUM | Community usage patterns, training data only |
| MISP data model description | MEDIUM | Training data from MISP documentation |
| OpenCTI architecture description | MEDIUM | Training data from OpenCTI documentation |
| Supabase free tier storage limit (500MB) | MEDIUM | Training data; verify at supabase.com |
| Severity formula weightings | LOW | Design recommendation, not sourced from official docs |

**Items to verify before implementation:**
- Current Supabase free tier limits: https://supabase.com/pricing
- AbuseIPDB API rate limits: https://docs.abuseipdb.com/
- URLhaus bulk download: https://urlhaus-api.abuse.ch/
- AlienVault OTX API docs: https://otx.alienvault.com/api
- Cytoscape.js current docs: https://js.cytoscape.org/
- APScheduler docs: https://apscheduler.readthedocs.io/
