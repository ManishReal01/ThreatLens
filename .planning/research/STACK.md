# Technology Stack

**Project:** ThreatLens
**Researched:** 2026-03-20
**Overall Confidence:** MEDIUM (no external tool access; based on training knowledge through August 2025 — versions flagged as needing pin-verification before install)

---

## Locked-In Decisions (Not Re-Evaluated)

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 14.x / 15.x |
| Backend API + ingestion | FastAPI (Python) | 0.111+ |
| Database | PostgreSQL via Supabase | Supabase-managed |
| Auth | Supabase Auth | Supabase-managed |

---

## Recommended Stack: Supporting Libraries

### Background Job Scheduling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| APScheduler | 3.10.x | Cron-style feed ingestion scheduling | In-process, zero-infra; fits a single FastAPI process for v1. No Redis/broker required. AsyncIO scheduler variant works natively with FastAPI's async event loop. Supports cron, interval, and date triggers out of the box. |
| (future) Celery + Redis | 5.3.x | Migrate to if workers need horizontal scale | Only needed when ingestion jobs must run across multiple workers or queues become complex. Overkill for 3 feeds on a schedule. |

**Decision: APScheduler for v1.** Celery adds Redis broker, worker process management, and deployment complexity that is not justified for 3 scheduled feed jobs. APScheduler 3.x `AsyncIOScheduler` integrates cleanly with FastAPI's lifespan events (start/stop on app startup/shutdown).

**What NOT to use:**
- `schedule` (pip) — synchronous-only, blocks the event loop
- Celery in v1 — unnecessary complexity; two extra infra components (Redis + worker process)
- FastAPI-Scheduler — thin wrapper, less battle-tested than APScheduler directly

---

### HTTP Clients (Feed Ingestion)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| httpx | 0.27.x | Async HTTP requests to feed APIs | Native asyncio support; same API as `requests` so easy to migrate from. Used by FastAPI's own test client. Supports connection pooling, timeouts, retries via `httpx.AsyncClient`. |
| tenacity | 8.x | Retry logic with exponential backoff | Decorator-based retry wrapping around httpx calls. Handles transient feed API failures and rate-limit 429 responses gracefully. |

**What NOT to use:**
- `aiohttp` — More verbose; httpx has better ergonomics and is now the community standard for async Python HTTP
- `requests` — Synchronous; blocks the event loop in an async FastAPI context

---

### Rate Limiting (Feed APIs)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| asyncio-throttle | 1.0.x | Per-feed rate limiting | Simple token bucket / throttle for async tasks. Keeps ingestion workers from hammering AbuseIPDB (1000 req/day free tier) or OTX rate ceilings. |
| tenacity (also here) | 8.x | Automatic retry on 429 | Complements throttling; catches rate-limit errors and backs off correctly. |

**Pattern:** Each feed worker wraps its `httpx.AsyncClient` calls in an `asyncio-throttle` throttler configured to the feed's documented rate limit, with tenacity retry on 429/5xx.

---

### IOC Normalization and Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pydantic | 2.x | IOC schema validation and normalization | Already a FastAPI dependency. Define `IPv4Address`, `AnyHttpUrl`, `constr` hash patterns as field types. Pydantic v2 is dramatically faster than v1 (Rust-backed core). |
| python-validators | 0.22.x | Supplemental format validation | Lightweight validators for IP ranges, domain names, MD5/SHA1/SHA256 hash patterns when Pydantic's built-ins aren't granular enough. |
| ipaddress (stdlib) | — | IP normalization | Python stdlib; use for IPv4/IPv6 canonicalization, private-range filtering, and CIDR expansion. Zero dependencies. |
| tldextract | 3.x | Domain normalization | Extracts registered domain vs subdomain correctly using a maintained public suffix list. Essential for deduplicating `evil.bad.com` and `other.bad.com` against the same root. |

**What NOT to use:**
- `ioc-finder` (pip) — Useful for extracting IOCs from freeform text, but ThreatLens receives structured feed JSON, not freeform text. Adds unnecessary complexity.
- Custom regex IOC parsing — Brittle; use Pydantic types and ipaddress stdlib instead.

**Deduplication pattern:** After normalization, generate a deterministic `ioc_key` = `sha256(type + ":" + canonical_value)`. Use PostgreSQL `ON CONFLICT (ioc_key) DO UPDATE` for upsert semantics. This prevents duplicate rows across feed ingestion runs and across sources.

---

### PostgreSQL Search (IOC Tables)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL Full-Text Search (native) | — | Text search over IOC values, tags, notes | PostgreSQL's `tsvector`/`tsquery` handles substring and token search without extra infrastructure. Supabase exposes this natively. Good enough for v1. |
| pg_trgm (PostgreSQL extension) | — | Trigram similarity / LIKE-style search | Enables fast `ILIKE` queries and fuzzy matching on IOC strings (e.g., searching partial IPs or domain fragments). Enable via `CREATE EXTENSION pg_trgm;`. Supabase supports this. |
| Supabase PostgREST filters | — | Filtered API queries | Supabase's auto-generated REST layer handles `eq`, `gte`, `lte`, `in` filters for type/severity/feed/date range — no additional search library needed for structured filters. |

**What NOT to use in v1:**
- Elasticsearch / OpenSearch — Major operational overhead. PostgreSQL trigrams + FTS handle ThreatLens-scale search (millions of IOCs, not billions) cleanly.
- Meilisearch / Typesense — Reasonable alternatives if PostgreSQL FTS proves insufficient, but adds an extra service to operate. Defer unless search performance is measured as a bottleneck.

**Index strategy:** Add GIN indexes on the `tsvector` column and on `ioc_value` with `pg_trgm` for fast ILIKE. Add B-tree indexes on `ioc_type`, `severity`, `feed_source`, `first_seen`, `last_seen` for the filter combos analysts will use.

---

### Graph Visualization (IOC Relationships)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Flow (`@xyflow/react`) | 12.x | Interactive node-edge graph in React | **Recommended.** React-first API with hooks; integrates naturally with Next.js App Router. Handles panning, zooming, node drag, custom node/edge renderers out of the box. Strong community, active maintenance. Optimal for analyst-interactive graphs (click node to see IOC detail, drag to explore). |

**Alternatives considered:**

| Library | Verdict | Reason |
|---------|---------|--------|
| Cytoscape.js | Not recommended for v1 | Excellent for large graph analytics (10k+ nodes) but requires a wrapper (`react-cytoscapejs`) for React, and its API is more complex. Only worth it if ThreatLens needs graph layout algorithms (force-directed, hierarchical) on very large datasets. |
| D3.js (force simulation) | Not recommended | Raw D3 with React requires manual reconciliation of D3's DOM mutations and React's virtual DOM. High implementation complexity for the same output React Flow achieves with hooks. Save D3 for custom charts (severity histograms, feed health timelines) not for the graph canvas. |
| vis.js / sigma.js | Not recommended | Less React-native; smaller ecosystems in 2025; fewer maintained examples. |

**Use D3 for:** Severity scoring histograms, feed ingestion timelines, dashboard sparklines — where custom SVG charting is needed. React Flow for the IOC relationship graph.

**Charting library for dashboard:**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Recharts | 2.x | Dashboard charts (feed health, severity distribution) | React-native, composable, good defaults. Simpler than Victory or Nivo for the bar/line charts ThreatLens needs. |

---

### Data Access Layer (FastAPI ↔ PostgreSQL)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SQLAlchemy (async) | 2.x | ORM / query builder for FastAPI | SQLAlchemy 2.0 async mode with `asyncpg` driver is the standard for async FastAPI + PostgreSQL. Type-safe queries, migration support via Alembic. |
| asyncpg | 0.29.x | PostgreSQL async driver | Fastest async PostgreSQL driver in Python. Used by SQLAlchemy's async engine. |
| Alembic | 1.13.x | Database migrations | SQLAlchemy's official migration tool. Manages schema evolution — critical for a project that will add IOC type columns, relationship tables, and watchlist tables across milestones. |

**Alternative considered:** `databases` (encode/databases) — lighter than SQLAlchemy but lacks Alembic integration and full ORM features. Not worth the trade-off.

**Note on Supabase SDK:** `supabase-py` (the Python client) is primarily for Supabase Auth server-side operations and storage — use it for auth token verification middleware in FastAPI. Use SQLAlchemy + asyncpg for all database queries (more control, better async performance than PostgREST over HTTP).

---

### Data Validation (FastAPI Layer)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Pydantic v2 | 2.7+ | Request/response schemas, feed payload parsing | Already required by FastAPI. Use `model_validator` for cross-field IOC validation. v2's `model_config` replaces v1's `Config` class. |

---

### Frontend Supporting Libraries (Next.js)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TanStack Query (React Query) | 5.x | Server state, feed polling, IOC search results | Standard for async server state in Next.js App Router alongside RSC patterns. Handles caching, background refetch, and loading/error states for IOC search. |
| Zustand | 4.x | Client state (analyst workspace selections, active filters) | Minimal boilerplate; works inside Client Components without Provider wrapping complexity. For watchlist selection state, active graph node, filter panel state. |
| @xyflow/react | 12.x | IOC relationship graph (see above) | — |
| Recharts | 2.x | Dashboard charts | — |
| Tailwind CSS | 3.x | Utility-first styling | De facto standard for Next.js projects; JIT compilation, small output. |
| shadcn/ui | latest | Headless UI components | Radix UI primitives + Tailwind; analyst-facing tables, dialogs, dropdowns. Copy-paste into project (not a dependency). |

**What NOT to use:**
- Redux / Redux Toolkit — Overkill for ThreatLens's client state complexity. Zustand is sufficient.
- SWR — TanStack Query v5 has superset features and better TypeScript inference.
- Material UI / Chakra UI — Heavier than shadcn/ui; harder to customize for a security tool's dense data presentation.

---

### Authentication (FastAPI Side)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| supabase-py | 2.x | Supabase Auth JWT verification in FastAPI | Validates Supabase-issued JWTs in FastAPI dependency injection. Use `python-jose` or `PyJWT` under the hood to decode the JWT and extract user claims. |
| python-jose | 3.x | JWT decode/verify | Stable, widely used; handles RS256 JWTs that Supabase issues. |

---

### Environment and Configuration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pydantic-settings | 2.x | Typed environment variable management | Reads `.env` files into validated Pydantic models. Replaces `python-dotenv` for typed config. FastAPI-native pattern. |

---

## Alternatives Considered (Summary)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Scheduling | APScheduler 3.x | Celery + Redis | No broker infra needed for 3 jobs; overkill |
| Scheduling | APScheduler 3.x | `schedule` (pip) | Synchronous; blocks async event loop |
| HTTP client | httpx | aiohttp | httpx is simpler, better ergonomics, community standard |
| HTTP client | httpx | requests | Synchronous; wrong for async FastAPI |
| IOC text extract | Pydantic + stdlib | ioc-finder | ThreatLens gets structured JSON, not freeform text |
| Graph viz | React Flow | D3.js force graph | D3 + React reconciliation is high complexity for same output |
| Graph viz | React Flow | Cytoscape.js | Heavier API; React wrapper needed; overkill for v1 graph size |
| Search | pg_trgm + FTS | Elasticsearch | Massive operational overhead; not justified at ThreatLens scale |
| Search | pg_trgm + FTS | Meilisearch | Extra service; defer unless measured bottleneck |
| DB access | SQLAlchemy 2 async | supabase-py for queries | PostgREST HTTP adds latency; SQLAlchemy gives full query control |
| Client state | Zustand | Redux Toolkit | Overkill; Zustand sufficient for filter/workspace state |
| UI components | shadcn/ui | Material UI | MUI harder to customize for dense security data tables |

---

## Installation Reference

```bash
# FastAPI backend core
pip install fastapi uvicorn[standard] pydantic[email] pydantic-settings

# Database
pip install sqlalchemy[asyncio] asyncpg alembic

# HTTP and ingestion
pip install httpx tenacity asyncio-throttle

# Scheduling
pip install apscheduler

# IOC normalization
pip install tldextract python-validators

# Auth
pip install supabase python-jose[cryptography]

# Frontend (npm)
npm install @xyflow/react recharts zustand @tanstack/react-query
npm install tailwindcss shadcn-ui
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| APScheduler for scheduling | HIGH | Well-established pattern; FastAPI + APScheduler lifespan integration is documented and widely used |
| httpx + tenacity | HIGH | Industry standard for async Python HTTP as of 2024-2025 |
| Pydantic v2 for IOC validation | HIGH | FastAPI ships with Pydantic v2 as of FastAPI 0.100+ |
| React Flow for graph | MEDIUM | React Flow (xyflow) v12 released 2024; recommend verifying current API against their docs before building |
| pg_trgm + FTS for search | HIGH | Stable PostgreSQL feature; Supabase supports `pg_trgm` extension |
| SQLAlchemy 2 async | HIGH | Stable since 2023; asyncpg driver well-tested |
| asyncio-throttle | MEDIUM | Smaller library; verify it is still maintained before committing; alternative is manual token bucket with `asyncio.sleep` |
| Recharts | MEDIUM | Stable but less actively developed than Victory; verify latest version |
| shadcn/ui | MEDIUM | Rapidly evolving; verify component API for current Next.js 15 App Router compatibility |
| python-validators | LOW | Smaller library; verify PyPI activity before using; consider substituting with Pydantic v2 validators and stdlib |

---

## Versions to Verify Before Installing

All versions listed reflect knowledge through August 2025. Pin exact versions after running `pip install X` and `npm install X` to confirm latest stable:

- APScheduler: confirm 3.x vs 4.x (APScheduler 4.0 was in development as of mid-2025 with breaking async API changes — check if stable)
- React Flow: `@xyflow/react` — confirm v12 API (v11 had different import paths)
- SQLAlchemy: confirm 2.x async session patterns (not 1.4 legacy async)
- Supabase-py: confirm v2 (v1 had different client init API)

---

## Sources

- Knowledge through August 2025 training data (no live verification possible in this environment)
- APScheduler: https://apscheduler.readthedocs.io/
- React Flow: https://reactflow.dev/
- SQLAlchemy async: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- Pydantic v2: https://docs.pydantic.dev/latest/
- Supabase Python client: https://supabase.com/docs/reference/python/
- FastAPI docs: https://fastapi.tiangolo.com/
- PostgreSQL pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
