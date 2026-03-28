# Correlation Engine — Research & Implementation Plan

**Date**: 2026-03-27
**Researcher**: Claude (pre-coding Boris Cherny pattern)

---

## 1. Codebase State

### Existing Tables (from migrations 001–004)
| Table | Relevance |
|-------|-----------|
| `iocs` | Source nodes — has `value`, `type`, `is_active`, `first_seen`, `last_seen`, `source_count`, `metadata_` (JSONB) |
| `ioc_sources` | Per-feed observations — has `ioc_id`, `feed_name`, `raw_payload` (JSONB), `feed_run_id`, `ingested_at` |
| `feed_runs` | Feed execution history — has `id`, `feed_name`, `started_at` |
| `ioc_relationships` | Edge table — has `source_ioc`, `target_ioc`, `relationship`, `confidence`, `inferred_by` |
| `threat_actors` | Actor profiles — has `id`, `techniques` (JSONB list: [{id, name}]), `software`, `associated_malware` |
| `threat_actor_ioc_links` | IOC ↔ actor mapping — has `threat_actor_id`, `ioc_id`, `confidence` |

### New Tables Needed (migration 005)
- `campaigns` — cluster/campaign records
- `campaign_iocs` — M2M: campaign ↔ ioc with signal metadata

### Key Model Files
- `backend/app/models/ioc.py` → `IOCModel`
- `backend/app/models/ioc_source.py` → `IOCSourceModel`
- `backend/app/models/feed_run.py` → `FeedRunModel`
- `backend/app/models/threat_actor.py` → `ThreatActorModel`, `ThreatActorIOCLinkModel`
- `backend/app/models/relationship.py` → `IOCRelationshipModel`
- **No** `backend/app/models/__init__.py` seen — check if models are imported individually

### Config
- Settings class in `backend/app/config.py` uses pydantic-settings
- Schedule settings follow pattern: `{name}_schedule_minutes: int = <default>`
- New setting needed: `correlation_schedule_minutes: int = 360`

### Scheduler
- `backend/app/feeds/scheduler.py` — APScheduler, `create_scheduler(settings)` function
- Pattern: `_run_<name>` async coroutine + `scheduler.add_job(...)` call
- Dev note: use `next_run_time = now + timedelta(minutes=5)` for correlation (not immediate)

### API Pattern
- Routers in `backend/app/api/routers/`
- Schemas (Pydantic models) in `backend/app/api/schemas.py`
- Routers registered in `backend/main.py` via `app.include_router()`

### Frontend
- `frontend/src/app/(app)/layout.tsx` — sidebar nav; need to add Campaigns link between Threat Actors and Bulk Lookup
- `frontend/src/lib/api.client.ts` — `fetchApi()` for client-side calls
- Lucide-react icons used throughout (e.g., `Shield`, `Search`, `Network`)
- All pages follow pattern: Server Component fetching data, rendering with Tailwind+dark theme

---

## 2. Signal Implementation Details

### Signal 1 — IP Subnet /24 (weight 0.7)
- Query: `SELECT id, value FROM iocs WHERE type = 'ip' AND is_active = true`
- Parse with `ipaddress.ip_address(value)` — skip failures
- Group by first 3 octets (e.g., `192.168.1`) → `.packed[:3]`
- For each subnet group: `itertools.combinations(ids, 2)` → edges with weight 0.7
- Boost confidence slightly if subnet has >5 IPs (cap at 0.9)
- **Risk**: Large subnets could generate O(n²) pairs — cap at 100 IOCs per subnet

### Signal 2 — Co-occurrence (weight 0.9)
- Query: `SELECT ioc_id, feed_run_id FROM ioc_sources WHERE feed_run_id IS NOT NULL`
- Group by `feed_run_id`
- For each run: take first 50 IOCs (cap), `combinations(ids, 2)` → edges
- Weight by shared_runs / total_runs for the pair (normalize up to 0.9)
- Multiple shared runs → higher confidence

### Signal 3 — Malware Family (weight 0.85)
- Query: `SELECT ioc_id, raw_payload FROM ioc_sources WHERE raw_payload IS NOT NULL`
- Extract `malware_family` from `raw_payload` (key varies by feed — check ThreatFox: `malware`, MalwareBazaar: `tags`, OTX: `malware_family`)
- Normalize: lowercase, strip whitespace
- Skip generic: `{"trojan", "malware", "rat", "backdoor", "spyware", "adware", "generic"}`
- Group by family → `combinations(ids, 2)` → edges with weight 0.85

### Signal 4 — Temporal (weight 0.5)
- Query: `SELECT ioc_id, feed_name, ingested_at FROM ioc_sources ORDER BY ingested_at`
- Group by `feed_name`
- Within each feed, sort by `ingested_at`; sliding 3-hour window
- Connect pairs within same window, same feed
- **Risk**: Large feeds could have many IOCs in 3h window → cap at 30 per window

### Signal 5 — TTP Overlap (weight 0.8)
- Query: `SELECT ioc_id, threat_actor_id FROM threat_actor_ioc_links`
- Then: `SELECT id, techniques FROM threat_actors WHERE id IN (...)`
- Group IOCs by threat_actor_id
- Only fire signal if threat_actor has at least 1 technique
- For each actor's IOC group: `combinations(ioc_ids, 2)` → edges with weight 0.8

---

## 3. Engine Algorithm

```
1. Run all 5 signals concurrently via asyncio.gather
2. Collect edges: Dict[(ioc_a, ioc_b), List[Tuple[signal_name, weight]]]
3. Normalize each edge: combined_weight = max(signal_weights)
   (OR weighted sum normalized — using MAX avoids double-counting)
   Actually: use SUM capped at 1.0 for multi-signal edges (stronger signal)
4. Filter edges where combined_weight < min_confidence (0.4)
5. Build adjacency dict from filtered edges
6. BFS/DFS to find connected components
7. Filter components with < min_cluster_size (3) IOCs
8. For each component:
   a. avg_confidence = mean of all edge weights in component
   b. primary_signal = signal that contributed most edges
   c. shared_actors = intersection of all threat_actor_ids for component's IOCs
   d. shared_techniques = from shared actors' techniques lists
   e. name = generate_campaign_name(component)
   f. Upsert into campaigns + campaign_iocs
9. Archive campaigns whose IOCs are no longer active
10. Return CampaignRunResult(campaigns_found, iocs_clustered, duration_s)
```

**Edge weight combining**: Use `1 - product(1 - w_i)` (probabilistic OR) — better than sum because it gives diminishing returns and stays ≤ 1.0.

---

## 4. Campaign Naming Algorithm

```python
def generate_campaign_name(ioc_ids, metadata) -> str:
    # Priority 1: malware family if present
    # Priority 2: feed name
    # Priority 3: IOC type (dominant)

    families = extract_families(ioc_ids)  # from ioc_sources.raw_payload
    feed_name = most_common_feed(ioc_ids)
    ioc_type = most_common_type(ioc_ids)

    prefix = families[0] if families else feed_name.replace("_", " ").title()
    suffix = f"{len(ioc_ids)} IOCs"
    date_str = first_seen.strftime("%b %Y")

    return f"{prefix} {ioc_type.upper()} Cluster — {suffix} ({date_str})"
```

---

## 5. Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `backend/alembic/versions/005_campaigns.py` | DB migration |
| `backend/app/models/campaign.py` | SQLAlchemy models for campaigns + campaign_iocs |
| `backend/app/correlation/__init__.py` | Package marker |
| `backend/app/correlation/signals.py` | 5 signal detectors |
| `backend/app/correlation/engine.py` | CorrelationEngine + CampaignRunResult |
| `backend/app/api/routers/campaigns.py` | API endpoints |
| `frontend/src/app/(app)/campaigns/page.tsx` | Campaigns list page |
| `frontend/src/app/(app)/campaigns/[id]/page.tsx` | Campaign detail page |

### Modified Files
| File | Change |
|------|--------|
| `backend/app/config.py` | Add `correlation_schedule_minutes: int = 360` |
| `backend/app/feeds/scheduler.py` | Add `_run_correlation` + `add_job(...)` with 5-min delay |
| `backend/app/api/schemas.py` | Add `CampaignListItem`, `CampaignDetail`, `CampaignStats` |
| `backend/main.py` | Register `campaigns.router` |
| `backend/app/models/__init__.py` (if exists) | Import campaign models |
| `frontend/src/app/(app)/layout.tsx` | Add Campaigns nav link |
| `frontend/src/app/(app)/page.tsx` | Add campaign stat card + TOP CAMPAIGNS section |

---

## 6. Migration Plan (005)

```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    confidence NUMERIC(4,2),
    ioc_count INTEGER DEFAULT 0,
    status VARCHAR DEFAULT 'active',
    primary_signal VARCHAR,
    techniques JSONB DEFAULT '[]',
    threat_actor_ids JSONB DEFAULT '[]',
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    metadata_ JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaign_iocs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    ioc_id UUID NOT NULL REFERENCES iocs(id) ON DELETE CASCADE,
    signal_types JSONB DEFAULT '[]',
    confidence NUMERIC(4,2),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, ioc_id)
);

CREATE INDEX campaign_iocs_campaign_idx ON campaign_iocs(campaign_id);
CREATE INDEX campaign_iocs_ioc_idx ON campaign_iocs(ioc_id);
CREATE INDEX campaigns_status_idx ON campaigns(status);
CREATE INDEX campaigns_confidence_idx ON campaigns(confidence DESC);
```

---

## 7. API Schema Plan

```
GET /api/campaigns → CampaignListResponse
  params: limit=50, page=1, min_confidence=0.0, status="active", signal_type=None

GET /api/campaigns/stats → CampaignStatsResponse
  (must be BEFORE /:id route to avoid "stats" being treated as an ID)

GET /api/campaigns/{id} → CampaignDetailResponse

POST /api/campaigns/run → {"status": "running", "message": "..."}
```

**Critical ordering**: `/stats` endpoint must be registered before `/{id}` in the router to avoid FastAPI matching "stats" as an ID parameter.

---

## 8. Frontend Plan

### layout.tsx change
Add between threat-actors and bulk-lookup:
```tsx
{ href: "/campaigns", label: "Campaigns", icon: Network }
```
`Network` icon is available from `lucide-react`.

### campaigns/page.tsx
- Server component, fetches `/api/campaigns` + `/api/campaigns/stats`
- Stats bar: 3 metric cards (total, IOCs clustered, avg confidence)
- Filter pills for signal type (client-side filter on loaded data, or query param)
- 2-column grid of campaign cards
- Each card: name, confidence bar, IOC count, primary signal badge, dates, actors

### campaigns/[id]/page.tsx
- Server component with `params: { id: string }` — access `params.id` DIRECTLY
- Hero section: name, confidence badge, status, primary signal
- Signal breakdown table
- IOC table (top 20)
- Linked threat actors
- Timeline bar

### page.tsx (dashboard) additions
- Add campaigns stat counter in the stats bar
- Add "TOP CAMPAIGNS" section (below threat actors, top 3 by ioc_count)

---

## 9. Test Strategy

Existing tests: 147 passing (from `tests/`)
New tests to add (if time permits after backend done):
- `tests/test_correlation_signals.py` — unit test each signal with in-memory SQLite
- `tests/test_correlation_engine.py` — integration test full engine run

The key risk: correlation engine queries may be slow on empty DB. Guards:
- Each signal returns `[]` if no data found (no crash)
- Engine handles 0-edge case gracefully (no campaigns created)

---

## 10. Implementation Order

1. Migration 005 → write + run `alembic upgrade head`
2. `backend/app/models/campaign.py` → SQLAlchemy models
3. Update `backend/app/models/__init__.py` if it exists
4. `backend/app/correlation/` package (signals → engine → scheduler integration)
5. `backend/app/config.py` → add schedule setting
6. `backend/app/feeds/scheduler.py` → register correlation job
7. `backend/app/api/schemas.py` → campaign schemas
8. `backend/app/api/routers/campaigns.py` → endpoints
9. `backend/main.py` → register router
10. Run `pytest` → must stay 147 passed
11. Frontend: layout.tsx → campaigns/page.tsx → campaigns/[id]/page.tsx → page.tsx
12. Final: `rm -rf frontend/.next`

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| O(n²) pairs in large subnets | Cap: 100 IOCs per subnet group |
| O(n²) in large feed runs | Cap: 50 IOCs per feed_run_id |
| Temporal window too wide on big feeds | Cap: 30 IOCs per 3h window |
| Signal 5 returns 0 edges (no actor links in DB yet) | Engine handles [] gracefully |
| Campaign name collision on re-run | Use UPSERT with name as stable identifier OR use UUID-based matching |
| Alembic autogenerate missing campaign models | Write migration manually (explicit is safer) |
| `models/__init__.py` may not exist | Check before touching it |

---

## 12. Open Questions

1. **Campaign deduplication across runs**: On re-run, how do we know a "Feodo Botnet Cluster" detected in run 1 is the same as run 2? Proposal: match by the sorted set of ioc_ids — if >70% overlap with existing campaign, update it instead of creating new.

2. **threat_actor_ioc_links populated?**: Signal 5 depends on this table having data. The MITRE ATT&CK feed populates `threat_actors` but IOC-to-actor links are populated by ThreatFox/OTX feed workers (via their `raw_payload` actor fields). If these links are sparse, Signal 5 will return 0 edges — acceptable per spec ("report if 0 edges").

3. **ioc_sources.raw_payload malware_family field**: Field name varies by feed:
   - ThreatFox: `malware` key
   - MalwareBazaar: `tags` key (list, use first tag as family)
   - OTX: `malware_family` key
   - Need to check all 3 in `_extract_malware_family(raw_payload)`
