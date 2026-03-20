# Project Research Summary

**Project:** ThreatLens
**Domain:** Web-based OSINT Threat Intelligence Platform (TIP)
**Researched:** 2026-03-20
**Confidence:** MEDIUM (training data only; external tool access unavailable — see gaps below)

## Executive Summary

ThreatLens is a threat intelligence aggregation platform built for SOC analysts: it ingests OSINT feeds (AbuseIPDB, URLhaus, AlienVault OTX), normalizes and deduplicates IOCs, scores them by severity, and surfaces them through search, a dashboard, and an interactive relationship graph. The established approach — used at smaller scale by MISP and OpenCTI equivalents — is a **pipeline-and-hub** model: isolated, stateless feed workers push normalized records into a central PostgreSQL store that serves as the single source of truth for all consumers. The locked-in stack (Next.js + FastAPI + Supabase/PostgreSQL) is well-suited to this model. Supporting library choices are straightforward: APScheduler for scheduling (no broker needed at v1), SQLAlchemy 2 async + asyncpg for database access, httpx + tenacity for HTTP with retry, and React Flow / Recharts on the frontend.

The recommended build order flows from dependencies: schema and normalization contracts come before any worker code, workers come before the API (so real data exists to develop against), and the API comes before the frontend. The interactive graph visualization is the product's primary differentiator per project intent; it depends on the relationship data model being designed in Phase 1 even though the visualization ships later. Authentication and user-scoped workspace features are architecturally straightforward but carry meaningful security pitfalls that must be addressed at the schema level before analyst workspace features ship.

The most impactful risks are in the data layer: ingest raw feed data without a canonical normalization contract and all downstream features — scoring, search, graph — become feed-specific and unmaintainable. Secondary risks are the Supabase service role key bypassing row-level security on analyst-owned data (a real IDOR risk), and graph query performance collapsing on well-connected IOCs if traversal is uncapped. Both are well-understood problems with clear mitigations that must be built in from the start, not retrofitted.

---

## Key Findings

### Recommended Stack

The core stack is fixed. The supporting library choices are clear and low-controversy. APScheduler 3.x `AsyncIOScheduler` is the right scheduler for v1 — it integrates with FastAPI's lifespan events and requires no broker infrastructure. For feed HTTP clients, `httpx` (async) + `tenacity` (retry/backoff) is the community standard and must be paired with per-feed rate limit configuration to avoid burning free-tier API quotas in production. SQLAlchemy 2 async + asyncpg is the correct data access path; using `supabase-py` for database queries adds PostgREST latency and loses query control — reserve it for auth token verification only.

On the frontend, React Flow (`@xyflow/react`) is recommended for the IOC relationship graph; Cytoscape.js is also viable and offers better built-in layout algorithms for sparse security graphs (Dagre, fcose). Recharts handles dashboard charts. TanStack Query v5 for server state + Zustand for client state is the appropriate pairing for Next.js App Router. The key version risk is APScheduler, which had a v4 API-breaking rewrite in development as of mid-2025 — verify whether 3.x or 4.x is the current stable release before installing.

**Core technologies:**
- **APScheduler 3.x (AsyncIOScheduler):** Feed scheduling — zero-infra, native FastAPI async integration
- **httpx + tenacity:** Async HTTP to feed APIs with exponential backoff retry
- **asyncio-throttle:** Per-feed rate limiting to protect free-tier API quotas
- **SQLAlchemy 2.x async + asyncpg:** Type-safe async PostgreSQL access via FastAPI
- **Alembic:** Schema migrations — essential for a multi-phase schema that will evolve
- **Pydantic v2:** IOC schema validation and normalization contracts (already a FastAPI dependency)
- **tldextract + ipaddress (stdlib):** Domain and IP canonicalization for deduplication
- **pg_trgm + PostgreSQL GIN indexes:** IOC substring/fuzzy search without Elasticsearch
- **React Flow (`@xyflow/react`):** Interactive IOC relationship graph
- **Recharts:** Dashboard charts (feed health, severity distribution)
- **TanStack Query v5 + Zustand:** Frontend server state and client state management
- **shadcn/ui + Tailwind CSS:** Dense, analyst-appropriate UI components

### Expected Features

**Must have (table stakes) — all needed for analyst adoption:**
- IOC search with exact and partial match across IP, domain, hash, URL types
- Filter by IOC type, feed source, severity, and date range
- Composite severity / risk scoring (composite, not raw per-feed values)
- IOC detail page with full source corroboration, timestamps, relationships
- Recent threats dashboard with feed health status per source
- Tags and analyst notes (per-IOC, attributed to analyst)
- Watchlists (per-user saved IOC sets)
- CSV / JSON export of filtered results
- Multi-user auth with per-analyst attribution on all annotations
- Responsive web UI (split-screen analyst workflow)

**Should have (differentiators) — ThreatLens's competitive edge:**
- Interactive IOC relationship graph (the primary differentiator per project intent)
- Multi-source corroboration count displayed alongside composite score
- Feed confidence weighting and IOC age decay in severity model
- Bulk IOC lookup (batch query for 50+ IPs/hashes — v1.5 at earliest)
- STIX/TAXII export (professional team sharing — dedicated milestone)

**Defer to v2+:**
- Alerting on watchlist matches (requires notification infrastructure)
- Campaign grouping (needs usage data to design well)
- Historical IOC timeline / score snapshots (schema must be forward-compatible)
- Saved searches (URL bookmarks are a sufficient workaround)
- Feed comparison view (build after multiple feeds stabilize)

**Explicit anti-features (do not build):**
- Automated threat response / SOAR integration
- Real-time streaming ingestion (scheduled polling is sufficient for OSINT feeds)
- Per-user feed API key management
- Unlimited data retention without purge/decay policy
- Custom scoring formula builder UI

### Architecture Approach

ThreatLens follows a pipeline-and-hub architecture. Independent, stateless feed workers (one per source) poll external APIs on a schedule, translate raw responses to a canonical `NormalizedIOC` struct, and upsert into a central PostgreSQL store. All business logic (severity scoring, dedup, relationship inference) lives in a shared normalization layer, not in individual workers — this means adding a fourth feed requires only a thin API adapter. The FastAPI REST API is the exclusive access layer for the Next.js frontend; the frontend never queries the database directly. Graph data lives in a SQL adjacency table queried with recursive CTEs — no separate graph database is justified at v1 scale.

**Major components:**
1. **Feed Workers (per source)** — Stateless HTTP pollers; translate feed-specific payloads to canonical struct; own no persistent state
2. **Normalization Layer (shared module)** — Validates IOC type/value, computes severity, executes upsert, infers co-occurrence relationships, logs feed run
3. **PostgreSQL / Supabase** — Single source of truth: `iocs`, `ioc_sources`, `ioc_relationships`, `feed_runs`, analyst workspace tables
4. **FastAPI REST API** — IOC search, detail, graph, feed health, workspace, export endpoints; JWT auth middleware
5. **Next.js Frontend** — Dashboard, search, graph visualization, analyst workspace; calls FastAPI only
6. **Supabase Auth** — JWT issuance (frontend login) and JWT verification (FastAPI middleware)

**Key patterns to enforce:**
- Workers are stateless — all dedup via `INSERT ... ON CONFLICT DO UPDATE`, no application-layer dedup check
- Fat normalization layer, thin workers — all schema mapping and scoring in the shared module
- Separate `iocs` (canonical) from `ioc_sources` (per-observation log) — never merge these
- Severity stored as a column (updated on upsert), never computed at query time
- Frontend routes through FastAPI exclusively — no direct Supabase DB queries from browser

### Critical Pitfalls

1. **No canonical IOC normalization contract before writing workers** — Each feed returns scores, types, and formats differently. Without defining the internal canonical struct first, feed-specific logic bleeds into scoring and search. Prevention: define `NormalizedIOC` struct and per-feed adapters before writing any worker code. (Phase 1)

2. **Feed rate limits unhandled until production** — AbuseIPDB free tier has tight per-minute and per-day caps. A naive scheduler burns the daily quota within minutes on first production run. Prevention: implement exponential backoff with jitter, per-feed quota config, and prefer bulk/batch API endpoints from day one. (Phase 1)

3. **Deduplication on IOC value alone (ignoring type)** — Hash `abc123` as MD5 and `abc123` as SHA1 are different IOCs. Dedup on `value` alone causes silent data corruption. Prevention: unique constraint must be `(value, type)` at minimum; hash algorithm stored separately. (Phase 1 schema)

4. **Supabase service role key bypassing RLS on user-scoped data** — Using the service role key for all FastAPI operations means analyst notes, watchlists, and tags are accessible to any authenticated user who knows a record ID (IDOR). Prevention: explicit `WHERE user_id = authenticated_user_id` on every user-scoped query; service role key restricted to ingestion and admin operations only. (Phase 1 schema + Phase 4 auth)

5. **Graph traversal uncapped — browser freeze on high-connectivity IOCs** — A well-known IP with 400 related domains loads everything in one query and freezes the browser. Prevention: hard cap on traversal depth (default 1 hop, analyst-expandable) and node count (150 max), `truncated` flag in API response, progressive loading. Both `ioc_relationships` indexes required from Phase 1. (Graph phase)

---

## Implications for Roadmap

All four research files converge on the same build order. Dependencies are strict: schema stability enables everything downstream, real data is required to develop search queries against, and auth must be in place before user-scoped workspace features ship.

### Phase 1: Data Foundation and Normalization Contracts

**Rationale:** The schema is the project's most expensive change to make later. Every downstream component (workers, API, frontend) depends on stable table definitions. The normalization contract (canonical IOC struct, scoring formula design) must be finalized before any worker is written — otherwise pitfalls 1, 3, and 4 are baked in from the start.

**Delivers:** Stable PostgreSQL schema with all indexes; canonical `NormalizedIOC` Python struct; upsert logic with idempotency; severity scoring formula (implementation can come later, but inputs must be defined now); `user_id` FK columns on all analyst workspace tables.

**Addresses features:** Underpins IOC search, severity scoring, feed health, graph, watchlists, tags, notes, export.

**Avoids:** Pitfall 1 (no normalization contract), Pitfall 3 (value-only dedup), Pitfall 4 (service role RLS bypass — schema must include `user_id` FKs), Pitfall 6 (missing search indexes — `pg_trgm` GIN in initial migration), Pitfall 10 (JSONB overuse — promote filterable fields to columns now).

**Research flag:** Standard patterns — PostgreSQL schema design and indexing are well-documented. Skip `/gsd:research-phase`.

---

### Phase 2: Feed Ingestion Pipeline

**Rationale:** Real data is required to develop and test search queries. Working against fixtures reveals fewer edge cases than real feed data. Rate limit handling and backoff logic must be in the initial worker design, not retrofitted.

**Delivers:** Three operational feed workers (AbuseIPDB, URLhaus, OTX); APScheduler wiring in FastAPI lifespan; per-feed rate limit configuration; exponential backoff with jitter; feed run logging; severity score computation on upsert.

**Addresses features:** Feed health status, severity scoring, IOC data population (prerequisite for all features).

**Avoids:** Pitfall 1 (feed-specific schema bleeding in), Pitfall 2 (rate limits hit on first production run), Pitfall 9 (feed downtime nuance — `last_successful_sync` vs boolean status), Pitfall 15 (non-idempotent inserts).

**Uses from STACK.md:** APScheduler 3.x, httpx, tenacity, asyncio-throttle, Pydantic v2, tldextract, SQLAlchemy 2 async.

**Research flag:** Feed API behavior (rate limits, response formats) needs verification against current docs at implementation time. AbuseIPDB, URLhaus, and OTX docs should be checked before writing adapters. Consider `/gsd:research-phase` for this phase.

---

### Phase 3: FastAPI REST API Layer

**Rationale:** Frontend development can't begin without a working API. Auth middleware is simpler to add to a working API than to build into a skeleton and debug both simultaneously. Pagination must be enforced from the first endpoint implementation (Pitfall 17).

**Delivers:** `/api/iocs/search` (with type/severity/date/feed filters, paginated), `/api/iocs/{id}` (detail), `/api/iocs/{id}/graph` (with depth cap), `/api/feeds/status`, Supabase Auth JWT middleware (validate signature + exp + iss + aud), `get_current_user` FastAPI dependency.

**Addresses features:** IOC search, IOC detail page, feed health status.

**Avoids:** Pitfall 7 (RLS bypass — explicit user scoping in all user-data queries), Pitfall 13 (JWT not validated on FastAPI side — validate all claims), Pitfall 12 (N+1 queries — batch fetch on detail page), Pitfall 17 (unbounded search results — enforce pagination from day one).

**Uses from STACK.md:** FastAPI, SQLAlchemy 2 async, asyncpg, supabase-py (auth verification only), python-jose.

**Research flag:** Standard patterns — FastAPI + SQLAlchemy 2 async + Supabase JWT validation are well-documented. Skip `/gsd:research-phase`.

---

### Phase 4: Frontend Core (Dashboard and Search)

**Rationale:** Dashboard and search are the daily analyst entry points and the primary value demonstration. They should be in analysts' hands before advanced features (graph, workspace) are built.

**Delivers:** Next.js app with Supabase Auth login flow; dashboard (recent IOCs, feed health widget); IOC search page (filter bar, results table, IOC detail view); responsive layout for split-screen analyst use.

**Addresses features:** Recent threats dashboard, IOC search with all filters, IOC detail page, feed health status, multi-user auth.

**Avoids:** Pitfall 3 (frontend calling Supabase directly — all reads via FastAPI), Pitfall 17 (pagination — enforce at API, display in frontend).

**Uses from STACK.md:** Next.js 14/15 App Router, TanStack Query v5, Zustand, shadcn/ui, Tailwind CSS.

**Research flag:** shadcn/ui API changes rapidly with Next.js App Router versions — verify component compatibility at implementation time. Otherwise standard patterns.

---

### Phase 5: Graph Visualization

**Rationale:** The graph is the primary differentiator and is complex enough to deserve its own phase. It depends on relationship data being populated (Phase 2 workers infer co-occurrence relationships), the graph API endpoint (Phase 3), and a stable frontend foundation (Phase 4). Building it last ensures the foundation is solid.

**Delivers:** `/api/iocs/{id}/graph` endpoint with recursive CTE traversal (depth-capped, node-limited, `truncated` flag); Cytoscape.js or React Flow graph component with progressive loading; layout algorithm tested against realistic IOC data (50+ nodes before finalizing).

**Addresses features:** Interactive graph visualization (core differentiator).

**Avoids:** Pitfall 5 (unbounded graph traversal — hard cap at query layer), Pitfall 16 (force-directed layout unusable on hub nodes — test Dagre/hierarchical layouts against real data, provide layout toggle).

**Uses from STACK.md:** React Flow (`@xyflow/react`) or Cytoscape.js (evaluate both; Cytoscape's Dagre layout may handle hub nodes better).

**Research flag:** Graph layout performance on security-domain data is less documented. Consider `/gsd:research-phase` to compare Cytoscape.js Dagre vs React Flow layout options against realistic TIP graph shapes before committing.

---

### Phase 6: Analyst Workspace

**Rationale:** Tags, notes, watchlists, and export complete the analyst workflow. They depend on auth (Phase 3), the search UI (Phase 4), and stable data (Phase 2). Building them last means analyst-scoped data security concerns (Pitfall 7) can be audited against a complete auth system.

**Delivers:** Tags and notes API endpoints + frontend UI; watchlists API + UI; CSV/JSON export (streamed, row-limited); per-analyst attribution on all annotations; export includes analyst annotations.

**Addresses features:** Tags/labeling, analyst notes, watchlists, CSV/JSON export, per-analyst workspace.

**Avoids:** Pitfall 7 (service role IDOR — audit every user-scoped endpoint for explicit `user_id` WHERE clause), Pitfall 14 (CSV export blocking — use `StreamingResponse`), Pitfall 4 (score explanation surfaced in detail view for analyst trust).

**Research flag:** Standard patterns for tags/notes/watchlists. Skip `/gsd:research-phase`. Streaming CSV in FastAPI is well-documented.

---

### Phase 7: Hardening and Observability

**Rationale:** After core features are operational and in analyst hands, harden the operational aspects: rate limit resilience, error observability, feed quota monitoring, and performance validation.

**Delivers:** Circuit breaker per feed (after N consecutive failures, back off); feed run history UI in dashboard; API key masking in logs; quota usage tracking and threshold alerts; `EXPLAIN ANALYZE` audit on all high-traffic endpoints; Supabase tier limit validation.

**Addresses features:** Feed health status (nuanced states), operational resilience.

**Avoids:** Pitfall 2 (quota exhaustion), Pitfall 8 (API keys in logs), Pitfall 9 (feed downtime appearing as platform failure).

**Research flag:** Supabase free tier storage limits (~500MB) must be verified before production. At ~500 bytes/IOC row with source observations, the free tier supports roughly 1M IOCs. Plan Supabase tier upgrade before production load.

---

### Phase Ordering Rationale

- **Schema stability is the critical path.** A schema change after Phase 2 data is loaded requires migrations that cascade through API and frontend. Every index, every `user_id` FK, every `score_version` column belongs in Phase 1.
- **Real data before API development.** Feed workers running against real feeds surface edge cases in normalization and scoring that fixtures miss. This shapes the API response design.
- **Core analyst workflow before differentiators.** Search and dashboard are the daily entry points. The graph is the differentiator but should not block analyst adoption.
- **Auth in the API layer, not the skeleton.** Debugging auth and business logic simultaneously in an empty skeleton is harder than adding auth to a working API.
- **Graph last among UI phases.** It has the most complex failure modes (performance, layout usability) and benefits from a stable data foundation.

### Research Flags

**Needs `/gsd:research-phase` during planning:**
- **Phase 2 (Feed Ingestion):** AbuseIPDB, URLhaus, and OTX API behavior — rate limits, response format, bulk endpoint availability — must be verified against current docs before adapters are written. Training data confidence on these is MEDIUM.
- **Phase 5 (Graph Visualization):** Cytoscape.js Dagre vs React Flow layout performance on security-domain hub graphs is not well-benchmarked. Short spike recommended before implementation.

**Standard patterns (skip research):**
- **Phase 1 (Schema):** PostgreSQL indexing, GIN/trigram, adjacency tables — HIGH confidence, stable documentation.
- **Phase 3 (API):** FastAPI + SQLAlchemy 2 async + Supabase JWT — HIGH confidence, widely documented.
- **Phase 4 (Frontend Core):** Next.js App Router + TanStack Query + shadcn/ui — MEDIUM confidence; shadcn API evolves but patterns are established.
- **Phase 6 (Workspace):** Tags/notes/watchlists + streamed CSV — standard CRUD patterns.
- **Phase 7 (Hardening):** Circuit breakers, observability — established operational patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core decisions (Next.js, FastAPI, Supabase) are locked in. Supporting library choices are well-reasoned but need version pinning at install time — APScheduler v3 vs v4 API change is an active risk |
| Features | MEDIUM | Derived from training knowledge of MISP, OpenCTI, ThreatConnect; no live product verification. Core table stakes are stable; differentiator prioritization is opinion-based |
| Architecture | HIGH (core patterns) / MEDIUM (scale estimates) | PostgreSQL GIN/trigram, adjacency table + recursive CTE, upsert dedup — all HIGH confidence, stable PostgreSQL features. Supabase tier limits and feed rate limits are MEDIUM — must be verified |
| Pitfalls | MEDIUM-HIGH | Security pitfalls (IDOR, JWT validation) and DB indexing pitfalls are HIGH confidence. Feed API behavior specifics (exact rate limits) are MEDIUM — verify against current docs |

**Overall confidence:** MEDIUM

### Gaps to Address

- **APScheduler version:** APScheduler 4.0 had a breaking async API change in development as of mid-2025. Verify whether 3.x or 4.x is current stable before installing. Code examples in ARCHITECTURE.md use 3.x API.
- **AbuseIPDB free tier exact limits:** Training data cites 1,000 req/day / 5 req/min but these may have changed. Verify at https://docs.abuseipdb.com before writing the adapter.
- **OTX DirectConnect API:** Delta query behavior and rate limits must be verified at https://otx.alienvault.com/api. Using full pulse polling is expensive at scale.
- **URLhaus bulk download:** Acceptable polling frequency for the bulk CSV endpoint must be confirmed at https://urlhaus-api.abuse.ch.
- **Supabase free tier storage:** ~500MB documented in training data. At v1 scale this supports roughly 1M IOCs. Verify current pricing and plan the tier upgrade before production at https://supabase.com/pricing.
- **React Flow v12 API:** `@xyflow/react` v11 and v12 have different import paths. Verify current stable version and API before building the graph component.
- **Severity scoring weights (40/35/25):** The formula in ARCHITECTURE.md is a reasonable starting point, not sourced from official standards. Document clearly for analysts; plan to tune based on feedback after launch.

---

## Sources

### Primary (HIGH confidence)
- PostgreSQL documentation (GIN indexes, pg_trgm, recursive CTEs, INSERT ON CONFLICT) — core indexing and query patterns
- FastAPI documentation — async patterns, dependency injection, lifespan events
- SQLAlchemy 2.x async documentation — ORM and async session patterns
- Pydantic v2 documentation — model validation, field types

### Secondary (MEDIUM confidence)
- APScheduler documentation — AsyncIOScheduler FastAPI integration patterns
- Supabase documentation — Auth JWT patterns, RLS concepts, Python client
- MISP project documentation — IOC data model reference, tagging concepts
- OpenCTI documentation — Connector pattern reference, STIX-native model (as counterpoint)
- Community patterns for httpx + tenacity — async retry and backoff
- AbuseIPDB / URLhaus / OTX API documentation (training data snapshot) — rate limits and response formats

### Tertiary (LOW confidence — verify before use)
- Supabase free tier storage limits (500MB) — verify at supabase.com/pricing
- AbuseIPDB free tier daily/minute request caps — verify at docs.abuseipdb.com
- OTX DirectConnect rate limits — verify at otx.alienvault.com/api
- APScheduler 4.0 async API stability — verify at apscheduler.readthedocs.io
- Severity scoring formula weights — design recommendation, not sourced from standards

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*
