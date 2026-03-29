# ThreatLens — Open Source Threat Intelligence Platform

![Python 3.9+](https://img.shields.io/badge/Python-3.9%2B-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql)
![License MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)

> A unified SOC analyst dashboard aggregating 14 free OSINT threat feeds into a single, searchable threat intelligence platform — built for security teams who can't afford commercial TI tooling.

<!-- Add screenshot here -->

---

## Features

- ✅ **14 Active Threat Feeds** — URLhaus, OTX, ThreatFox, CISA KEV, Feodo Tracker, MalwareBazaar, SSLBL, Spamhaus DROP, Emerging Threats, OpenPhish, PhishTank, NVD CVE, VirusTotal enrichment, GeoIP enrichment
- ✅ **63,000+ IOCs Indexed** — IPs, domains, URLs, hashes (MD5/SHA1/SHA256), and CVEs
- ✅ **Correlation Engine** — Automated campaign detection via co-occurrence, temporal, subnet, malware-family, and TTP-overlap signals; 337+ correlated threat campaigns
- ✅ **SOC Command Center Dashboard** — Real-time threat map, live alerts, IOC ingest trends, and top threat actors
- ✅ **IOC Search & Filtering** — Full-text search across 7 IOC types with severity filters
- ✅ **Bulk Lookup** — Paste up to 100 IOCs for instant batch lookup with CSV export
- ✅ **Severity Scoring** — Composite score weighted by feed confidence (35%), source count (25%), and recency (40%)
- ✅ **Threat Actor Intelligence** — Full MITRE ATT&CK adversary database with IOC correlation
- ✅ **MITRE ATT&CK Matrix** — Interactive technique heatmap visualization
- ✅ **Analyst Workspace** — Per-IOC tags, notes, and watchlist for triage workflows
- ✅ **GeoIP Threat Map** — World map showing IP IOC origins by severity
- ✅ **PDF Reports** — Exportable PDF report generation per IOC and threat actor

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + Python 3.9+, APScheduler |
| ORM | SQLAlchemy async (`asyncpg`) |
| Database | PostgreSQL (Supabase transaction pooler) |
| Migrations | Alembic |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS v3 |
| Charts | Recharts |
| Maps | react-simple-maps |
| Graph | React Flow |
| PDF | ReportLab |
| HTTP Client | `httpx` async with `tenacity` retry/backoff |

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/ManishReal01/threatlens.git
cd threatlens
```

### 2. Configure environment

Copy and fill in the example files:

```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Minimum required in `backend/.env`:

```env
# MUST use Transaction Pooler URL (port 6543)
DATABASE_URL=postgresql+asyncpg://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres

# Optional — leave blank to disable that feed
OTX_API_KEY=
URLHAUS_API_KEY=
VT_API_KEY=
```

> **Important:** Use the Supabase **transaction pooler** URL (port **6543**), not the session pooler or direct connection URL. Using port 5432 will cause prepared statement errors.

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
| [Feodo Tracker](https://feodotracker.abuse.ch/) | IP (botnet C2) | None |
| [MalwareBazaar](https://bazaar.abuse.ch/) | SHA256, MD5, SHA1 | None |
| [SSLBL](https://sslbl.abuse.ch/) | SHA1 (SSL certs) | None |
| [Spamhaus DROP](https://www.spamhaus.org/drop/) | IP | None |
| [Emerging Threats](https://rules.emergingthreats.net/) | IP | None |
| [OpenPhish](https://openphish.com/) | URL | None |
| [PhishTank](https://www.phishtank.com/) | URL | None |
| [NVD CVE](https://nvd.nist.gov/) | CVE | None |
| [MITRE ATT&CK](https://attack.mitre.org/) | Threat actor groups + techniques | None |
| [VirusTotal](https://www.virustotal.com/) | IP, Hash, URL (enrichment) | API key |
| [GeoIP Enricher](https://ip-api.com/) | IP geolocation (enrichment) | None |

---

## Correlation Engine

ThreatLens automatically clusters related IOCs into threat campaigns by firing five independent signals:

| Signal | Weight | Logic |
|---|---|---|
| Co-occurrence | 0.6–0.9 | IOCs seen together across ≥2 feed runs |
| Malware family | 0.85 | Shared malware family tag |
| TTP overlap | 0.80 | IOCs linked to same threat actor with techniques |
| Subnet clustering | 0.7–0.85 | IPs sharing a /24 subnet |
| Temporal | 0.50 | IOCs ingested within a ±3h window |

An edge is kept only if **≥2 signals fire** and the combined weight is ≥0.4. Clusters with ≥5 members become campaigns. Results are available at `/campaigns`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 14 Frontend (Port 3000)                            │
│  Dashboard · IOC Search · Bulk Lookup · Campaigns           │
│  Threat Actors · ATT&CK Matrix · Analyst Workspace          │
└───────────────────┬─────────────────────────────────────────┘
                    │  REST API
┌───────────────────▼─────────────────────────────────────────┐
│  FastAPI Backend (Port 8000)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  IOC Router  │  │ Feed Router  │  │ Campaigns Router │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ APScheduler — 14 feed jobs (staggered, long-interval)│   │
│  │ URLhaus · OTX · ThreatFox · CISA KEV · Feodo         │   │
│  │ MalwareBazaar · SSLBL · Spamhaus · Emerging Threats  │   │
│  │ OpenPhish · PhishTank · NVD · MITRE ATT&CK · VT      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Correlation Engine (every 6h)                        │   │
│  │ 5 signals → BFS clustering → campaign upsert         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Normalization + Upsert pipeline                      │   │
│  │ Canonicalize → NormalizedIOC → upsert_ioc()          │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────┬─────────────────────────────────────────┘
                    │  asyncpg (transaction pooler, port 6543)
┌───────────────────▼─────────────────────────────────────────┐
│  PostgreSQL (Supabase)                                      │
│  iocs · ioc_sources · feed_runs · threat_actors             │
│  campaigns · campaign_iocs · ioc_relationships              │
│  tags · notes · watchlist                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

All variables live in `backend/.env`. Only `DATABASE_URL` is required.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Supabase **transaction pooler** URL — port **6543**. Format: `postgresql+asyncpg://postgres.[ref]:[pass]@aws-0-region.pooler.supabase.com:6543/postgres` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins. Default: `http://localhost:3000` |
| `OTX_API_KEY` | No | [AlienVault OTX](https://otx.alienvault.com/) API key. Leave blank to disable. |
| `URLHAUS_API_KEY` | No | [abuse.ch](https://abuse.ch/) API key — shared by URLhaus and ThreatFox. Leave blank to disable both. |
| `VT_API_KEY` | No | [VirusTotal](https://www.virustotal.com/) free API key. Leave blank to disable VT enrichment. |

Schedule intervals and pagination limits can be overridden in `.env` — see `.env.example` and `backend/app/config.py` for the full list.

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
