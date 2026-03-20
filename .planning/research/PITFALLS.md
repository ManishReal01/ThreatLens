# Domain Pitfalls: Threat Intelligence Platform (TIP)

**Domain:** Web-based OSINT Threat Intelligence Platform
**Project:** ThreatLens (Next.js + FastAPI + PostgreSQL/Supabase)
**Researched:** 2026-03-20
**Overall confidence:** MEDIUM-HIGH (training data, well-established domain; external verification unavailable)

---

## Critical Pitfalls

Mistakes that cause rewrites, cascading failures, or security incidents.

---

### Pitfall 1: Treating Feed Data as Trusted Without Normalization Contracts

**What goes wrong:** Each feed returns data in its own format, with its own notion of severity, confidence, and IOC structure. Teams ingest raw JSON directly into the database using JSONB blobs because "we can normalize later." Later never comes. Queries become feed-specific. Adding a fourth feed requires rewriting queries. Severity scoring compares apples to fractions of oranges.

**Why it happens:** Ingestion feels like a data-plumbing problem at first. The real work (normalization contracts) is invisible until you have three feeds behaving differently:
- AbuseIPDB returns `abuseConfidenceScore` (0-100), no severity label
- URLhaus returns `threat` (string category), `url_status` (online/offline), no numeric score
- OTX returns `pulse` objects with `adversary`, `tags`, `tlp` — no single confidence score

**Consequences:** Schema drift across feeds. Severity scoring collapses into "AbuseIPDB score ÷ 100" because the URLhaus and OTX paths never got implemented. Graph relationships between feed-specific fields are impossible to join. Removing or replacing a feed requires hunting down feed-specific logic across the codebase.

**Prevention:**
1. Define an internal canonical IOC struct before writing any ingestion code. At minimum: `value`, `type` (ip/domain/hash/url), `source_feed`, `first_seen`, `last_seen`, `raw_confidence` (0.0-1.0 normalized), `raw_severity_label`, `raw_payload` (JSONB for feed-specific extras).
2. Write a feed adapter per source. The adapter's only job: translate feed API response → canonical struct. Nothing else touches feed response format.
3. All downstream code (scoring, search, graph) consumes only canonical struct fields.

**Detection (warning signs):**
- Query code contains `WHERE source = 'urlhaus' AND json_field = ...` style conditionals
- Severity scoring function has `if feed == 'abuseipdb'` branches
- Adding a new feed requires changes to more than one file outside the adapter

**Phase:** Ingestion pipeline (Phase 1). Get the canonical struct right before writing a single adapter. This is the most expensive mistake to fix later.

---

### Pitfall 2: Ignoring Feed Rate Limits Until Production Hits Them

**What goes wrong:** Development uses small test datasets. Ingestion workers are written with no rate limit awareness. On first production-scale run, the scheduler fires, all three feed workers run concurrently, and within minutes the platform gets HTTP 429s or API key blocks from AbuseIPDB (the most aggressive rate limiter of the three).

**Why it happens:** Rate limits aren't tested in development because you're hitting endpoints infrequently. The scheduler feels simple: run every hour. Nobody thinks about what happens when the worker retries on error, doubling requests.

**Consequences:**
- AbuseIPDB free tier is very constrained (1,000 requests/day on free tier, 5 requests/min — these limits should be verified against current docs at implementation time). One aggressive ingestion job burns the daily quota in minutes.
- API key gets soft-banned or rate-limited for hours.
- Feed health dashboard shows all feeds as "down" when they're actually just rate-limited — analysts lose confidence in the platform.

**Known feed constraints (verify at implementation time against official docs):**
- AbuseIPDB: Free tier has per-minute and per-day request caps. Bulk blacklist endpoint is separate from single IP check endpoint and has different limits.
- URLhaus: No API key required for most endpoints; data dumps available; direct URL queries are generous but bulk polling is discouraged.
- AlienVault OTX: Requires free API key; DirectConnect subscription (free) gives pulse delta queries; polling full pulse list is expensive.

**Prevention:**
1. Implement exponential backoff with jitter from day one. Never retry immediately on 429.
2. Use per-feed rate limit configuration (not hardcoded). Store as config values so they can be tuned without code changes.
3. Prefer bulk/batch endpoints over per-IOC queries wherever the feed offers them (OTX DirectConnect delta, URLhaus bulk CSV download, AbuseIPDB blacklist CSV for bulk checks).
4. Track API usage counters in the database. Alert when approaching daily quota thresholds.
5. Decouple feed ingestion from IOC enrichment. Don't call single-IOC enrichment endpoints in the ingestion loop; use bulk endpoints or defer enrichment.

**Detection (warning signs):**
- Worker code has `time.sleep(1)` (fixed sleep) rather than backoff logic
- No per-feed rate limit configuration exists in settings
- Ingestion job and enrichment job share the same API key without quota awareness

**Phase:** Ingestion pipeline (Phase 1). Rate limit handling must be in the initial worker design, not retrofitted.

---

### Pitfall 3: IOC Deduplication by Value Alone (Without Type)

**What goes wrong:** Dedup logic uses `ON CONFLICT (value) DO UPDATE ...`. This works until you realize `1.2.3.4` as an IP and `1.2.3.4` as a string in a hash field are different IOCs. Worse: the hash `abc123` means something completely different depending on whether it's an MD5, SHA1, or SHA256 — but all are 40-character hex strings (SHA1 and MD5 overlap is common). Dedup collisions corrupt IOC records silently.

**Why it happens:** "Just use the IOC value as the unique key" seems obvious. The type distinction feels like an edge case until you hit it.

**Consequences:** Silent data corruption. An IP IOC record gets overwritten by a hash IOC with the same string value (unlikely but possible with short hashes). More commonly: MD5 and SHA1 hashes that happen to share a value get merged. Severity scores from two different IOC types pollute each other. Search returns wrong type for a given value.

**Prevention:**
1. Unique constraint must be `(value, type)` at minimum. Consider `(value, type, source_feed)` if you want per-feed records with merge on query rather than on insert.
2. Normalize IOC values before dedup: lowercase domains, strip schema from URLs (or keep canonical form), validate IP format.
3. For hashes: store hash algorithm as a separate column (`hash_algo`: md5/sha1/sha256/sha512). Unique constraint becomes `(value, type, hash_algo)`.
4. Write a canonicalization function per IOC type called before any insert.

**Detection (warning signs):**
- `UNIQUE` constraint exists only on `value` column
- No `ioc_type` column or it's nullable
- Hash algorithm is not stored separately

**Phase:** Database schema design (Phase 1, before any data is written). Changing the unique constraint after data is in production requires careful migration.

---

### Pitfall 4: Severity Score Drift and Cross-Feed Score Incompatibility

**What goes wrong:** Composite severity scoring is implemented by averaging raw feed scores without normalization. AbuseIPDB returns 0-100. OTX has no numeric score — it has TLP labels and tag counts. URLhaus has categorical threat types. The averaging formula silently produces garbage for IOCs only seen in OTX or URLhaus because those fields are 0 or null, dragging every score down. Over time, as feeds update their scoring methodology, scores drift without detection.

**Why it happens:** Scoring feels like a formula problem (just average the numbers), not a data normalization problem. The multi-source corroboration bonus (seen in 3 feeds = higher score) is easy to implement — the normalization is harder and gets skipped.

**Consequences:**
- An IOC in URLhaus with a confirmed malicious URL gets a low severity score because URLhaus has no numeric confidence, so it contributes 0 to the average.
- Analysts stop trusting severity scores within weeks of launch.
- Score recalibration requires a full table scan and update — painful at 500K+ IOC rows.

**Prevention:**
1. Define normalized confidence (0.0-1.0) as the internal unit. Every feed adapter must emit a normalized confidence, not raw score. The adapter owns the translation logic (e.g., URLhaus `online` malicious URL = 0.9, `offline` = 0.5, `unknown` = 0.3).
2. Document the normalization rationale per feed in code comments. When the feed changes its format, the adapter change is isolated.
3. Scoring formula inputs: `normalized_confidence` per source + `source_count_bonus` + `recency_weight` (age decay). Never average raw feed-specific fields.
4. Store `score_version` on each IOC record. When scoring logic changes, you can backfill only records with old score versions rather than scanning everything.
5. Add a `score_explanation` JSONB column from the start. Analysts need to see why an IOC scored 8.7/10, not just that it did.

**Detection (warning signs):**
- Scoring function reads raw API fields directly (e.g., `abuseConfidenceScore`) instead of normalized fields
- IOCs from URLhaus-only or OTX-only sources cluster at the bottom of severity rankings regardless of actual threat level
- No `score_version` column on the IOC table

**Phase:** Scoring engine (Phase 2). Design scoring formula and normalization contract in Phase 1 alongside the canonical IOC struct — even if the scoring formula itself ships in Phase 2.

---

### Pitfall 5: Graph Visualization Performance Collapse at Scale

**What goes wrong:** The IOC relationship graph is built client-side using D3.js or Cytoscape.js with a "load all related nodes" query. In early development this renders beautifully with 50 nodes. In production, a single high-profile IP has 400 related domains, 200 related URLs, and 50 hash associations — all loaded in one query. The browser freezes. The user gives up and never uses the graph feature.

**Why it happens:** Graph queries feel like a JOIN problem. "Get all IOCs related to this one" is two JOINs. Nobody thinks about the result cardinality until it's already in production.

**Consequences:**
- Graph feature becomes a liability, not a differentiator.
- Frontend freezes on any well-connected IOC (the exactly IOCs analysts most want to explore).
- Fixing this requires both backend pagination changes and frontend progressive loading refactor.

**Prevention:**
1. Cap graph traversal depth at query time (default: 1 hop). Let analysts explicitly expand. Never load the full transitive closure.
2. Default maximum nodes per query: 150 (configurable). Return a `truncated: true` flag when result is capped so the UI can communicate this.
3. Use Cytoscape.js over D3.js for graph rendering. Cytoscape handles large graphs with built-in performance optimizations and has purpose-built layout algorithms (Cola, Dagre, Spread). D3 graph layouts require implementing force simulation from scratch, and tuning it is a significant time sink.
4. Implement progressive loading: root node loads immediately, neighbors load on expand click.
5. Index `ioc_relationships` table on both `(source_ioc_id)` and `(target_ioc_id)`. Without these, graph traversal queries full-scan the relationship table.
6. Consider a `relationship_summary` denormalized view (count of relationships per IOC type) for the initial node rendering, so the graph loads with size-hinted nodes before full edge data arrives.

**Detection (warning signs):**
- Graph query has no `LIMIT` clause
- Frontend loads all graph data before rendering first node
- No depth parameter in the graph API endpoint signature

**Phase:** Graph visualization (Phase 3 or whenever graph ships). Schema decisions (relationship table indexing) must be in Phase 1.

---

### Pitfall 6: PostgreSQL Full-Text Search on IOC Values Without Proper Indexing

**What goes wrong:** IOC search is implemented as `WHERE value LIKE '%searchterm%'` or `WHERE value ILIKE '%domain.com%'`. This causes sequential scans on the IOC table at any meaningful scale (100K+ rows). Search feels fast in development. In production with 500K IOCs, every search takes 3-8 seconds.

**Why it happens:** LIKE queries work and feel natural. Indexes for text search are a separate concern that gets added "later."

**Consequences:**
- Search latency degrades linearly with IOC table growth.
- The core user-facing feature (IOC search) becomes unusable.
- PostgreSQL full-text search retrofitting is non-trivial (requires schema migration, index rebuild, query rewrite).

**Prevention:**
1. For exact-match IOC lookup (IP, hash, exact domain): standard B-tree index on `value`. This handles the majority of analyst queries ("is 1.2.3.4 in the platform?").
2. For prefix/suffix search on domains and URLs: add a `pg_trgm` trigram GIN index from the start. `CREATE INDEX ioc_value_trgm ON iocs USING gin(value gin_trgm_ops)`. Supports LIKE and ILIKE with leading wildcards efficiently.
3. Partition IOC table by `ioc_type` if you expect >1M rows. Partition pruning makes type-filtered searches dramatically faster.
4. Do not use PostgreSQL FTS (`tsvector`) for IOC values — IOCs are not natural language. Trigram is correct for substring/fuzzy matching on structured values.
5. Add composite indexes for the most common filter combinations: `(ioc_type, severity_score DESC)`, `(source_feed, last_seen DESC)`, `(ioc_type, last_seen DESC)`.

**Detection (warning signs):**
- `EXPLAIN ANALYZE` on a search query shows `Seq Scan` on iocs table
- No trigram extension enabled (`pg_trgm`)
- LIKE queries with leading `%` wildcards in search handler

**Phase:** Database schema (Phase 1). Add `pg_trgm` index in the initial migration. Retrofitting indexes on a large table requires exclusive lock and can take hours.

---

### Pitfall 7: Supabase Row-Level Security Bypassed by Service Role Key

**What goes wrong:** FastAPI backend uses the Supabase service role key for all database operations because "the backend is trusted." Row-Level Security (RLS) policies are written for the anon/user role in Supabase, but since the service role bypasses RLS, they never actually enforce anything. Analyst A can read Analyst B's private notes because the backend query doesn't scope to the authenticated user — it just fetches by `note_id` and returns whatever is found.

**Why it happens:** Using the service role key is the path of least resistance in FastAPI + Supabase setups. The Supabase docs show this pattern for server-side code. It works for global data but silently breaks user-scoped data security.

**Consequences:**
- Analyst notes, watchlists, and per-user workspace data are accessible to any authenticated user who knows or guesses a record ID.
- IDOR (Insecure Direct Object Reference) vulnerability in the API.
- Fixing requires auditing every query that touches user-scoped data and adding explicit `WHERE user_id = current_user_id` clauses.

**Prevention:**
1. Use the service role key only for operations that genuinely require bypassing RLS: scheduled ingestion workers, feed health checks, admin operations.
2. For all API endpoints that serve user-scoped data (notes, watchlists, tags, exports): enforce ownership in the query explicitly (`WHERE user_id = authenticated_user_id`) regardless of RLS. Don't rely on RLS as the only gate.
3. Write RLS policies anyway (as defense in depth), but don't trust them as the sole enforcement mechanism when using the service role.
4. Audit checklist: every endpoint that returns analyst-workspace data must have explicit user scoping in the WHERE clause. Add this to PR review criteria.
5. Use parameterized queries everywhere. Never interpolate user-supplied values into SQL strings.

**Detection (warning signs):**
- All Supabase client calls use the service role key
- Analyst notes table has no `user_id` foreign key
- No ownership check in note/watchlist fetch endpoints (just `WHERE id = $note_id`)

**Phase:** Auth and user workspace (Phase 4). But schema must include `user_id` foreign keys on all user-scoped tables from Phase 1. Retrofitting ownership scoping after the fact is an audit nightmare.

---

### Pitfall 8: API Keys for Feed Sources Stored in Environment Without Rotation Plan

**What goes wrong:** OTX API key and AbuseIPDB API key are stored in `.env` files, committed to the repo (or nearly committed), and never rotated. The keys are also logged in error messages when ingestion fails ("Request to AbuseIPDB failed with key abc123xyz..."). One leaked key means the platform loses its feed access.

**Why it happens:** API key management feels like an ops concern, not a dev concern. In early development it's one key, one env var, works fine.

**Consequences:**
- API keys in version control are scraped by automated tools within hours of a public repo push.
- Key rotation requires downtime if the system has no reload mechanism.
- Error logs containing API keys create a secondary leak vector.

**Prevention:**
1. Use Supabase Vault or environment secrets management (not raw env vars in app code) for production keys from the start. At minimum, ensure `.env` is in `.gitignore` and the repo is private.
2. Never log API key values. Log key prefixes or masked versions only (e.g., `AIPDB_****xyz`).
3. Design the ingestion worker to read API keys from config at runtime (not at startup), so rotation is a config update, not a redeploy.
4. Store which key was used for each ingestion run in the feed health log. This makes key rotation auditable.
5. Implement a feed connectivity test endpoint that validates key validity without consuming quota (most feeds have a lightweight check endpoint).

**Detection (warning signs):**
- API keys appear in application logs (even at DEBUG level)
- `.env` file exists in the project root without `.gitignore` entry
- No key rotation documented or possible without redeploy

**Phase:** Ingestion pipeline (Phase 1). Add secret hygiene before writing the first API call.

---

## Moderate Pitfalls

Mistakes that cause significant rework but not full rewrites.

---

### Pitfall 9: Feed Downtime Breaks Dashboard as "All Red"

**What goes wrong:** When a feed API is unreachable, the ingestion worker marks the feed as failed and the dashboard shows "Feed: OFFLINE" in red. If all three feeds happen to have scheduled maintenance simultaneously (common on weekends), the entire dashboard looks broken. Analysts assume the platform itself is broken, not the upstream feeds.

**Prevention:**
1. Distinguish between "feed unreachable" and "stale data." A feed that was healthy 2 hours ago and is now unreachable should show "Last synced 2h ago — feed temporarily unreachable," not just "OFFLINE."
2. Store `last_successful_sync`, `last_attempted_sync`, `consecutive_failure_count`, and `feed_status` separately. The UI can render nuanced states.
3. Implement circuit breaker per feed: after 3 consecutive failures, back off for 30 minutes before retrying. This prevents hammering a temporarily down feed and burning retry quota.
4. Feed failures should not prevent the rest of the platform from functioning. Ingestion failures are isolated; search and dashboard still work from cached data.

**Detection (warning signs):**
- Feed status is a boolean (online/offline) with no timestamp
- Ingestion failure throws an exception that propagates to the dashboard render

**Phase:** Ingestion pipeline (Phase 1) for the data model; dashboard rendering (Phase 2) for the UI state.

---

### Pitfall 10: JSONB Overuse for Fields That Should Be Normalized Columns

**What goes wrong:** The temptation is to dump entire feed API responses into a `raw_data JSONB` column and "query it later." This works for archival purposes but becomes painful when analysts want to filter by feed-specific fields that never got normalized (e.g., "show me only URLhaus IOCs where `url_status = online`"). Every such filter requires a JSONB path expression (`raw_data->>'url_status' = 'online'`), which is slow without a specific JSONB index and verbose in queries.

**Prevention:**
1. Keep `raw_payload JSONB` for archival and feed-specific extras that you genuinely don't need to query.
2. Any field you expect to filter, sort, or join on must be a real column. Promote it during adapter normalization.
3. Common fields to promote: `threat_category`, `url_status`, `malware_family`, `country_code`, `asn`. These appear frequently in analyst filters.
4. You can always add a JSONB GIN index for `raw_payload` queries, but it's better to have real columns.

**Detection (warning signs):**
- Search filters use `raw_data->>'field'` expressions in WHERE clauses
- Dashboard aggregations query JSONB fields

**Phase:** Database schema (Phase 1). Promoting fields from JSONB to columns after data is ingested requires a migration and potential data loss of inconsistent JSONB structures.

---

### Pitfall 11: IOC Age Decay Not Implemented (Stale IOCs Treated as Current Threats)

**What goes wrong:** An IP flagged as malicious in 2023 appears in search results in 2025 with the same high severity score as a freshly reported IOC. Analysts act on stale intelligence. IOCs are never retired or decayed. The IOC table grows unboundedly.

**Prevention:**
1. Implement age-based decay in the severity score formula from the start. A score component `recency_weight = exp(-lambda * age_in_days)` naturally reduces score for old IOCs. Lambda controls decay rate.
2. Add `is_active` boolean + `retired_at` timestamp. Scheduled job marks IOCs as inactive if not seen in feeds for N days (configurable per feed — OTX pulses may stay relevant longer than URLhaus live URLs).
3. Search defaults to active IOCs. Analysts can opt into historical search explicitly.
4. Never delete IOC records. Soft-retire them. Historical data has forensic value.

**Detection (warning signs):**
- No `last_seen` column or it's always equal to `first_seen`
- No age component in scoring formula
- IOC table has no archival/retirement mechanism

**Phase:** Scoring engine (Phase 2), but `last_seen` must be in schema from Phase 1.

---

### Pitfall 12: N+1 Queries in IOC Enrichment and Graph Queries

**What goes wrong:** The IOC detail page loads an IOC, then fetches its tags (one query), then fetches its notes (one query), then fetches related IOCs one by one in a loop. A single detail page view generates 20+ database round trips. This is invisible in development but causes noticeable latency in production.

**Prevention:**
1. Use FastAPI with async SQLAlchemy and batch-fetch related entities in a single query using JOINs or `IN` clauses.
2. For the IOC detail page: one query fetches IOC + tags + notes via JOIN or CTE. Related IOCs fetched in a single batch query (not a loop).
3. Add a query count assertion in integration tests during development to catch N+1 regressions.
4. Use `EXPLAIN ANALYZE` on every endpoint during development, not just when performance degrades.

**Detection (warning signs):**
- IOC detail API handler has a loop that queries related entities
- Database query logs show repetitive identical queries with different ID parameters

**Phase:** Backend API (Phase 2). Establish the pattern early; N+1 bugs compound.

---

### Pitfall 13: Supabase Auth JWT Not Validated on FastAPI Side

**What goes wrong:** Supabase Auth issues JWTs to authenticated users. The Next.js frontend passes this JWT to FastAPI. FastAPI either doesn't validate the JWT at all (trusting a user-passed header), or validates the signature but doesn't check `exp` (expiry), `aud` (audience), or `iss` (issuer). Any forged or expired JWT is accepted as valid.

**Prevention:**
1. Use `python-jose` or `PyJWT` to validate Supabase JWTs on every FastAPI request. Validate: signature (using Supabase JWT secret), `exp`, `iss` (must be your Supabase project URL), `aud` (`authenticated`).
2. Extract `sub` (user UUID) from validated JWT for all user-scoped operations. Never trust user-supplied user IDs from request body.
3. Create a FastAPI dependency (`get_current_user`) used in every protected route. Consistency enforced by architecture.
4. Add a test that sends an expired JWT and verifies 401. Add a test with a tampered JWT (modified payload, original signature) and verify 401.

**Detection (warning signs):**
- FastAPI routes accept `user_id` from request body or query params
- No JWT validation library in FastAPI dependencies
- Auth middleware is optional/commented out in routes

**Phase:** Auth (Phase 4), but the `get_current_user` dependency pattern must be established before any protected endpoints are written.

---

## Minor Pitfalls

Technical debts that are annoying but recoverable.

---

### Pitfall 14: CSV Export Blocking the Request Thread

**What goes wrong:** CSV export for a large IOC search result (10K rows) runs synchronously in the API handler. The request blocks for 30+ seconds. Other requests queue behind it.

**Prevention:** Stream large exports using `StreamingResponse` in FastAPI, or offload to a background task with a download-when-ready pattern. Set a max export row limit (e.g., 10K) and communicate this in the UI.

**Detection:** Export handler fetches all results into memory before writing CSV.

**Phase:** Analyst workspace (Phase 3).

---

### Pitfall 15: No Feed Ingestion Idempotency

**What goes wrong:** Ingestion job runs twice (scheduler fires twice due to clock drift, or worker crashes mid-run and restarts). IOC records get duplicated or scores get double-counted.

**Prevention:** Use `INSERT ... ON CONFLICT (value, type) DO UPDATE` with explicit field updates. Never plain `INSERT`. The ingestion job must be idempotent: running it twice produces the same result as running it once.

**Detection:** Running the ingestion worker twice creates duplicate rows or double-increments `source_count`.

**Phase:** Ingestion pipeline (Phase 1).

---

### Pitfall 16: Graph Layout Algorithm Chosen Without Analyst UX Testing

**What goes wrong:** Force-directed layout is the default in Cytoscape.js and looks impressive in demos. For threat intelligence graphs with many hub nodes (one IP connected to hundreds of domains), force-directed layouts produce hairball graphs that analysts can't read. The feature ships and nobody uses it.

**Prevention:** Test layout algorithms against realistic data early. For TIP graphs, hierarchical (Dagre) or concentric layouts often work better for showing IOC relationships from a root node. Offer analysts a layout toggle. Implement "pin node" functionality so analysts can manually arrange important nodes.

**Detection:** Graph feature gets positive demo feedback but low production usage.

**Phase:** Graph visualization (Phase 3). Don't finalize layout algorithm without testing against real IOC data (at least 50-node graphs).

---

### Pitfall 17: Missing Pagination on Search Results

**What goes wrong:** IOC search returns all matching results. A search for `*.ru` domains returns 15,000 rows. The API response is 40MB. The frontend renders 15,000 table rows and crashes the browser tab.

**Prevention:** Enforce server-side pagination (cursor-based or offset) from the first search endpoint implementation. Default page size: 50. Max page size: 500. Never allow unbounded result sets from the search API.

**Detection:** Search API response has no `page`, `limit`, or `cursor` fields.

**Phase:** IOC search (Phase 2).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Feed ingestion design | No canonical IOC struct — feed-specific schemas diverge | Define canonical struct first; write adapters second |
| Feed ingestion design | Rate limits hit on first production run | Implement backoff + per-feed quota config before first API call |
| Feed ingestion design | Non-idempotent inserts cause duplicates | Use `ON CONFLICT DO UPDATE` from day one |
| Database schema | Dedup by value alone collapses IP and hash collisions | Unique constraint on `(value, type)` minimum |
| Database schema | No trigram index — search is sequential scan | Add `pg_trgm` extension and GIN index in initial migration |
| Database schema | User-scoped tables missing `user_id` FK | Add ownership columns before writing any data |
| Scoring engine | Raw feed scores averaged without normalization | Normalize to 0.0-1.0 in feed adapters, not in scoring formula |
| Scoring engine | No score versioning — recalibration requires full table scan | Add `score_version` column from the start |
| IOC search | Unbounded results — large responses crash frontend | Enforce pagination from first endpoint implementation |
| Graph visualization | Unbounded graph traversal — browser freezes | Hard cap on traversal depth and node count in query layer |
| Graph visualization | Force-directed layout unusable on hub nodes | Test Dagre/hierarchical early; provide layout toggle |
| Analyst workspace | CSV export blocks request thread | Use `StreamingResponse` or background task |
| Auth | Service role key bypasses RLS on user-scoped data | Explicit `WHERE user_id = ...` on all user-scoped queries |
| Auth | JWT not validated on FastAPI side | Validate signature + exp + iss + aud on every request |
| Security | API keys in logs or version control | Never log key values; confirm `.env` in `.gitignore` |

---

## Sources and Confidence

All findings are based on domain knowledge of:
- OSINT feed API behavior (AbuseIPDB, URLhaus, OTX) — MEDIUM confidence (verify rate limits against current official docs at implementation time; they change)
- PostgreSQL indexing strategy for text search and time-series data — HIGH confidence (well-documented, stable)
- Supabase Auth + RLS patterns — HIGH confidence (well-documented, common pattern)
- FastAPI JWT validation — HIGH confidence (well-documented)
- Graph visualization performance — HIGH confidence (well-established frontend engineering knowledge)
- Severity scoring normalization — HIGH confidence (threat intelligence domain standard practice)

**Gaps to verify at implementation time:**
- AbuseIPDB free tier exact daily/minute request limits (verify at https://docs.abuseipdb.com)
- OTX DirectConnect rate limits and delta query API behavior (verify at https://otx.alienvault.com/api)
- URLhaus bulk download frequency and acceptable polling interval (verify at https://urlhaus-api.abuse.ch)
- Supabase Vault availability on free tier vs paid tier
