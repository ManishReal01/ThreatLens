# Requirements: ThreatLens

**Defined:** 2026-03-20
**Core Value:** Analysts can search any IOC and immediately see aggregated intelligence from multiple feeds — with severity context, related IOCs, and their own team's notes — in one place.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can log in and maintain session across browser refreshes
- [ ] **AUTH-03**: User can reset password via email link
- [ ] **AUTH-04**: Admin role exists with elevated permissions (feed config, manual sync trigger)
- [ ] **AUTH-05**: Each analyst's tags, notes, and watchlists are private to their account (per-user workspace isolation)

### Feed Ingestion

- [ ] **FEED-01**: System polls AbuseIPDB on a configurable schedule and ingests IP reputation IOCs
- [ ] **FEED-02**: System polls URLhaus on a configurable schedule and ingests malicious URL IOCs
- [ ] **FEED-03**: System polls AlienVault OTX on a configurable schedule and ingests multi-type IOCs (IPs, domains, hashes, URLs)
- [ ] **FEED-04**: Each feed adapter enforces per-feed rate limits with backoff and retry on failure
- [ ] **FEED-05**: Admin user can manually trigger a feed sync from the UI
- [ ] **FEED-06**: Feed health status is tracked per run: timestamp, success/failure, IOC count ingested, error message if failed

### IOC Data

- [ ] **IOC-01**: Ingested IOCs are normalized into a canonical schema with a unique (value, type) constraint — no duplicates across feeds
- [ ] **IOC-02**: Each feed observation is logged separately: which feed, when seen, raw confidence score, raw metadata
- [ ] **IOC-03**: Each IOC has a composite severity score computed as: feed confidence (40%) + source count (35%) + recency (25%)
- [ ] **IOC-04**: Severity score decays automatically as IOC last-seen date ages (older IOCs score lower)
- [ ] **IOC-05**: IOC relationships are inferred during ingestion (co-occurrence within feed observations) and stored in an adjacency table

### Search

- [ ] **SRCH-01**: User can search IOCs by value using full-text and trigram matching (partial IP, subdomain, partial hash supported)
- [ ] **SRCH-02**: User can filter search results by IOC type (IP, domain, hash, URL)
- [ ] **SRCH-03**: User can filter search results by severity level (critical, high, medium, low)
- [ ] **SRCH-04**: User can filter search results by feed source
- [ ] **SRCH-05**: User can filter search results by date range (first seen / last seen)
- [ ] **SRCH-06**: All search results are paginated — no unbounded result sets

### IOC Detail

- [ ] **DTIL-01**: User can view a detail page for any IOC showing: severity score with formula breakdown, all feed observations, first/last seen dates, raw feed metadata
- [ ] **DTIL-02**: IOC detail page shows the analyst's own tags and notes for that IOC
- [ ] **DTIL-03**: IOC detail page shows a link/entry point to the relationship graph for that IOC

### Dashboard

- [ ] **DASH-01**: Dashboard shows recently ingested high-severity IOCs (last 24–48 hours)
- [ ] **DASH-02**: Dashboard shows feed health status for all 3 feeds: last run time, success/failure, IOC count from last run
- [ ] **DASH-03**: Dashboard shows IOC counts broken down by type and severity

### Graph Visualization

- [ ] **GRPH-01**: User can view an interactive relationship graph for any IOC (React Flow) — nodes are IOCs, edges are observed relationships
- [ ] **GRPH-02**: Graph traversal is capped at max 3 hops and 100 nodes from the seed IOC (enforced at the query layer)
- [ ] **GRPH-03**: Clicking a node in the graph navigates to that IOC's detail page

### Analyst Workspace

- [ ] **WKSP-01**: User can add one or more tags to any IOC (free-form text)
- [ ] **WKSP-02**: User can attach freeform notes/comments to any IOC
- [ ] **WKSP-03**: User can add IOCs to a personal watchlist
- [ ] **WKSP-04**: Watchlisted IOCs are highlighted when they appear in new feed ingestion runs
- [ ] **WKSP-05**: User can export search results or watchlist as CSV or JSON

## v2 Requirements

### Notifications

- **NOTF-01**: User receives in-app notification when a watchlisted IOC appears in a new feed run
- **NOTF-02**: User can configure email alerts for watchlisted IOC activity

### Additional Feeds

- **FEED-V2-01**: MalwareBazaar feed ingestion (file hashes, malware family tags)
- **FEED-V2-02**: ThreatFox feed ingestion (IPs, URLs, domains, hashes)
- **FEED-V2-03**: GreyNoise Community feed ingestion (IP noise classification)

### Advanced Features

- **ADV-01**: STIX/TAXII export for integration with other TIP tools
- **ADV-02**: Bulk IOC lookup via API endpoint (for SIEM integration)
- **ADV-03**: Shared team watchlists (currently private per analyst)
- **ADV-04**: Campaign tracking (group related IOCs into named campaigns)
- **ADV-05**: Alerting webhooks (POST to Slack/Teams when new critical IOCs appear)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated threat response / SOAR integration | High false-positive risk; OSINT scores cannot drive automated blocking in v1 |
| Real-time streaming ingestion | Scheduled polling is sufficient; streaming adds broker complexity with no v1 benefit |
| Mobile app | Web-first; mobile deferred |
| Paid feed integrations | Free OSINT only for v1; commercial feeds require vendor contracts |
| OAuth / SSO login | Email/password + Supabase Auth sufficient for v1; SSO is an enterprise feature |
| Video/rich media IOC types | Out of TIP scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| FEED-01 | Phase 2 | Pending |
| FEED-02 | Phase 2 | Pending |
| FEED-03 | Phase 2 | Pending |
| FEED-04 | Phase 2 | Pending |
| FEED-05 | Phase 2 | Pending |
| FEED-06 | Phase 2 | Pending |
| IOC-01 | Phase 2 | Pending |
| IOC-02 | Phase 2 | Pending |
| IOC-03 | Phase 2 | Pending |
| IOC-04 | Phase 2 | Pending |
| IOC-05 | Phase 2 | Pending |
| SRCH-01 | Phase 3 | Pending |
| SRCH-02 | Phase 3 | Pending |
| SRCH-03 | Phase 3 | Pending |
| SRCH-04 | Phase 3 | Pending |
| SRCH-05 | Phase 3 | Pending |
| SRCH-06 | Phase 3 | Pending |
| DTIL-01 | Phase 3 | Pending |
| DTIL-02 | Phase 3 | Pending |
| DTIL-03 | Phase 3 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| GRPH-01 | Phase 4 | Pending |
| GRPH-02 | Phase 4 | Pending |
| GRPH-03 | Phase 4 | Pending |
| WKSP-01 | Phase 5 | Pending |
| WKSP-02 | Phase 5 | Pending |
| WKSP-03 | Phase 5 | Pending |
| WKSP-04 | Phase 5 | Pending |
| WKSP-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
