# Roadmap: ThreatLens

## Overview

ThreatLens is built in dependency order: the canonical data schema and normalization contracts come first (everything downstream depends on them), then the feed workers that populate real data, then the API layer that exposes it, then the frontend that makes it usable. The graph visualization and analyst workspace ship last because they depend on a stable data foundation and working auth. Six phases take the project from an empty database to a complete analyst platform.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Foundation** - Define canonical schema, normalization contracts, and scoring formula before any code is written
- [ ] **Phase 2: Feed Ingestion Pipeline** - Three operational feed workers with rate limiting, backoff, and feed health logging
- [ ] **Phase 3: API Layer** - FastAPI REST endpoints for search, detail, and graph with JWT auth middleware
- [ ] **Phase 4: Frontend Core** - Next.js app with Supabase Auth, dashboard, IOC search, and detail pages
- [ ] **Phase 5: Graph Visualization** - Interactive IOC relationship graph with depth-capped traversal
- [ ] **Phase 6: Analyst Workspace** - Tags, notes, watchlists, export, and production hardening

## Phase Details

### Phase 1: Data Foundation
**Goal**: The PostgreSQL schema is stable, all normalization contracts are defined, and no downstream component ever needs a schema migration to add a critical column
**Depends on**: Nothing (first phase)
**Requirements**: IOC-01, IOC-02, IOC-03, IOC-04, IOC-05
**Success Criteria** (what must be TRUE):
  1. Database has `iocs`, `ioc_sources`, `ioc_relationships`, `feed_runs`, and analyst workspace tables — all with correct indexes and `user_id` FK columns on user-scoped tables
  2. A `NormalizedIOC` Python struct exists that every feed adapter will produce; fields cover all three feed types (AbuseIPDB, URLhaus, OTX) with no feed-specific columns in the canonical table
  3. Upsert logic enforces a `(value, type)` unique constraint — ingesting the same IOC twice from the same feed leaves exactly one canonical row
  4. Severity score columns and formula inputs (feed confidence weight, source count weight, recency weight) are defined in schema; score can be computed and stored on upsert
  5. `ioc_relationships` adjacency table is present with indexes on both FKs; co-occurrence inference logic is defined before any worker runs
**Plans**: TBD

Plans:
- [ ] 01-01: PostgreSQL schema migrations (all tables, indexes, constraints, user_id FKs)
- [ ] 01-02: NormalizedIOC struct, per-feed adapter interfaces, upsert logic, severity scoring formula

### Phase 2: Feed Ingestion Pipeline
**Goal**: Real IOC data flows continuously from all three feeds into the database — rate limits respected, failures logged, data deduplicated
**Depends on**: Phase 1
**Requirements**: FEED-01, FEED-02, FEED-03, FEED-04, FEED-06
**Success Criteria** (what must be TRUE):
  1. AbuseIPDB, URLhaus, and AlienVault OTX each have a working feed adapter that maps raw API responses to `NormalizedIOC` and upserts to the database
  2. All three feeds run on a configurable schedule via APScheduler wired into FastAPI lifespan — no manual intervention needed for continuous polling
  3. Each feed enforces its per-feed rate limit; a misconfigured run does not exhaust the free-tier daily quota
  4. Feed adapter failures (network error, API rate limit, malformed response) trigger exponential backoff with jitter and do not crash the scheduler
  5. Each feed run writes a `feed_runs` row with timestamp, success/failure, IOC count ingested, and error message on failure — queryable for health status
**Plans**: TBD

Plans:
- [ ] 02-01: APScheduler wiring, base feed worker class, httpx + tenacity HTTP client, rate limit config
- [ ] 02-02: AbuseIPDB adapter (simplest model — start here)
- [ ] 02-03: URLhaus adapter
- [ ] 02-04: AlienVault OTX adapter (most complex — delta queries, multi-type IOCs)

### Phase 3: API Layer
**Goal**: All IOC data is accessible via authenticated REST endpoints with pagination enforced from day one
**Depends on**: Phase 2
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06, DTIL-01, DTIL-02, DTIL-03
**Success Criteria** (what must be TRUE):
  1. `GET /api/iocs/search` accepts `q` (trigram/full-text), `type`, `severity`, `feed`, `date_from`, `date_to` — all filters work independently and in combination; results are always paginated
  2. `GET /api/iocs/{id}` returns severity score with formula breakdown (confidence %, source count, recency factor), all feed observations, first/last seen dates, and raw feed metadata
  3. `GET /api/iocs/{id}` includes the requesting analyst's own tags and notes for that IOC (user-scoped, requires valid JWT)
  4. `GET /api/iocs/{id}/graph` returns nodes and edges capped at 3 hops and 100 nodes from the seed IOC, with a `truncated` boolean flag when the cap is hit
  5. Every endpoint that returns user-scoped data includes an explicit `WHERE user_id = :current_user` — no service role key bypass possible
**Plans**: TBD

Plans:
- [ ] 03-01: Supabase Auth JWT middleware, `get_current_user` FastAPI dependency, admin role guard
- [ ] 03-02: IOC search endpoint with all filters and pagination (pg_trgm query, SQLAlchemy async)
- [ ] 03-03: IOC detail endpoint, graph traversal endpoint (recursive CTE, depth + node cap)

### Phase 4: Frontend Core
**Goal**: Analysts can log in, view the dashboard, and search/inspect IOCs through the web UI
**Depends on**: Phase 3
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, DASH-01, DASH-02, DASH-03, FEED-05
**Success Criteria** (what must be TRUE):
  1. User can sign up with email/password, log in, stay logged in across browser refreshes, reset a forgotten password via email link, and log out from any page
  2. Admin user sees a "Trigger Sync" button on the dashboard and can manually initiate a feed sync from the UI; non-admin users do not see this control
  3. Dashboard shows recently ingested high-severity IOCs from the last 24-48 hours, feed health status for all three feeds (last run time, success/failure, IOC count), and IOC counts by type and severity
  4. Search page returns IOC results filtered by type, severity, feed source, and date range; results are paginated; clicking a result opens the IOC detail view
  5. Each analyst's tags, notes, and watchlist entries are visible only to that analyst — logging in as a different user shows a clean workspace
**Plans**: TBD

Plans:
- [ ] 04-01: Next.js app scaffolding, Supabase Auth login/signup/reset flow, route protection
- [ ] 04-02: Dashboard page (feed health widget, recent IOCs, severity breakdown charts via Recharts)
- [ ] 04-03: IOC search page (filter bar, results table, pagination, IOC detail view)

### Phase 5: Graph Visualization
**Goal**: Analysts can explore IOC relationships interactively without the graph freezing on high-connectivity nodes
**Depends on**: Phase 4
**Requirements**: GRPH-01, GRPH-02, GRPH-03
**Success Criteria** (what must be TRUE):
  1. Any IOC detail page has an entry point ("View Relationships") that opens an interactive graph where nodes are IOCs and edges are inferred co-occurrence relationships
  2. The graph loads with a default depth of 1 hop and renders without freezing for IOCs with up to 100 related nodes; analyst can expand depth up to 3 hops
  3. When the 100-node cap or 3-hop cap is hit, a visible "Results truncated" indicator appears in the graph UI
  4. Clicking any node in the graph navigates to that IOC's detail page
**Plans**: TBD

Plans:
- [ ] 05-01: Graph API endpoint hardening (recursive CTE, depth cap, node cap, truncated flag)
- [ ] 05-02: React Flow (or Cytoscape.js) graph component, layout algorithm evaluation, progressive loading

### Phase 6: Analyst Workspace
**Goal**: Analysts can annotate IOCs, maintain watchlists, export data, and the platform is hardened for production operation
**Depends on**: Phase 5
**Requirements**: WKSP-01, WKSP-02, WKSP-03, WKSP-04, WKSP-05
**Success Criteria** (what must be TRUE):
  1. Analyst can add free-form tags and notes to any IOC from the detail page; tags and notes are attributed to the analyst's account and not visible to other analysts
  2. Analyst can add any IOC to a personal watchlist and remove it; watchlisted IOCs are visually highlighted when they appear in new feed ingestion runs (indicator on dashboard or search results)
  3. Analyst can export their current search results or watchlist as CSV or as JSON; the export includes all IOC fields plus the analyst's own tags and notes for those IOCs
  4. All workspace API endpoints reject requests where the `user_id` in the request does not match the authenticated user — no IDOR path exists
**Plans**: TBD

Plans:
- [ ] 06-01: Tags and notes API endpoints + frontend UI (IOC detail page integration)
- [ ] 06-02: Watchlist API endpoints + frontend UI (add/remove, highlight on ingestion)
- [ ] 06-03: CSV/JSON export endpoints (StreamingResponse), feed run history view, IDOR audit of all workspace endpoints

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 0/2 | Not started | - |
| 2. Feed Ingestion Pipeline | 0/4 | Not started | - |
| 3. API Layer | 0/3 | Not started | - |
| 4. Frontend Core | 0/3 | Not started | - |
| 5. Graph Visualization | 0/2 | Not started | - |
| 6. Analyst Workspace | 0/3 | Not started | - |
