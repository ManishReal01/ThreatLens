# ThreatLens Codebase Audit — Research Notes

## Scoring Formula (from scoring.py)
- confidence_component = raw_confidence * 10 * 0.35
- source_component = log2(source_count+1) / log2(11) * 10 * 0.25
- recency_component = exp(-0.008 * age_days) * 10 * 0.40
- Thresholds: critical >= 8.0, high >= 6.5, medium >= 4.0
- Weights: recency=0.40, confidence=0.35, source_count=0.25 (CLAUDE.md says 3.5/2.5/4.0 — WRONG, those are raw multipliers but weights differ)

## Correlation Signal Weights (from signals.py)
- subnet_clustering: 0.7
- cooccurrence: base 0.6 + 0.1*shared_count, capped at 0.9
- malware_family: 0.85
- temporal: 0.5
- ttp_overlap: 0.8

## Campaign Confidence Formula (from engine.py)
- signal_score * 0.40 + cluster_size_score * 0.25 + cross_feed_score * 0.20 + actor_link_score * 0.15

## NormalizedIOC fields
value, ioc_type, raw_confidence, feed_name, raw_payload, metadata={}, feed_run_id=None

## IOCType enum values
ip, domain, hash_md5, hash_sha1, hash_sha256, url, cve

## Feed names and schedules
otx=120min, urlhaus=60min, threatfox=360min, virustotal=360min(enrichment)
feodotracker=60min, malwarebazaar=60min, sslbl=120min, cisa_kev=1440min
mitre_attack=1440min, geoip_enricher=120min(enrichment)

## Migrations (5 total)
001_initial_schema, 002_ioc_sources_unique_feed, 003_threat_actors
004_geoip_columns, 005_campaigns

## ENV vars
DATABASE_URL, TEST_DATABASE_URL, OTX_API_KEY, URLHAUS_API_KEY, VT_API_KEY
ALLOWED_ORIGINS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
NEXT_PUBLIC_BACKEND_URL

## Key gotchas found
- Upsert is dual-dialect (Postgres ON CONFLICT, SQLite fallback for tests)
- VT 429: don't mark vt_checked; 404: do mark vt_checked
- OTX co-occurrence capped at 20 IOCs per pulse (O(n^2) protection)
- Campaign fingerprint uses SHA256 of sorted IOC IDs (not Python hash())
- MITRE linking runs via SQL CROSS JOIN LATERAL ILIKE match
- GeoIP response order matches request order (zip() assumption)
- Severity recalcs on every upsert — can decrease as IOC ages

## Frontend pages (from app/(app)/)
/, /search, /iocs/[id], /iocs/[id]/graph, /bulk-lookup
/campaigns, /campaigns/[id], /threat-actors, /threat-actors/[id]
/threat-actors/matrix, /workspace/watchlist

## API router summary
/api/iocs (search, detail, graph)
/api/stats
/api/campaigns (list, stats, detail, run)
/api/threat-actors (list, detail, iocs)
/api/feeds/health, /api/feeds/{name}/trigger
/api/workspace (watchlist, tags, notes)
/api/reports (ioc pdf, actor pdf)
