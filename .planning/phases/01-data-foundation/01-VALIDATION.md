---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio (no test infrastructure exists yet — Wave 0 creates it) |
| **Config file** | `backend/pytest.ini` — Wave 0 |
| **Quick run command** | `pytest tests/ -x -q` |
| **Full suite command** | `pytest tests/ -v --tb=short` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/ -x -q`
- **After every plan wave:** Run `pytest tests/ -v --tb=short`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | IOC-01 | unit | `pytest tests/test_schema.py -x` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | IOC-01 | unit | `pytest tests/test_canonicalize.py -x` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | IOC-03, IOC-04 | unit | `pytest tests/test_scoring.py -x` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | IOC-01, IOC-02, IOC-03 | integration | `pytest tests/test_upsert.py -x` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 0 | IOC-05 | unit+integration | `pytest tests/test_relationships.py -x` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | IOC-01 | unit | `pytest tests/test_schema.py -x` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | IOC-01 | unit | `pytest tests/test_canonicalize.py -x` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | IOC-03, IOC-04 | unit | `pytest tests/test_scoring.py -x` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 1 | IOC-01, IOC-02, IOC-03 | integration | `pytest tests/test_upsert.py -x` | ❌ W0 | ⬜ pending |
| 1-02-05 | 02 | 1 | IOC-05 | integration | `pytest tests/test_relationships.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/pytest.ini` — pytest configuration with asyncio mode
- [ ] `backend/tests/conftest.py` — async DB session fixture (in-memory SQLite or test Supabase)
- [ ] `backend/tests/test_schema.py` — stubs for NormalizedIOC struct validation (IOC-01)
- [ ] `backend/tests/test_canonicalize.py` — stubs for per-type canonicalization (IOC-01)
- [ ] `backend/tests/test_scoring.py` — stubs for severity formula and decay (IOC-03, IOC-04)
- [ ] `backend/tests/test_upsert.py` — stubs for upsert idempotency and source logging (IOC-01, IOC-02, IOC-03)
- [ ] `backend/tests/test_relationships.py` — stubs for co-occurrence inference (IOC-05)
- [ ] Framework install: `pip install pytest pytest-asyncio pytest-cov`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alembic migration runs cleanly against Supabase | IOC-01 | Requires live Supabase connection | Run `alembic upgrade head` against Supabase project; verify all tables appear in dashboard |
| `GENERATED ALWAYS AS STORED` supported on Supabase PG version | IOC-01 | Environment-specific PG version | Run `ALTER TABLE iocs ADD COLUMN ts_vector TSVECTOR GENERATED ALWAYS AS ...` in Supabase SQL editor first; confirm no error |
| `pg_trgm` and `pgcrypto` extensions enabled | IOC-01 | Supabase extension availability | Check Supabase dashboard Extensions tab; enable if not pre-enabled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
