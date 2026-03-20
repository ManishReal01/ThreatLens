# ThreatLens

## What This Is

ThreatLens is a web-based Threat Intelligence Platform that aggregates free OSINT threat feeds into a unified analyst dashboard. It ingests and normalizes IOCs (IP addresses, domains, file hashes, and URLs) from sources like AbuseIPDB, URLhaus, and AlienVault OTX into a PostgreSQL database, then lets security analysts search, enrich, tag, and track threats through a clean web UI. Built for SOC analysts, freelance security consultants, and small security teams who can't afford commercial threat intel platforms.

## Core Value

Analysts can search any IOC and immediately see aggregated intelligence from multiple feeds — with severity context, related IOCs, and their own team's notes — in one place.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Feed ingestion pipeline for AbuseIPDB, URLhaus, and AlienVault OTX on a schedule
- [ ] IOC normalization and deduplication into PostgreSQL (IPs, domains, hashes, URLs)
- [ ] IOC search with filters (type, severity, feed source, date range)
- [ ] Composite severity scoring (weighted: feed confidence + IOC age + source count)
- [ ] Dashboard showing recent threats and feed health status
- [ ] Interactive graph visualization of IOC relationships (node-edge, D3 or Cytoscape)
- [ ] Analyst workspace: tags, notes, watchlists, CSV/JSON export
- [ ] Multi-user authentication (login, accounts, per-analyst workspaces)

### Out of Scope

- Commercial feed integrations — paid APIs deferred; free OSINT only for v1
- Mobile app — web-first
- Real-time streaming ingestion — scheduled polling is sufficient for v1
- Automated threat response / SOAR integration — analytics platform only in v1

## Context

- Dual purpose: portfolio project demonstrating security engineering + potential SaaS business
- Stack: Next.js (frontend), FastAPI (backend + ingestion workers), PostgreSQL via Supabase
- Feed APIs: AbuseIPDB (IP reputation), URLhaus (malicious URLs), AlienVault OTX (broad IOC coverage — requires free API key)
- Target users are cost-sensitive; free tier must be compelling before any paid features
- v1 milestone: 3 feeds end-to-end → dashboard + search functional → analyst workspace → auth
- Future milestones: expand to MalwareBazaar, ThreatFox, GreyNoise Community; add campaigns; alerting; API access for customers

## Constraints

- **Tech Stack**: Next.js + FastAPI + Supabase PostgreSQL — locked in
- **Feeds**: Free/community APIs only for v1 — no paid feed contracts
- **Data**: IOC data from public OSINT sources; platform must respect feed API rate limits
- **Auth**: Multi-user from the start — Supabase Auth is the natural choice given the DB choice

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PostgreSQL via Supabase | Handles relational IOC data well; Supabase adds auth + real-time for free tier | — Pending |
| 3 feeds for v1 (AbuseIPDB, URLhaus, OTX) | Broad IOC type coverage (IPs, URLs, mixed) with reliable free APIs | — Pending |
| Composite auto-severity scoring | More useful to analysts than raw feed scores; surfaces multi-source corroboration | — Pending |
| Graph viz in v1 | Core differentiator vs simple search tools; worth the complexity | — Pending |

---
*Last updated: 2026-03-20 after initialization*
