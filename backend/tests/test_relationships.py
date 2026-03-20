"""Integration tests for infer_cooccurrence_relationships."""
import pytest
from sqlalchemy import select

from app.models.ioc import IOCModel
from app.models.relationship import IOCRelationshipModel
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.upsert import infer_cooccurrence_relationships, upsert_ioc


def _make_ioc(value: str, ioc_type: IOCType = IOCType.ip) -> NormalizedIOC:
    return NormalizedIOC(
        value=value,
        ioc_type=ioc_type,
        raw_confidence=0.7,
        feed_name="rel-test",
        raw_payload={},
    )


async def _insert_iocs(session, count: int) -> list:
    """Insert *count* distinct IP IOCs and return their IDs."""
    ids = []
    for i in range(count):
        ioc_id, _ = await upsert_ioc(session, _make_ioc(f"10.0.0.{i}"))
        await session.flush()
        ids.append(ioc_id)
    return ids


async def _count_edges(session) -> int:
    result = await session.execute(select(IOCRelationshipModel))
    return len(result.scalars().all())


async def test_three_iocs_three_edges(async_session):
    ids = await _insert_iocs(async_session, 3)
    n = await infer_cooccurrence_relationships(async_session, ids, inferred_by="test")
    await async_session.flush()

    assert n == 3
    assert await _count_edges(async_session) == 3


async def test_two_iocs_one_edge(async_session):
    ids = await _insert_iocs(async_session, 2)
    n = await infer_cooccurrence_relationships(async_session, ids, inferred_by="test")
    await async_session.flush()

    assert n == 1
    assert await _count_edges(async_session) == 1


async def test_single_ioc_no_edges(async_session):
    ids = await _insert_iocs(async_session, 1)
    n = await infer_cooccurrence_relationships(async_session, ids, inferred_by="test")
    await async_session.flush()

    assert n == 0
    assert await _count_edges(async_session) == 0


async def test_duplicate_edge_no_error(async_session):
    ids = await _insert_iocs(async_session, 2)
    await infer_cooccurrence_relationships(async_session, ids, inferred_by="test")
    await async_session.flush()
    # Second call with same pair — must not raise, must not create duplicate
    await infer_cooccurrence_relationships(async_session, ids, inferred_by="test")
    await async_session.flush()

    assert await _count_edges(async_session) == 1


async def test_edge_attributes(async_session):
    ids = await _insert_iocs(async_session, 2)
    await infer_cooccurrence_relationships(async_session, ids, inferred_by="feed-abc", confidence=0.9)
    await async_session.flush()

    result = await async_session.execute(select(IOCRelationshipModel))
    edge = result.scalar_one()
    assert edge.relationship == "observed_with"
    assert edge.inferred_by == "feed-abc"


async def test_empty_list_no_edges(async_session):
    n = await infer_cooccurrence_relationships(async_session, [], inferred_by="test")
    assert n == 0
    assert await _count_edges(async_session) == 0
