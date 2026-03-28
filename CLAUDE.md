# ThreatLens — Claude Code Project Context

## What It Is

Open-source Threat Intelligence Platform aggregating free OSINT feeds into a SOC analyst dashboard. Portfolio project targeting analysts who can't afford Recorded Future/Anomali.

**Auth is intentionally removed.** All endpoints unprotected by design. Will be rebuilt when needed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python 3.9+), SQLAlchemy async, asyncpg |
| Database | PostgreSQL via Supabase (free tier, Mumbai region) |
| Migrations | Alembic (5 versions: 001–005) |
| Scheduler | APScheduler |
| Frontend | Next.js 14, TypeScript, Tailwind CSS v3 |
| Charts | recharts |
| Maps | react-simple-maps |
| Graph | React Flow |
| PDF | ReportLab |

---

## How To Run

```bash
cd backend && .venv/bin/uvicorn main:app --reload
cd frontend && npm run dev
cd backend && .venv/bin/alembic upgrade head
cd backend && .venv/bin/pytest tests/ -v
```

---

## Project Structure

```
ProjectWEB/
├── backend/
│   ├── .env                    # Secrets (gitignored)
│   ├── main.py                 # FastAPI entry + APScheduler lifespan
│   ├── alembic/versions/       # 001–005
│   └── app/
│       ├── config.py           # Pydantic settings (all env vars)
│       ├── db/session.py       # Async engine + pool config
│       ├── models/             # SQLAlchemy ORM models
│       ├── normalization/      # canonicalize.py, scoring.py, upsert.py, schema.py
│       ├── feeds/              # BaseFeedWorker, adapters, scheduler.py
│       ├── correlation/        # engine.py, signals.py
│       └── api/routers/        # iocs.py, campaigns.py, threat_actors.py, feeds.py, workspace.py, reports.py
└── frontend/
    └── src/
        ├── app/(app)/          # All pages (see Frontend Map below)
        ├── components/         # GeoMap, TrendChart, graph/ioc-node, ui/*
        └── lib/                # api.client.ts, utils.ts
```

---

## Critical Gotchas — Never Violate These

### Database
- **MUST use Session Pooler URL** (port 5432), NOT direct connection (IPv6 only)
- **MUST have** `connect_args={"statement_cache_size": 0}` in session.py (PgBouncer)
- `pool_size=3, max_overflow=2` — Supabase free tier has 15 connection budget
- `iocs.type` is **VARCHAR not ENUM** — never create a migration for new IOC types
- Always run `alembic current` before creating new migrations
- Upsert is dual-dialect: PostgreSQL uses `ON CONFLICT DO UPDATE`; SQLite uses SELECT-then-INSERT (tests only)

### Frontend
- `globals.css` MUST be exactly 5 lines: 3 @tailwind directives + body + border rule
- **NEVER add @import to globals.css** — breaks Tailwind v3 completely
- **Next.js 14** — NEVER use React 19 `use(params)` — always access `params.id` directly
- After any frontend changes: `rm -rf frontend/.next && npm run dev` + Cmd+Shift+R
- Use `next/font` for Google Fonts — never @import in CSS

### Feed Adapters
- **VT 429 (rate limit)**: do NOT mark `vt_checked=true` — IOC must retry next run
- **VT 404 (not found)**: DO mark `vt_checked=true` — no data, skip permanently
- VT batch size max 20 IOCs per run (4 req/min free tier → 16s sleep between calls)
- All feeds stagger on startup — minimum 30s apart (never fire simultaneously)
- Co-occurrence signal requires `shared_count >= 2` — single shared run is noise
- OTX co-occurrence capped at 20 IOCs per pulse (O(n²) protection)
- GeoIP response order matches request order — zip() assumption, never reorder

### Scoring
- Thresholds must be synced across ALL THREE: `scoring.py`, `iocs.py` CASE bands, `utils.ts`
- Severity recalculates on every upsert — can decrease as IOC ages (intentional decay)

---

## Severity Scoring (v3)

```python
confidence_component = raw_confidence * 10 * 0.35
source_component     = (log2(source_count+1) / log2(11)) * 10 * 0.25  # capped at 11 feeds
recency_component    = exp(-0.008 * age_days) * 10 * 0.40
severity             = round(sum, 2)  # range [0.0, 10.0]
```

Thresholds: **critical >= 8.0**, **high >= 6.5**, **medium >= 4.0**, **low < 4.0**

---

## IOCType Enum + Canonicalization

Enum: `ip, domain, hash_md5, hash_sha1, hash_sha256, url, cve`

| Type | Rule |
|------|------|
| `ip` | Parse via `ipaddress`, convert IPv4-mapped IPv6 → IPv4 |
| `domain` | Lowercase, strip `www.`, validate via tldextract |
| `hash_*` | Strip whitespace, lowercase |
| `url` | Lowercase scheme + netloc, preserve path/query/fragment |
| `cve` | Strip whitespace, uppercase |

Adding new types: add to `IOCType` enum in `schema.py` + branch in `canonicalize.py`. No migration needed.

---

## NormalizedIOC Schema

```python
class NormalizedIOC(BaseModel):
    value: str               # Pre-canonical form (upsert.py calls canonicalize())
    ioc_type: IOCType
    raw_confidence: float    # [0.0, 1.0]
    feed_name: str
    raw_payload: dict        # Full API response row
    metadata: dict = {}      # Feed-specific fields (malware_family, country, etc.)
    feed_run_id: Optional[str] = None
```

---

## Feed Adapters (9 ingestion + 2 enrichment)

| Feed | `feed_name` | Interval | Key Required | Notes |
|------|-------------|----------|--------------|-------|
| AlienVault OTX | `otx` | 120min | `OTX_API_KEY` | Delta via `modified_since`, page cap on first run |
| URLhaus | `urlhaus` | 60min | `URLHAUS_API_KEY` | Recent malicious URLs |
| ThreatFox | `threatfox` | 360min | `URLHAUS_API_KEY` (shared) | C2 IPs, domains, hashes |
| Feodo Tracker | `feodotracker` | 60min | None | Botnet C2 IPs, CSV format |
| MalwareBazaar | `malwarebazaar` | 60min | None | Malware hashes (SHA256+MD5+SHA1 per row) |
| SSLBL | `sslbl` | 120min | None | SSL cert SHA1 fingerprints |
| CISA KEV | `cisa_kev` | 1440min | None | CVEs (known exploited) |
| MITRE ATT&CK | `mitre_attack` | 1440min | None | Threat actor groups + techniques (STIX 2.1) |
| VirusTotal | `virustotal` | 360min | `VT_API_KEY` | Enrichment — scores unchecked IOCs |
| GeoIP Enricher | `geoip_enricher` | 120min | None | Enrichment — batch geocodes IPs via ip-api.com |

### Feed Adapter Pattern

```python
class MyFeedWorker(BaseFeedWorker):
    feed_name = "my_feed"

    def is_configured(self) -> bool:
        return bool(self.settings.my_api_key)  # or True if keyless

    async def fetch_and_normalize(self, session) -> list[NormalizedIOC]:
        ...  # fetch + parse + return NormalizedIOC list
```

Register in: `config.py` (schedule var) → `feeds/scheduler.py` (add_job) → `api/routers/feeds.py` (`_KNOWN_FEEDS` + dispatch chain)

Reference implementations: `feodotracker.py`, `malwarebazaar.py`

---

## Correlation Engine

Lives in `app/correlation/`. Runs every 6 hours (20min startup delay).

### Signals

| Signal | Base Weight | Notes |
|--------|-------------|-------|
| `cooccurrence` | 0.6 + 0.1×shared_runs (max 0.9) | Requires shared_count ≥ 2 |
| `malware_family` | 0.85 | Skips generic names; capped at 20 IOCs per family |
| `ttp_overlap` | 0.8 | IOCs linked to same threat actor with techniques; capped at 30 |
| `subnet_clustering` | 0.7 + density bonus (max 0.15) | /24 subnets; skips single-feed or >50 IP subnets |
| `temporal` | 0.5 | ±3h window per feed; capped at 30 IOCs (weakest signal) |

Edge kept only if: **≥2 signals fire** AND combined weight ≥ 0.4

Edge combination (probabilistic OR): `w = 1.0 - Π(1.0 - w_i)`

Clustering: BFS connected components. Min size: 5. Max size: 500.

### Campaign Confidence

```python
signal_score       = sum(weights[s] for s in fired_signals) / 1.75  # normalized to ~1.0
cluster_size_score = min(cluster_size / 20, 1.0)
cross_feed_score   = min(distinct_feeds / 3, 1.0)
actor_link_score   = 1.0 if linked_actor else 0.0

confidence = signal_score*0.40 + cluster_size_score*0.25 + cross_feed_score*0.20 + actor_link_score*0.15
```

Campaign fingerprint = SHA256 of sorted IOC IDs (stable across processes).

---

## Database Schema (11 tables)

`iocs`, `ioc_sources`, `ioc_relationships`, `feed_runs`, `tags`, `notes`, `watchlist`, `threat_actors`, `threat_actor_ioc_links`, `campaigns`, `campaign_iocs`

### Key columns

**iocs**: `id (UUID PK)`, `value (TEXT)`, `type (VARCHAR)`, `severity (NUMERIC 4,2)`, `score_version (INT)`, `score_explanation (JSON)`, `first_seen`, `last_seen`, `source_count (INT)`, `is_active (BOOL)`, `metadata_ (JSON)`, `latitude (FLOAT)`, `longitude (FLOAT)`
Unique: `(value, type)`

**ioc_sources**: `ioc_id (FK)`, `feed_name`, `raw_score`, `raw_payload (JSON)`, `ingested_at`, `feed_run_id (FK)`
Unique: `(ioc_id, feed_name)`

**ioc_relationships**: `source_ioc (FK)`, `target_ioc (FK)`, `relationship (TEXT)`, `confidence`, `inferred_by`
Unique: `(source_ioc, target_ioc, relationship)`

**campaigns**: `name`, `confidence`, `ioc_count`, `status (active|archived)`, `primary_signal`, `techniques (JSON)`, `threat_actor_ids (JSON)`, `metadata_ (JSON {fingerprint})`

**feed_runs**: `feed_name`, `started_at`, `completed_at`, `status (running|success|error)`, `iocs_fetched`, `iocs_new`, `iocs_updated`, `error_msg`, `consecutive_failure_count`

---

## API Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/iocs` | `q, type, severity_min, severity_max, page, page_size` |
| GET | `/api/iocs/{id}` | Full detail with sources, tags, notes |
| GET | `/api/iocs/{id}/graph` | `hops` (max 3), truncated at 100 nodes |
| GET | `/api/stats` | Total IOCs, by type, by severity |
| GET | `/api/campaigns` | `page, page_size` |
| GET | `/api/campaigns/stats` | Aggregate: total, avg confidence, by signal type |
| GET | `/api/campaigns/{id}` | Detail + member IOCs |
| POST | `/api/campaigns/run` | Trigger correlation engine immediately |
| GET | `/api/threat-actors` | `q, page, page_size` |
| GET | `/api/threat-actors/{id}` | Techniques, software, linked IOCs |
| GET | `/api/threat-actors/{id}/iocs` | Paginated IOCs linked to actor |
| GET | `/api/feeds/health` | Status of all feeds (last run, counts, errors) |
| POST | `/api/feeds/{name}/trigger` | Manual feed trigger |
| GET | `/api/workspace/watchlist` | User's watchlist IOCs |
| POST | `/api/workspace/watchlist` | `{ioc_id}` |
| DELETE | `/api/workspace/watchlist/{ioc_id}` | |
| POST | `/api/iocs/{id}/tags` | `{tag}` |
| DELETE | `/api/iocs/{id}/tags/{tag_id}` | |
| POST | `/api/iocs/{id}/notes` | `{body}` |
| PUT | `/api/iocs/{id}/notes/{note_id}` | |
| DELETE | `/api/iocs/{id}/notes/{note_id}` | |
| POST | `/api/reports/ioc/{id}` | Returns PDF (StreamingResponse) |
| POST | `/api/reports/threat-actor/{id}` | Returns PDF (StreamingResponse) |

---

## Frontend Page Map

| Page | Route |
|------|-------|
| Dashboard | `/` |
| IOC Search | `/search` |
| IOC Detail | `/iocs/[id]` |
| IOC Graph | `/iocs/[id]/graph` |
| Bulk Lookup | `/bulk-lookup` |
| Campaigns List | `/campaigns` |
| Campaign Detail | `/campaigns/[id]` |
| Threat Actors | `/threat-actors` |
| Actor Detail | `/threat-actors/[id]` |
| ATT&CK Matrix | `/threat-actors/matrix` |
| Watchlist | `/workspace/watchlist` |

Key `lib/` exports:
- `fetchApi(endpoint, options)` — calls `NEXT_PUBLIC_BACKEND_URL` (default `http://127.0.0.1:8000`)
- `getSeverity(score)` → `{label, cls, textCls, barCls, dotCls}`
- `formatRelativeTime(iso)`, `formatDate(iso)`, `formatDateTime(iso)`

---

## Environment Variables

### Backend (`backend/.env`)

```
DATABASE_URL=postgresql+asyncpg://...@db.supabase.co:5432/postgres  # Session Pooler URL
TEST_DATABASE_URL=sqlite+aiosqlite:///./test.db
OTX_API_KEY=                 # leave blank to disable OTX feed
URLHAUS_API_KEY=             # also enables ThreatFox
VT_API_KEY=                  # leave blank to disable VirusTotal
ALLOWED_ORIGINS=http://localhost:3000
# Optional schedule overrides (minutes):
URLHAUS_SCHEDULE_MINUTES=60
OTX_SCHEDULE_MINUTES=120
OTX_PULSE_LIMIT=20
OTX_MAX_PAGES_FIRST_RUN=1
THREATFOX_SCHEDULE_MINUTES=360
VT_SCHEDULE_MINUTES=360
FEODOTRACKER_SCHEDULE_MINUTES=60
MALWAREBAZAAR_SCHEDULE_MINUTES=60
SSLBL_SCHEDULE_MINUTES=120
CISA_KEV_SCHEDULE_MINUTES=1440
MITRE_ATTACK_SCHEDULE_MINUTES=1440
GEOIP_ENRICHER_SCHEDULE_MINUTES=120
CORRELATION_SCHEDULE_MINUTES=360
```

### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

---

## Mistakes Log — Never Repeat These

- **Never use React 19 `use(params)`** in Next.js 14 — use `params.id` directly
- **Never add @import to globals.css** — breaks Tailwind v3 silently
- **Never use AbuseIPDB /blacklist endpoint** — requires paid tier
- **Never mark VT `vt_checked=true` on 429** — IOC will never be retried
- **Never fire all feed schedulers simultaneously** — exhausts Supabase pool instantly
- **Never run correlation engine CLI scripts directly** — bypasses uvicorn pool management
- **Never use pool_size > 3** on Supabase free tier session pooler
- **Never autogenerate migrations for IOC types** — type column is VARCHAR
- **Always sync severity thresholds** across `scoring.py` + `iocs.py` + `utils.ts`
- **Always use Promise.all()** for parallel API calls on dashboard — sequential = slow
- **Always stagger feed startup times** — 30s apart minimum
- **Always test actual API endpoints with httpx** before writing parsers — never assume format
- **Never assume GeoIP response order** — zip() requires response order matches request order

---

## Research Before Coding (Boris Cherny Pattern)

For any feature touching more than 2 files:
1. Read all relevant files
2. Write findings to `research.md`
3. Present plan and wait for approval
4. Only then write code

Never give verbal summaries — always write to a file.

---

## After Every Session

- Update this CLAUDE.md with new mistakes or patterns
- Run pytest — must stay green before committing
- `git add . && git commit -m "descriptive message"`
- Context at 70%+ → `/compact` | Context at 90%+ → `/clear`

---

## Current State

- **Test suite**: 147 passing
- **IOC count**: ~56k
- **Feeds**: 9 ingestion + 2 enrichment (11 total)
- **Campaigns**: 18 correlated clusters
- **Threat actors**: 187 from MITRE ATT&CK
- **Migrations**: 5 (001–005)
- **Next**: Add 6 new feeds, then deploy to Vercel + Railway
