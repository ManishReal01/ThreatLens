# Feature Landscape

**Domain:** Threat Intelligence Platform (TIP) — web-based OSINT aggregator
**Researched:** 2026-03-20
**Confidence note:** External research tools (WebSearch, WebFetch, Brave Search, Bash) were denied during this session. All findings below are drawn from training knowledge of MISP, OpenCTI, ThreatConnect, Recorded Future, and VirusTotal Intelligence. Confidence is MEDIUM overall. Verification recommended via official docs before roadmap finalization.

---

## Table Stakes

Features users expect. Missing = product feels incomplete and analysts won't adopt.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| IOC Search | Core analyst workflow — "look up this IP/domain/hash before investigating" | Low | Must support all 4 IOC types: IP, domain, hash, URL. Partial match and exact match both needed. |
| Filter by IOC type | Analysts scope queries constantly by type during triage | Low | Dropdown/chip filter on search results |
| Filter by feed source | Different feeds have different reliability; analysts need to see provenance | Low | Show which feeds reported the IOC |
| Filter by date range | IOC freshness matters — a stale IOC from 2 years ago is low-signal | Low | "Last seen" and "first seen" date filters |
| Severity / risk score | Without scoring, analysts can't triage at a glance; everything looks equally urgent | Medium | Composite score across sources is better than raw per-feed scores; document scoring formula for analyst trust |
| Feed health status | If a feed is down or stale, analysts need to know their data may be incomplete | Low | Dashboard widget showing last-sync time and status per feed |
| Recent threats dashboard | Entry point for daily analyst workflow; "what's new" at a glance | Low-Med | Activity feed, top IOCs, recent ingestion stats |
| IOC detail page | Click-through from search to see full enrichment for one IOC | Low | All feed corroboration, timestamps, related IOCs, analyst notes on one page |
| Tags / labeling | Analysts categorize IOCs during investigation; no tags = no organization | Low | Free-form and preset tags (e.g., "confirmed-malicious", "FP", "investigating") |
| Analyst notes | Inline context per IOC that persists across sessions and team members | Low | Rich text or Markdown; per-IOC, per-analyst or shared |
| Watchlists | Monitoring a set of IOCs over time is a core workflow (e.g., "watch these IPs from incident X") | Medium | Saved lists with alert-on-change or periodic summary |
| Export (CSV / JSON) | Analysts integrate TIP data into reports, SIEM, or other tools | Low | Export filtered results or full IOC details |
| Multi-user auth | SOC teams are never one person; shared workspaces require accounts | Medium | Login, per-user sessions, account management. Supabase Auth covers this. |
| Per-analyst workspace | Notes and tags from Analyst A should not pollute Analyst B's view (or should be clearly attributed) | Medium | Attribution metadata on all annotations |
| Responsive web UI | Analysts work in split-screen with terminals; UI must not require full-width | Low | Not mobile-first, but not a fixed 1920px layout |

---

## Differentiators

Features that set a TIP apart. Not universally expected in free/community tools, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Interactive graph visualization | Analysts can see IOC relationships (shared infrastructure, campaigns) that are invisible in flat search results | High | Node-edge graph (D3.js or Cytoscape.js). Show IP-domain-hash relationships. Core differentiator per PROJECT.md decision. |
| Multi-source corroboration scoring | Shows how many independent feeds agree on an IOC — "seen in 4 feeds" is higher signal than algorithmic scoring alone | Medium | Surface the raw cross-feed agreement count alongside composite score |
| Feed confidence weighting | Not all OSINT feeds are equal in quality; a scoring model that weights by feed reputation is more trustworthy | Medium | Document weights clearly so analysts understand and trust the model |
| IOC age decay in scoring | A 2-year-old IOC should score lower than a fresh one — baked into severity model | Low-Med | Time-based decay factor; important for reducing false positives |
| Campaign grouping | Group related IOCs into attack campaigns; powerful for incident investigation | High | Requires entity model, manual curation, or ML clustering. Defer past v1. |
| Alerting on watchlist matches | Passive monitoring — email or in-app alert when a watched IOC is seen in new intelligence | High | Requires notification infrastructure. Useful but complex. |
| STIX/TAXII export | Industry standard format; enables sharing with other TIPs and SIEM systems | Medium | STIX 2.1 is the current standard. High value for professional teams. |
| Bulk IOC lookup | Upload a list of 50 IPs/hashes, get back enrichment for all — common analyst workflow | Medium | File upload or paste box; batch query against ingested data |
| Historical IOC timeline | Show when an IOC was first seen, how its score changed, when it dropped off | Medium | Requires storing score snapshots over time, not just current state |
| Analyst collaboration (shared notes) | Team notes visible to all analysts; avoids duplicate investigation | Medium | Shared vs. private notes distinction |
| Saved searches | Analysts repeat the same queries; saving search criteria reduces friction | Low | Store filter combos with a name |
| Feed comparison view | Side-by-side: what does AbuseIPDB say vs OTX for the same IP? | Medium | Useful for trust calibration; rare in free tools |

---

## Anti-Features

Features that sound useful but cause real problems. Explicitly avoid these.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automated threat response / SOAR | Dangerous in a shared multi-user tool — automated blocking or remediation based on OSINT scores causes outages from false positives. Out of scope per PROJECT.md. | Provide export hooks so analysts can feed data into their own response tooling deliberately |
| Real-time streaming ingestion (v1) | Engineering complexity far exceeds benefit for OSINT feeds that update every few hours at best. Creates infrastructure burden early. | Scheduled polling (cron) is sufficient and dramatically simpler. Revisit in a later milestone. |
| Per-user private feed access with secrets management | Managing user-supplied API keys (e.g., each analyst brings their own AbuseIPDB key) is a security and ops burden | Use platform-level feed credentials managed by admins only |
| Unlimited IOC data retention with no purge policy | IOC data goes stale and misleads analysts; also storage cost grows unbounded | Implement age-based scoring decay and consider archiving IOCs unseen for 12+ months |
| Full-text search across analyst notes | Requires search index (Elasticsearch or pg_trgm tuning); complexity is high relative to value for small teams | Simple per-IOC note display is sufficient; full-text search is a later optimization |
| Social feed / threat intel sharing with external parties | Becomes a data governance and trust problem. Who can see what? What's the sharing agreement? | STIX/TAXII export lets analysts share deliberately through their own channels |
| Custom scoring formula builder (UI) | Analysts will ask for this; building it is a product trap — endless configuration, hard to explain results | Document the default scoring formula clearly; let admins tune weights via config, not a visual formula builder |
| Mobile app | Security analysis is desktop work; mobile adds cost with near-zero analyst workflow benefit | Responsive web covers emergency lookups on mobile without a native app |
| Paid feed integrations in v1 | Locks in vendor relationships before the product is validated; cost for early users | Free OSINT feeds deliver significant value; add paid feeds only after PMF signal |

---

## Feature Dependencies

```
Multi-user auth → Per-analyst workspace
Multi-user auth → Attribution on tags/notes
Multi-user auth → Watchlists (watchlists are per-user)

Feed ingestion pipeline → Everything else (no data = no features)
IOC normalization/dedup → IOC search (clean data required for reliable search)
IOC normalization/dedup → Severity scoring (scoring requires normalized IOC with source count)

IOC search → IOC detail page (search surfaces results; detail page drills into one)
IOC search → Bulk IOC lookup (bulk is search in batch)
IOC search → Saved searches

Severity scoring → Dashboard (dashboard surfaces highest-scored recent IOCs)
Severity scoring → Watchlists (alerting thresholds built on scores)

Tags + Notes → Analyst workspace concept
Tags + Notes → Export (export should include analyst annotations)

IOC relationships (graph) → Graph visualization (viz requires relationship edges in the data model)
```

---

## MVP Recommendation

**Prioritize for v1 (all table stakes first):**

1. Feed ingestion pipeline (AbuseIPDB, URLhaus, OTX) — foundation everything else depends on
2. IOC normalization and deduplication — data quality gate
3. Composite severity scoring — required for dashboard and triage
4. IOC search with type/source/date filters — primary analyst entry point
5. IOC detail page — drill-down from search
6. Dashboard (feed health + recent threats) — daily entry point
7. Tags, notes, watchlists — analyst workspace basics
8. CSV/JSON export — integration necessity
9. Multi-user auth + per-analyst attribution — required for team use
10. Interactive graph visualization — core differentiator, worth the complexity per PROJECT.md

**Defer from v1:**

| Feature | Reason to Defer |
|---------|----------------|
| Bulk IOC lookup | Useful but not day-one workflow; add in v2 |
| STIX/TAXII export | High value for professionals; complexity warrants its own milestone |
| Alerting on watchlist matches | Requires notification infrastructure; add after watchlists are validated |
| Campaign grouping | Data modeling complexity; needs usage data to design well |
| Historical IOC timeline (score snapshots) | Requires schema for point-in-time score storage; design with v1 in mind, implement in v2 |
| Saved searches | Convenience feature; low-friction workaround exists (bookmark URLs) |
| Feed comparison view | Nice to have; tackle when multiple feeds are stable |

---

## Sources

**Confidence: MEDIUM — training data only. External research tools (WebSearch, WebFetch, Bash) were denied for this session.**

Knowledge drawn from training-time understanding of:
- MISP (Malware Information Sharing Platform) feature set and community usage patterns
- OpenCTI feature set and analyst workflow documentation
- ThreatConnect platform capabilities
- Recorded Future analyst UX patterns
- VirusTotal Intelligence search and enrichment features
- General SOC analyst workflow patterns (SANS Institute SOC survey findings from training data)

**Verification recommended:**
- MISP feature list: https://www.misp-project.org/features/
- OpenCTI docs: https://docs.opencti.io/latest/
- ThreatConnect features: https://threatconnect.com/platform/
- VirusTotal Intelligence: https://www.virustotal.com/gui/intelligence-overview
