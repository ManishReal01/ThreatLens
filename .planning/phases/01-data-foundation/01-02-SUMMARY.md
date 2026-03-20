# 01-02 Summary: Normalization Layer — Schema, Canonicalize, Scoring, Upsert, Co-occurrence

**Completed:** 2026-03-20
**Phase:** 01-data-foundation / Wave 2
**Status:** DONE ✅

---

## What Was Built

### Task 1: NormalizedIOC struct, canonicalization, severity scoring

| File | Purpose |
|------|---------|
| `backend/app/normalization/__init__.py` | Empty package marker |
| `backend/app/normalization/schema.py` | `IOCType` enum (6 values), `NormalizedIOC` Pydantic model with `@field_validator` on `raw_confidence` (0.0–1.0) |
| `backend/app/normalization/canonicalize.py` | `canonicalize_ioc()` — IP (IPv4-mapped IPv6 → IPv4), domain (lowercase + www strip), hash (lowercase), URL (scheme+host lowercase, path preserved) |
| `backend/app/normalization/scoring.py` | `compute_severity()` with weights 40/35/25 and `exp(-0.008 * age_days)` decay; `SeverityResult` Pydantic model; 4 exported constants |
| `backend/tests/test_schema.py` | 8 tests — validation, boundary values, all enum members |
| `backend/tests/test_canonicalize.py` | 9 tests — per-type normalization including IPv4-mapped IPv6, www stripping, subdomain preservation |
| `backend/tests/test_scoring.py` | 11 tests — weight constants, monotonic decay, explanation keys, boundary ranges |

**Committed:** `feat: normalization layer — NormalizedIOC schema, canonicalize, severity scoring (Task 1, Phase 01-02)`

### Task 2: Upsert logic, ioc_sources logging, co-occurrence inference

| File | Purpose |
|------|---------|
| `backend/app/normalization/upsert.py` | `upsert_ioc()` — (value,type) dedup; PG path uses `ON CONFLICT DO UPDATE`, SQLite path uses SELECT-then-INSERT/UPDATE; always inserts `IOCSourceModel` row; severity recomputed with new source_count+age on update |
| | `infer_cooccurrence_relationships()` — `combinations(ioc_ids, 2)` edges; PG uses `ON CONFLICT DO NOTHING`, SQLite checks existence before insert; returns edge count |
| `backend/tests/test_upsert.py` | 8 tests — new/dup detection, source always inserted, severity stored, separate types, last_seen updated, source_count increments, explanation keys |
| `backend/tests/test_relationships.py` | 6 tests — 3/2/1/0 IOCs → correct edge count, duplicate no-op, edge attributes, empty list |

**Committed:** `feat: upsert logic, ioc_sources logging, co-occurrence inference (Task 2, Phase 01-02)`

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| All 45 tests green | `pytest tests/ -x -v` | ✅ 45 passed in 0.40s |
| NormalizedIOC importable | `python -c "from app.normalization.schema import NormalizedIOC, IOCType; print(list(IOCType))"` | ✅ All 6 types |
| Weights correct | `assert FEED_CONFIDENCE_WEIGHT == 0.40; assert SOURCE_COUNT_WEIGHT == 0.35; assert RECENCY_WEIGHT == 0.25` | ✅ PASS |
| Upsert importable | `from app.normalization.upsert import upsert_ioc, infer_cooccurrence_relationships` | ✅ PASS |

---

## Must-Have Truths Verified

- [x] NormalizedIOC Pydantic model validates all IOC types and rejects invalid raw_confidence values
- [x] Canonicalization produces consistent lowercase/stripped output for IPs, domains, hashes, and URLs
- [x] Severity formula computes a score in 0.0–10.0 range using weights: confidence 40%, source count 35%, recency 25%
- [x] Severity decays monotonically as age_days increases
- [x] Upsert creates a new IOC row on first insert, updates last_seen and source_count on conflict
- [x] Every upsert always creates an ioc_sources row even on conflict
- [x] Co-occurrence inference creates N*(N-1)/2 edges for N co-observed IOCs
- [x] Duplicate relationship inserts are no-ops (SQLite: SELECT-before-INSERT; PG: ON CONFLICT DO NOTHING)

---

## Git Log

```
ad6b165 feat: upsert logic, ioc_sources logging, co-occurrence inference (Task 2, Phase 01-02)
c627468 feat: normalization layer — NormalizedIOC schema, canonicalize, severity scoring (Task 1, Phase 01-02)
f0ddf05 test: pytest infrastructure + 3 smoke tests passing (Task 3, Phase 01-01)
7171a07 feat: Alembic migration 001_initial_schema — 8 tables, all indexes/constraints (Task 2)
594a36f feat: scaffold backend, all 7 ORM models — Task 1 (Phase 01-01)
```

---

## What Phase 02 Inherits

- `NormalizedIOC` is the contract every feed adapter must produce — no schema concerns in adapters
- `canonicalize_ioc()` handles all 6 IOC types; adapters call it before producing `NormalizedIOC`
- `upsert_ioc(session, ioc)` is the single write path — feed adapters import and call it directly
- `infer_cooccurrence_relationships(session, ids, inferred_by)` is ready for batch co-occurrence inference after a feed run
