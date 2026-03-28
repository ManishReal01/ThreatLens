# ThreatLens — Open Source Threat Intelligence Platform

![Python 3.9+](https://img.shields.io/badge/Python-3.9%2B-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=flat-square&logo=fastapi)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql)
![License MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)

> A unified SOC analyst dashboard aggregating free OSINT threat feeds into a single, searchable threat intelligence platform — built for security teams who can't afford commercial TI tooling.

<!-- Add screenshot here -->

---

## Features

- ✅ **9+ Active Threat Feeds** — URLhaus, OTX, ThreatFox, CISA KEV, Feodo Tracker, MalwareBazaar, SSLBL, MITRE ATT&CK, VirusTotal enrichment
- ✅ **SOC Command Center Dashboard** — Real-time threat map, live alerts, IOC ingest trends, and top threat actors
- ✅ **IOC Search & Filtering** — Full-text search across 7 IOC types (IP, domain, URL, MD5, SHA1, SHA256, CVE) with severity filters
- ✅ **Bulk Lookup** — Paste up to 100 IOCs for instant batch lookup with CSV export
- ✅ **Severity Scoring** — Composite score weighted by feed confidence (50%), source count (25%), and recency (25%)
- ✅ **Threat Actor Intelligence** — Full MITRE ATT&CK adversary group database with IOC correlation
- ✅ **Analyst Workspace** — Per-IOC tags, notes, and watchlist for triage workflows
- ✅ **GeoIP Threat Map** — Leaflet-powered world map showing IP IOC origins by severity
- ✅ **IOC Reports** — PDF report generation per IOC for sharing and documentation
- ✅ **Live Enrichment** — On-demand GeoIP, DNS, and VirusTotal/URLhaus enrichment per indicator

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + Python, APScheduler |
| ORM | SQLAlchemy async (`asyncpg`) |
| Database | PostgreSQL (Supabase session pooler) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Maps | Leaflet.js via React-Leaflet |
| Search | `pg_trgm` GIN indexes |
| HTTP Client | `httpx` async with `tenacity` retry/backoff |

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/threatlens.git
cd threatlens
```

### 2. Configure environment

Create `backend/.env` with the following (see [Environment Variables](#environment-variables) for full reference):

```env
# Required
DATABASE_URL=postgresql+asyncpg://user:pass@aws-0-region.pooler.supabase.com:5432/postgres

# Optional — leave blank to disable that feed
OTX_API_KEY=
URLHAUS_API_KEY=
VT_API_KEY=
```

> **Important:** Use the Supabase **session pooler** URL (`pooler.supabase.com`), not the direct connection URL (`db.*.supabase.co`).

### 3. Run database migrations

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
```

### 4. Start the backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Feed Sources

| Feed | IOC Types | Auth Required |
|---|---|---|
| [URLhaus](https://urlhaus.abuse.ch/) | URL, Domain | API key (abuse.ch) |
| [AlienVault OTX](https://otx.alienvault.com/) | IP, Domain, Hash, URL | API key |
| [ThreatFox](https://threatfox.abuse.ch/) | IP, Domain, Hash, URL | API key (abuse.ch) |
| [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) | CVE | None |
| [MITRE ATT&CK](https://attack.mitre.org/) | Threat actor groups | None |
| [Feodo Tracker](https://feodotracker.abuse.ch/) | IP (botnet C2) | None |
| [MalwareBazaar](https://bazaar.abuse.ch/) | SHA256, MD5, SHA1 | None |
| [SSLBL](https://sslbl.abuse.ch/) | SHA1 (SSL certs) | None |
| [VirusTotal](https://www.virustotal.com/) | IP, Hash, URL (enrichment) | API key |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 14 Frontend (Port 3000)                        │
│  Dashboard · IOC Search · Bulk Lookup · Threat Actors   │
│  Analyst Workspace · GeoIP Map                          │
└───────────────────┬─────────────────────────────────────┘
                    │  REST API (CORS)
┌───────────────────▼─────────────────────────────────────┐
│  FastAPI Backend (Port 8000)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ IOC Router   │  │ Feed Router  │  │ Workspace    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │ APScheduler — feed ingestion jobs (hourly/daily) │   │
│  │ URLhaus · OTX · ThreatFox · CISA KEV · Feodo     │   │
│  │ MalwareBazaar · SSLBL · MITRE ATT&CK · VT        │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Normalization + Upsert pipeline                  │   │
│  │ Canonicalize → NormalizedIOC → upsert_ioc()      │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────┬─────────────────────────────────────┘
                    │  asyncpg (session pooler)
┌───────────────────▼─────────────────────────────────────┐
│  PostgreSQL (Supabase)                                  │
│  iocs · ioc_sources · feed_runs · threat_actors         │
│  tags · notes · watchlist_items                         │
└─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

All variables live in `backend/.env`. Only `DATABASE_URL` is required; everything else defaults to disabled/empty.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Supabase **session pooler** URL — must use `pooler.supabase.com:5432`, not the direct `db.*.supabase.co` host. Format: `postgresql+asyncpg://user:pass@aws-0-region.pooler.supabase.com:5432/postgres` |
| `OTX_API_KEY` | No | [AlienVault OTX](https://otx.alienvault.com/) API key. Leave blank to disable OTX feed. |
| `URLHAUS_API_KEY` | No | [abuse.ch](https://abuse.ch/) API key — shared by both URLhaus and ThreatFox feeds. Leave blank to disable both. |
| `VT_API_KEY` | No | [VirusTotal](https://www.virustotal.com/) free API key. Leave blank to disable VT enrichment. |

All other settings (schedule intervals, pagination limits, CORS origins) have sensible defaults and can be overridden in `.env` if needed — see `backend/app/config.py` for the full list.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.
