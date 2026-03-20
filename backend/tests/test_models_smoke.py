"""Smoke tests: verify ORM models can be inserted and queried via async SQLite.

These tests confirm:
  - IOCModel: insert + retrieve (test_create_ioc)
  - FeedRunModel: insert + retrieve (test_create_feed_run)
  - IOCSourceModel: FK relationship to IOCModel (test_ioc_source_fk)

Run: pytest tests/test_models_smoke.py -x -v
All 3 tests must pass before moving to Plan 01-02.
"""
import uuid
from datetime import datetime, timezone

from app.models import FeedRunModel, IOCModel, IOCSourceModel


async def test_create_ioc(async_session):
    """Verify IOCModel can be inserted and queried."""
    ioc = IOCModel(
        id=uuid.uuid4(),
        value="192.168.1.1",
        type="ip",
        source_count=1,
        is_active=True,
        first_seen=datetime.now(timezone.utc),
        last_seen=datetime.now(timezone.utc),
    )
    async_session.add(ioc)
    await async_session.commit()
    result = await async_session.get(IOCModel, ioc.id)
    assert result is not None
    assert result.value == "192.168.1.1"
    assert result.type == "ip"


async def test_create_feed_run(async_session):
    """Verify FeedRunModel can be inserted."""
    run = FeedRunModel(
        id=uuid.uuid4(),
        feed_name="abuseipdb",
        status="running",
    )
    async_session.add(run)
    await async_session.commit()
    result = await async_session.get(FeedRunModel, run.id)
    assert result is not None
    assert result.feed_name == "abuseipdb"


async def test_ioc_source_fk(async_session):
    """Verify IOCSourceModel links to IOCModel via FK."""
    ioc = IOCModel(
        id=uuid.uuid4(),
        value="example.com",
        type="domain",
        source_count=1,
        is_active=True,
        first_seen=datetime.now(timezone.utc),
        last_seen=datetime.now(timezone.utc),
    )
    async_session.add(ioc)
    await async_session.flush()

    source = IOCSourceModel(
        id=uuid.uuid4(),
        ioc_id=ioc.id,
        feed_name="urlhaus",
    )
    async_session.add(source)
    await async_session.commit()
    result = await async_session.get(IOCSourceModel, source.id)
    assert result is not None
    assert result.ioc_id == ioc.id
