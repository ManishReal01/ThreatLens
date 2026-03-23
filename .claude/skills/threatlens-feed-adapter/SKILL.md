# ThreatLens Feed Adapter Skill

Use this skill whenever adding a new feed adapter to ThreatLens.

---

## Pattern Overview

Every feed adapter is a single file in `backend/app/feeds/` that:
1. Subclasses `BaseFeedWorker`
2. Implements two methods: `is_configured()` and `fetch_and_normalize()`
3. Contains a module-level `_map_record()` / `_map_entry()` pure function that converts one raw API record to `NormalizedIOC` (or `None` to skip)
4. Writes nothing to the DB directly — calls `upsert_ioc()` from `app.normalization.upsert`

---

## Imports (copy verbatim for every adapter)

```python
import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)
```

---

## BaseFeedWorker Contract

Defined in `backend/app/feeds/base.py`.

```python
class MyFeedWorker(BaseFeedWorker):
    FEED_NAME = "my_feed"           # snake_case; must match feed_runs.feed_name

    def is_configured(self) -> bool:
        """Return True if all required API keys/settings are present."""
        return bool(self.settings.my_feed_api_key)   # or True for keyless feeds

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        """Fetch, map, upsert. Return (fetched, new, updated)."""
        ...
```

`BaseFeedWorker` provides:
- `self._get(url, **kwargs)` — async GET with 3-attempt exponential backoff
- `self._post(url, **kwargs)` — async POST with same retry
- `self.settings` — the `Settings` instance
- HTTP client lifecycle (open/close via `async with Worker(settings) as worker:`)
- Feed run row creation, status tracking, error handling — **do not replicate this**

---

## fetch_and_normalize() Body Pattern

```python
async def fetch_and_normalize(
    self,
    session: AsyncSession,
    feed_run_id: str,
) -> tuple[int, int, int]:
    response = await self._get(
        _FEED_URL,
        headers={"Authorization": f"Bearer {self.settings.my_feed_api_key}"},
        params={"limit": 1000},
    )

    records: list[dict[str, Any]] = response.json().get("data", [])
    logger.info("MyFeed returned %d records", len(records))

    fetched = new = updated = 0
    for record in records:
        ioc = _map_record(record, feed_run_id)
        if ioc is None:
            continue
        _, is_new = await upsert_ioc(session, ioc)
        fetched += 1
        if is_new:
            new += 1
        else:
            updated += 1

    return fetched, new, updated
```

**Rules:**
- Always use `self._get()` / `self._post()` — never instantiate `httpx` directly
- Always call `upsert_ioc(session, ioc)` — never write `IOCModel` rows manually
- Always return the `(fetched, new, updated)` 3-tuple — `BaseFeedWorker.run()` stores these
- Increment `fetched` only for records you actually attempted to upsert (after `_map_record` returns non-None)

---

## _map_record() Pattern

This is a pure function — no DB calls, no side effects.

```python
def _map_record(record: dict[str, Any], feed_run_id: str) -> Optional[NormalizedIOC]:
    """Map one API record to NormalizedIOC. Returns None to skip."""
    value: str = (record.get("indicator") or "").strip()
    if not value:
        return None                      # always guard against empty/missing value

    return NormalizedIOC(
        value=value,
        ioc_type=IOCType.ip,             # pick the appropriate IOCType
        raw_confidence=0.8,              # 0.0–1.0; normalize API scores if needed
        feed_name="my_feed",             # must match FEED_NAME
        feed_run_id=feed_run_id,
        raw_payload=record,              # always pass the full original record
        metadata={                       # feed-specific enrichment
            "country": record.get("country"),
            "first_seen": record.get("first_seen"),
        },
    )
```

**Confidence normalization examples:**
- Score 0–100 → `raw_score / 100.0`
- Fixed high confidence (e.g. CISA KEV) → use `0.9`
- Unknown/default → use `0.5`

---

## IOCType Enum

All valid values (from `backend/app/normalization/schema.py`):

```python
class IOCType(str, Enum):
    ip          = "ip"
    domain      = "domain"
    hash_md5    = "hash_md5"
    hash_sha1   = "hash_sha1"
    hash_sha256 = "hash_sha256"
    url         = "url"
    cve         = "cve"
```

`iocs.type` is a `TEXT` column in Postgres — **no ENUM constraint, no migration needed** to add a new IOCType value. Just add to the Python enum.

---

## NormalizedIOC Schema

```python
class NormalizedIOC(BaseModel):
    value: str               # raw value; canonicalize_ioc() is called inside upsert_ioc
    ioc_type: IOCType
    raw_confidence: float    # validated: must be in [0.0, 1.0]
    feed_name: str           # must match FEED_NAME class variable
    raw_payload: dict        # full original API response object for this record
    metadata: dict = {}      # enrichment; at minimum include first_seen/last_seen if available
    feed_run_id: Optional[str] = None
```

`upsert_ioc(session, ioc)` returns `tuple[str, bool]` → `(ioc_id, is_new)`.

---

## Registering a New Feed: 4 Files to Touch

### 1. `backend/app/config.py` — add schedule setting

```python
# MyFeed: public feed — daily refresh
my_feed_schedule_minutes: int = 1440
# OR: my_feed_api_key: str = ""  (if auth required)
```

### 2. `backend/app/feeds/scheduler.py` — add runner + job

```python
async def _run_my_feed(settings: Settings) -> None:
    from app.feeds.my_feed import MyFeedWorker
    async with MyFeedWorker(settings) as worker:
        async with AsyncSessionLocal() as session:
            await worker.run(session)
```

Inside `create_scheduler()`:

```python
scheduler.add_job(
    _run_my_feed,
    trigger="interval",
    minutes=settings.my_feed_schedule_minutes,
    kwargs={"settings": settings},
    id="my_feed_feed",
    name="MyFeed Feed",
    replace_existing=True,
    max_instances=1,
    misfire_grace_time=300,
    next_run_time=now,          # run immediately on startup
)
```

Also update the `logger.info()` format string at the bottom of `create_scheduler()` to include the new feed.

### 3. `backend/app/api/routers/feeds.py` — add to known feeds + dispatch

Add to the tuple at the top:

```python
_KNOWN_FEEDS: tuple[str, ...] = ("abuseipdb", "urlhaus", "otx", "threatfox", "cisa_kev", "my_feed")
```

Add to the `_run_feed_worker()` dispatch chain:

```python
elif feed_name == "my_feed":
    from app.feeds.my_feed import MyFeedWorker
    worker_cls = MyFeedWorker
```

### 4. `backend/app/feeds/my_feed.py` — the adapter itself (see pattern above)

---

## Complete Minimal Adapter (keyless feed)

```python
"""MyFeed feed adapter.

API endpoint: GET https://api.example.com/iocs
Auth:         None — public feed
"""
import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.feeds.base import BaseFeedWorker
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc

logger = logging.getLogger(__name__)

_FEED_URL = "https://api.example.com/iocs"
_CONFIDENCE = 0.8


class MyFeedWorker(BaseFeedWorker):
    FEED_NAME = "my_feed"

    def is_configured(self) -> bool:
        return True   # keyless feeds always return True

    async def fetch_and_normalize(
        self,
        session: AsyncSession,
        feed_run_id: str,
    ) -> tuple[int, int, int]:
        response = await self._get(_FEED_URL)
        records: list[dict[str, Any]] = response.json().get("data", [])
        logger.info("MyFeed returned %d records", len(records))

        fetched = new = updated = 0
        for record in records:
            ioc = _map_record(record, feed_run_id)
            if ioc is None:
                continue
            _, is_new = await upsert_ioc(session, ioc)
            fetched += 1
            if is_new:
                new += 1
            else:
                updated += 1

        return fetched, new, updated


def _map_record(record: dict[str, Any], feed_run_id: str) -> Optional[NormalizedIOC]:
    value: str = (record.get("indicator") or "").strip()
    if not value:
        return None

    return NormalizedIOC(
        value=value,
        ioc_type=IOCType.ip,
        raw_confidence=_CONFIDENCE,
        feed_name="my_feed",
        feed_run_id=feed_run_id,
        raw_payload=record,
        metadata={"first_seen": record.get("first_seen")},
    )
```

---

## Reference Adapters

- `backend/app/feeds/abuseipdb.py` — single IOC type, API-key auth, score normalization (0–100 → 0.0–1.0)
- `backend/app/feeds/threatfox.py` — multiple IOC types, type-map dict, POST request, confidence default fallback
- `backend/app/feeds/cisa_kev.py` — keyless feed, CVE type, fixed high confidence, date parsing
