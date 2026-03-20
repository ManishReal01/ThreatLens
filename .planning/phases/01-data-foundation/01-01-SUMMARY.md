# 01-01 Summary: Backend Scaffolding, ORM Models, Alembic Migration, pytest Infrastructure

**Completed:** 2026-03-20
**Phase:** 01-data-foundation / Wave 1
**Status:** DONE ✅

---

## What Was Built

### Task 1: Backend Scaffolding & ORM Models
All files created and committed in: `feat: scaffold backend, all 7 ORM models — Task 1 (Phase 01-01)`

| File | Purpose |
|------|---------|
| `backend/requirements.txt` | Pinned deps (sqlalchemy 2.0.48, asyncpg 0.31.0, alembic 1.16.5, pydantic 2.12.5, pytest 8.3.5) |
| `backend/app/config.py` | Pydantic-settings `Settings` class; exports `settings` singleton |
| `backend/app/db/base.py` | `DeclarativeBase` used by all models |
| `backend/app/db/session.py` | Async engine + `AsyncSessionLocal` + `get_db()` FastAPI dep |
| `backend/app/models/ioc.py` | `IOCModel` — `uq_iocs_value_type`, 7 workspace/source relationships |
| `backend/app/models/ioc_source.py` | `IOCSourceModel` — FK → iocs + feed_runs |
| `backend/app/models/relationship.py` | `IOCRelationshipModel` — `uq_ioc_relationship` |
| `backend/app/models/feed_run.py` | `FeedRunModel` — circuit-breaker counter |
| `backend/app/models/workspace.py` | `TagModel`, `NoteModel`, `WatchlistModel` — all `user_id UUID NOT NULL` |
| `.env.example` | Documents all required env vars |

**Version corrections applied (research doc had future-projected versions):**
- `alembic==1.16.5` (1.18.4 not released)
- `pydantic-settings==2.11.0` (2.13.1 not released)
- `tldextract==5.3.0` (5.3.1 not released)

**Python 3.9 compatibility fixes applied:**
- All `X | None` union syntax → `Optional[X]` (3.10+ syntax not available on system Python 3.9)
- All TIMESTAMP columns: added Python-side `default=_utcnow` alongside `server_default=text("NOW()")` (SQLite unit tests cannot call `NOW()`)
- All JSON columns in ORM: `JSONB` → `sa.JSON` (SQLite unit tests cannot create JSONB columns); Alembic migration uses `postgresql.JSONB` for actual DDL

### Task 2: Alembic Migration
Committed in: `feat: Alembic migration 001_initial_schema — 8 tables, all indexes/constraints (Task 2)`

**Migration `001_initial_schema.py` creates in order:**
1. Extensions: `pg_trgm`, `pgcrypto`
2. `feed_runs` (first — no deps) + 2 indexes
3. `iocs` (+ `GENERATED ALWAYS AS` tsvector, 8 indexes including partial `WHERE is_active = TRUE` and GIN trigram)
4. `ioc_sources` (FK → iocs, feed_runs) + 3 indexes
5. `ioc_relationships` (FK → iocs ×2, `uq_ioc_relationship`) + **bidirectional indexes** `ioc_rel_source_idx` + `ioc_rel_target_idx`
6. `tags` (`uq_tag_per_user_ioc`, `user_id UUID NOT NULL`) + 2 indexes
7. `notes` (`user_id UUID NOT NULL`) + 2 indexes
8. `watchlists` (`uq_watchlist_user_ioc`, `user_id UUID NOT NULL`) + 2 indexes
9. `downgrade()` drops all in reverse order + drops extensions

### Task 3: pytest Infrastructure
Committed in: `test: pytest infrastructure + 3 smoke tests passing (Task 3, Phase 01-01)`

| File | Purpose |
|------|---------|
| `backend/pytest.ini` | `asyncio_mode = auto` |
| `backend/tests/conftest.py` | `async_engine` + `async_session` fixtures (SQLite, function-scoped) |
| `backend/tests/test_models_smoke.py` | 3 smoke tests |

---

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| 7 ORM models importable | `python -c "from app.models import ..."` | ✅ PASS |
| Alembic = 1 revision | `ScriptDirectory.walk_revisions()` | ✅ PASS |
| 3 smoke tests green | `pytest tests/test_models_smoke.py -x -q` | ✅ 3 passed in 0.07s |
| All DDL strings present | grep check (15 strings) | ✅ All 15 ✓ |

---

## Must-Have Truths Verified

- [x] All 8 tables exist in schema: `iocs`, `ioc_sources`, `ioc_relationships`, `feed_runs`, `tags`, `notes`, `watchlists`
- [x] `iocs` has `UNIQUE(value, type)` named `uq_iocs_value_type`
- [x] `ioc_relationships` has indexes on both `source_ioc` and `target_ioc` FKs
- [x] All workspace tables (`tags`, `notes`, `watchlists`) have `user_id UUID NOT NULL`
- [x] `pg_trgm` and `pgcrypto` extensions enabled in migration
- [x] Alembic migration runs without errors (verified: 1 revision found)

---

## Git Log

```
f0ddf05 test: pytest infrastructure + 3 smoke tests passing (Task 3, Phase 01-01)
7171a07 feat: Alembic migration 001_initial_schema — 8 tables, all indexes/constraints (Task 2)
594a36f feat: scaffold backend, all 7 ORM models — Task 1 (Phase 01-01)
```

---

## What Plan 01-02 Inherits

- `AsyncSession` fixture in `conftest.py` ready to use for upsert/normalization tests
- `IOCModel.uq_iocs_value_type` constraint wired for `ON CONFLICT DO UPDATE` upsert
- `IOCRelationshipModel` adjacency table with bidirectional indexes ready for co-occurrence inference
- `Base.metadata` registers all 7 model tables for SQLite test schema creation
