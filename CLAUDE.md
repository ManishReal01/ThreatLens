# ThreatLens — Claude Code Project Context

## What It Is

ThreatLens is a web-based Threat Intelligence Platform that aggregates free OSINT feeds into a unified SOC analyst dashboard. It is a portfolio project with SaaS potential, targeting SOC analysts and small security teams who can't afford commercial TI platforms.

**Auth is intentionally removed.** All API endpoints are unprotected by design — no JWT middleware, no auth checks.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python, APScheduler for feed ingestion |
| ORM | SQLAlchemy async (`asyncpg` driver) |
| Database | PostgreSQL via Supabase (session pooler URL only) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Search | `pg_trgm` GIN indexes (no Elasticsearch) |
| HTTP client | `httpx` async with `tenacity` retry/backoff |

---

## Project Structure

```
ProjectWEB/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, router registration
│   ├── app/
│   │   ├── config.py            # Settings (pydantic-settings, reads .env)
│   │   ├── api/
│   │   │   ├── routers/
│   │   │   │   ├── iocs.py      # IOC search, bulk lookup, stats
│   │   │   │   ├── feeds.py     # Feed health + manual trigger endpoints
│   │   │   │   ├── workspace.py # Tags, notes, watchlists
│   │   │   │   ├── threat_actors.py
│   │   │   │   └── reports.py
│   │   │   ├── deps.py          # FastAPI dependencies (CurrentUser, AdminUser)
│   │   │   └── schemas.py       # Pydantic request/response models
│   │   ├── db/
│   │   │   └── session.py       # Engine, AsyncSessionLocal, get_db dependency
│   │   ├── feeds/
│   │   │   ├── base.py          # BaseFeedWorker — all workers inherit this
│   │   │   ├── scheduler.py     # APScheduler job wiring (one job per feed)
│   │   │   ├── abuseipdb.py
│   │   │   ├── urlhaus.py
│   │   │   ├── otx.py
│   │   │   ├── threatfox.py
│   │   │   ├── mitre_attack.py
│   │   │   └── cisa_kev.py
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── normalization/
│   │   │   ├── schema.py        # IOCType enum + NormalizedIOC Pydantic model
│   │   │   ├── canonicalize.py  # Per-type IOC canonicalization
│   │   │   └── upsert.py        # upsert_ioc() — insert or update IOC row
│   │   └── ...
│   ├── alembic/                 # Migrations
│   └── tests/
└── frontend/
    └── src/app/
        ├── (app)/               # Route group (authenticated layout)
        │   ├── iocs/            # IOC detail pages
        │   ├── search/          # Search UI
        │   ├── bulk-lookup/
        │   ├── workspace/       # Tags, notes, watchlists
        │   └── threat-actors/
        ├── auth/                # Auth pages (login/signup — kept but unprotected)
        ├── globals.css          # CRITICAL — see gotchas below
        ├── layout.tsx           # Root layout
        └── page.tsx             # Dashboard / home
```

---

## How to Run

### Backend
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm run dev
```
Frontend runs on `http://localhost:3000`. Backend CORS is configured to allow this origin.

### Alembic Migrations
```bash
cd backend
alembic upgrade head          # apply all pending migrations
alembic revision --autogenerate -m "description"  # generate new migration
```

### Environment
Copy `.env.example` to `.env` in `backend/`. Required keys:
- `DATABASE_URL` — Supabase session pooler URL (see gotcha below)
- `ABUSEIPDB_API_KEY`, `OTX_API_KEY`, `URLHAUS_API_KEY` (leave blank to disable that feed)

---

## Critical Gotchas

### 1. `globals.css` — Never Touch
`frontend/src/app/globals.css` must stay exactly as-is. **Never add `@import`**, never add extra lines. Next.js / Tailwind will break in non-obvious ways if this file grows. The file currently contains only Tailwind directives and two bare CSS rules — keep it that way.

### 2. Supabase Session Pooler URL Only
`DATABASE_URL` must use the **session pooler** URL from Supabase (`aws-0-*.pooler.supabase.com:5432`), **never** the direct connection URL (`db.*.supabase.co:5432`). PgBouncer in transaction mode breaks asyncpg's prepared statement cache.

### 3. `connect_args={"statement_cache_size": 0}` is Mandatory
In `backend/app/db/session.py` the engine is created with:
```python
connect_args={
    "statement_cache_size": 0,
    "server_settings": {"statement_timeout": "0"},
}
```
**Do not remove these.** `statement_cache_size: 0` prevents `QueryCanceledError` when PgBouncer routes connections. `statement_timeout: 0` prevents Supabase's default timeout from killing long bulk feed upserts.

### 4. Next.js 14 — No React 19 `use(params)`
This project uses **Next.js 14**, not 15. Never use the React 19 `use()` hook to unwrap params:
```tsx
// WRONG — React 19 / Next.js 15 only
const { id } = use(params)

// CORRECT — Next.js 14
const { id } = params
```
Access `params.id` (or other fields) directly in page components.

### 5. After Frontend Changes: Clear `.next` Cache
If a frontend change doesn't appear or you see stale behavior:
```bash
cd frontend && rm -rf .next && npm run dev
```
Then do a hard refresh in the browser (`Cmd+Shift+R`).

---

## Feed Adapter Pattern

All feed workers extend `BaseFeedWorker` (`backend/app/feeds/base.py`).

### Contract
```python
class MyFeedWorker(BaseFeedWorker):
    FEED_NAME = "my_feed"           # must match the DB feed_name string

    def is_configured(self) -> bool:
        # Return True if required API keys are set; False to skip
        return bool(self.settings.my_feed_api_key)

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        # Fetch, map to NormalizedIOC, call upsert_ioc(), return (fetched, new, updated)
        ...
```

`BaseFeedWorker` provides:
- `self._get(url)` / `self._post(url)` — httpx with 3-attempt exponential backoff
- Feed run lifecycle: creates `feed_runs` row, sets status/counts, handles errors
- HTTP client as async context manager (`async with Worker(settings) as worker:`)

### Registering a New Feed in the Scheduler
Add a `_run_<name>` coroutine and `scheduler.add_job(...)` call in `backend/app/feeds/scheduler.py`, following the existing pattern. Add the schedule interval setting to `Settings` in `config.py`. Add the feed name to `_KNOWN_FEEDS` in `backend/app/api/routers/feeds.py`.

---

## IOCType Enum

Defined in `backend/app/normalization/schema.py`. Current values:

```python
class IOCType(str, Enum):
    ip          = "ip"
    domain      = "domain"
    hash_md5    = "hash_md5"
    hash_sha1   = "hash_sha1"
    hash_sha256 = "hash_sha256"
    url         = "url"
    cve         = "cve"
```

Adding a new type requires: updating the enum + a new Alembic migration to extend the `ioc_type` PostgreSQL enum.

### Canonicalization Rules (`normalization/canonicalize.py`)
| Type | Rule |
|------|------|
| `ip` | Parse via `ipaddress`, IPv4-mapped IPv6 → IPv4 |
| `domain` | Lowercase, strip `www.` prefix |
| `hash_*` | Strip whitespace, lowercase |
| `url` | Strip whitespace, lowercase scheme + netloc |
| `cve` | Strip whitespace, uppercase |

---

## NormalizedIOC — The Feed Contract

Every feed adapter must produce `NormalizedIOC` instances:

```python
class NormalizedIOC(BaseModel):
    value: str               # canonical IOC value
    ioc_type: IOCType
    raw_confidence: float    # 0.0–1.0; validated
    feed_name: str
    raw_payload: dict        # original feed response object
    metadata: dict = {}      # enrichment data (first_seen, last_seen, etc.)
    feed_run_id: Optional[str] = None
```

Pass to `upsert_ioc(session, ioc)` which returns `(model, is_new: bool)`.

---

## Active Feeds

| Feed | IOC Types | Auth | Schedule |
|------|-----------|------|----------|
| URLhaus | url, domain | API key (abuse.ch) | 1h |
| AlienVault OTX | ip, domain, hash, url | API key | 2h |
| ThreatFox | ip, domain, hash, url | API key (abuse.ch, same as URLhaus) | 6h |
| MITRE ATT&CK | (techniques/tactics metadata) | None | 24h |
| CISA KEV | cve | None | 24h |
| VirusTotal | enrichment (ip, hash, url) | API key | 6h |
| Feodo Tracker | ip (botnet C2) | None | 1h |
| MalwareBazaar | hash_sha256, hash_md5, hash_sha1 | None | 1h |
| SSLBL | hash_sha1 (SSL certs) | None | 2h |

---

## Current Phase

**Phase 1 — Data Quality**: Feed roster updated. VirusTotal enrichment active. Feodo Tracker, MalwareBazaar, and SSLBL added (all abuse.ch, no API key required).

---

## Severity Score Formula

Composite score used throughout the platform:
- **Feed confidence**: 50%
- **Source count** (how many feeds reported the IOC): 25%
- **Recency**: 25%
