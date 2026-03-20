"""Integration tests for upsert_ioc — dedup, ioc_sources logging, severity storage."""
import asyncio
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.ioc import IOCModel
from app.models.ioc_source import IOCSourceModel
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import upsert_ioc


def _make_ioc(**overrides) -> NormalizedIOC:
    base = {
        "value": "192.168.1.1",
        "ioc_type": IOCType.ip,
        "raw_confidence": 0.8,
        "feed_name": "test-feed",
        "raw_payload": {"source": "test"},
    }
    base.update(overrides)
    return NormalizedIOC(**base)


async def _count(session, model) -> int:
    result = await session.execute(select(model))
    return len(result.scalars().all())


async def _fetch_ioc(session, value: str, ioc_type: IOCType) -> IOCModel:
    result = await session.execute(
        select(IOCModel).where(IOCModel.value == value, IOCModel.type == ioc_type.value)
    )
    return result.scalar_one()


async def test_first_insert_creates_new_ioc(async_session):
    ioc_id, is_new = await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()

    assert is_new is True
    row = await _fetch_ioc(async_session, "192.168.1.1", IOCType.ip)
    assert str(row.id) == ioc_id


async def test_duplicate_upsert_updates_not_duplicates(async_session):
    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()
    _, is_new = await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()

    assert is_new is False
    result = await async_session.execute(
        select(IOCModel).where(IOCModel.value == "192.168.1.1", IOCModel.type == "ip")
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].source_count == 2


async def test_source_always_inserted(async_session):
    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()
    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()

    count = await _count(async_session, IOCSourceModel)
    assert count == 2


async def test_severity_stored(async_session):
    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()

    row = await _fetch_ioc(async_session, "192.168.1.1", IOCType.ip)
    assert row.severity is not None
    assert row.score_explanation is not None


async def test_different_types_separate_rows(async_session):
    await upsert_ioc(async_session, _make_ioc(value="abc123", ioc_type=IOCType.hash_md5))
    await async_session.flush()
    await upsert_ioc(async_session, _make_ioc(value="abc123", ioc_type=IOCType.hash_sha1))
    await async_session.flush()

    count = await _count(async_session, IOCModel)
    assert count == 2


async def test_last_seen_updated(async_session):
    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()
    row1 = await _fetch_ioc(async_session, "192.168.1.1", IOCType.ip)
    first_seen_ts = row1.last_seen

    # Small pause to guarantee a later timestamp
    await asyncio.sleep(0.01)

    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()

    # Expire cached state so SQLAlchemy re-reads from DB
    async_session.expire_all()
    row2 = await _fetch_ioc(async_session, "192.168.1.1", IOCType.ip)
    assert row2.last_seen > first_seen_ts


async def test_source_count_increments(async_session):
    for _ in range(3):
        await upsert_ioc(async_session, _make_ioc())
        await async_session.flush()

    row = await _fetch_ioc(async_session, "192.168.1.1", IOCType.ip)
    assert row.source_count == 3


async def test_score_explanation_has_keys(async_session):
    await upsert_ioc(async_session, _make_ioc())
    await async_session.flush()

    row = await _fetch_ioc(async_session, "192.168.1.1", IOCType.ip)
    expl = row.score_explanation
    assert "confidence_component" in expl
    assert "source_count_component" in expl
    assert "recency_component" in expl
    assert "score_version" in expl
