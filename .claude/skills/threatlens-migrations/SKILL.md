# ThreatLens Migrations Skill

Use this skill for any Alembic migration work in ThreatLens.

---

## Migration Files

- Location: `backend/alembic/versions/`
- Naming convention: `NNN_description.py` (zero-padded 3-digit prefix)
- Current migrations (in order):
  - `001_initial_schema.py` — all 8 tables, pg_trgm/pgcrypto extensions, indexes
  - `002_ioc_sources_unique_feed.py`
  - `003_threat_actors.py`
  - `004_geoip_columns.py`
- Next migration would be: `005_description.py`

---

## Commands

Always run from `backend/` directory:

```bash
# Check current migration state
.venv/bin/alembic current

# Apply all pending migrations
.venv/bin/alembic upgrade head

# Generate a new migration from model changes
.venv/bin/alembic revision --autogenerate -m "description"

# Roll back one step
.venv/bin/alembic downgrade -1
```

**Always run `alembic current` before creating a new migration** to confirm the DB is at the expected revision and there are no pending unapplied migrations.

---

## Critical: iocs.type is TEXT — Not a Postgres ENUM

The `iocs.type` column is defined as `sa.Text()` in the initial migration:

```python
sa.Column("type", sa.Text(), nullable=False),
```

This means:
- **No migration is needed to add a new `IOCType` enum value**
- Just add the new value to `IOCType` in `backend/app/normalization/schema.py`
- The DB will accept any string — the constraint is only at the Python layer

Do not attempt to create a Postgres `ENUM` type for `iocs.type`. The existing `TEXT` column + Python-level enum is intentional.

---

## Supabase Pooler Requirement

The `DATABASE_URL` must use the **session pooler** URL. The engine in `backend/app/db/session.py` must always include:

```python
connect_args={
    "statement_cache_size": 0,
    "server_settings": {"statement_timeout": "0"},
}
```

- `statement_cache_size: 0` — disables asyncpg's prepared statement cache, which breaks under PgBouncer
- `statement_timeout: 0` — disables Supabase's default per-statement timeout that kills long bulk upserts

**Never remove these** when editing `session.py`.

---

## When a Migration IS Needed

Migrations are needed when you change:
- Table structure: add/remove/rename columns
- Constraints: unique constraints, foreign keys, check constraints
- Indexes: add or drop indexes
- New tables or dropped tables

Migrations are **not** needed for:
- Adding a new `IOCType` enum value (TEXT column, see above)
- Changes to Python-only models/schemas
- Feed adapter changes

### Generating a Migration

```bash
cd backend

# 1. Check current state
.venv/bin/alembic current

# 2. Make your SQLAlchemy model changes

# 3. Generate the migration
.venv/bin/alembic revision --autogenerate -m "add_greynoise_columns"

# 4. Review the generated file in alembic/versions/
# — autogenerate is not perfect; always read the output before applying

# 5. Apply
.venv/bin/alembic upgrade head
```

---

## Alembic Config

- `backend/alembic.ini` — points to `backend/alembic/` directory
- `backend/alembic/env.py` — imports `app.models` for autogenerate target metadata
- The `DATABASE_URL` used by alembic comes from `app.config.settings.database_url`, which reads `.env`

---

## Schema Reference

Key tables (from `001_initial_schema.py`):

| Table | Purpose |
|-------|---------|
| `iocs` | Canonical IOC records; `UNIQUE(value, type)` |
| `ioc_sources` | Per-feed observation log; `UNIQUE(ioc_id, feed_name)` |
| `feed_runs` | Feed execution history |
| `ioc_relationships` | Adjacency table for IOC co-occurrence edges |
| `tags` | Analyst tags (FK → iocs) |
| `notes` | Analyst notes (FK → iocs) |
| `watchlists` | Analyst watchlist entries (FK → iocs) |
| `threat_actors` | Threat actor profiles |

The `iocs` table unique constraint is named `uq_iocs_value_type` — referenced in the upsert's `ON CONFLICT` clause. Do not rename or drop it.
