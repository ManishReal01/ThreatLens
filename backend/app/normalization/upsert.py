"""Upsert logic for IOCs with ioc_sources logging and co-occurrence inference.

PostgreSQL path uses INSERT ... ON CONFLICT DO UPDATE / ON CONFLICT DO NOTHING.
SQLite path (used in tests) uses SELECT-then-INSERT/UPDATE within the same transaction.
"""
import uuid
from datetime import datetime, timezone
from itertools import combinations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ioc import IOCModel
from app.models.ioc_source import IOCSourceModel
from app.models.relationship import IOCRelationshipModel
from app.normalization.canonicalize import canonicalize_ioc
from app.normalization.schema import IOCType, NormalizedIOC
from app.normalization.scoring import CURRENT_SCORE_VERSION, compute_severity


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dialect_name(session: AsyncSession) -> str:
    """Return the dialect name for the session's bound engine."""
    try:
        # Works for sessions created via async_sessionmaker(bind=engine)
        bind = session.bind
        if bind is not None:
            return bind.dialect.name
    except Exception:
        pass
    try:
        return session.sync_session.bind.dialect.name  # type: ignore[union-attr]
    except Exception:
        return "unknown"


async def upsert_ioc(
    session: AsyncSession,
    ioc: NormalizedIOC,
) -> tuple[str, bool]:
    """Upsert an IOC row and always create an ioc_sources row.

    Returns (ioc_id: str, is_new: bool).
    """
    canonical_value = canonicalize_ioc(ioc.value, ioc.ioc_type)
    dialect = _dialect_name(session)

    if dialect == "postgresql":
        ioc_id, is_new = await _upsert_postgresql(session, ioc, canonical_value)
    else:
        ioc_id, is_new = await _upsert_sqlite(session, ioc, canonical_value)

    # Always create an ioc_sources row
    source_row = IOCSourceModel(
        id=uuid.uuid4(),
        ioc_id=uuid.UUID(ioc_id),
        feed_name=ioc.feed_name,
        raw_score=ioc.raw_confidence,
        raw_payload=ioc.raw_payload,
        feed_run_id=uuid.UUID(ioc.feed_run_id) if ioc.feed_run_id else None,
    )
    session.add(source_row)

    return ioc_id, is_new


async def _upsert_postgresql(
    session: AsyncSession,
    ioc: NormalizedIOC,
    canonical_value: str,
) -> tuple[str, bool]:
    from sqlalchemy import func, literal_column
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    severity = compute_severity(ioc.raw_confidence, source_count=1, age_days=0)

    stmt = (
        pg_insert(IOCModel)
        .values(
            id=uuid.uuid4(),
            value=canonical_value,
            type=ioc.ioc_type.value,
            severity=severity.score,
            score_version=CURRENT_SCORE_VERSION,
            score_explanation=severity.explanation,
            first_seen=_utcnow(),
            last_seen=_utcnow(),
            source_count=1,
            is_active=True,
            metadata_=ioc.metadata,
        )
        .on_conflict_do_update(
            constraint="uq_iocs_value_type",
            set_={
                "last_seen": func.now(),
                "source_count": IOCModel.source_count + 1,
                "severity": severity.score,
                "score_version": CURRENT_SCORE_VERSION,
                "score_explanation": severity.explanation,
                "is_active": True,
                "retired_at": None,
            },
        )
        .returning(IOCModel.id, literal_column("xmax = 0").label("is_new"))
    )

    result = await session.execute(stmt)
    row = result.one()
    ioc_id = str(row[0])
    is_new: bool = bool(row[1])
    return ioc_id, is_new


async def _upsert_sqlite(
    session: AsyncSession,
    ioc: NormalizedIOC,
    canonical_value: str,
) -> tuple[str, bool]:
    """SQLite-compatible SELECT-then-INSERT/UPDATE upsert."""
    result = await session.execute(
        select(IOCModel).where(
            IOCModel.value == canonical_value,
            IOCModel.type == ioc.ioc_type.value,
        )
    )
    existing = result.scalar_one_or_none()

    if existing is None:
        severity = compute_severity(ioc.raw_confidence, source_count=1, age_days=0)
        new_row = IOCModel(
            id=uuid.uuid4(),
            value=canonical_value,
            type=ioc.ioc_type.value,
            severity=severity.score,
            score_version=CURRENT_SCORE_VERSION,
            score_explanation=severity.explanation,
            first_seen=_utcnow(),
            last_seen=_utcnow(),
            source_count=1,
            is_active=True,
            metadata_=ioc.metadata,
        )
        session.add(new_row)
        return str(new_row.id), True
    else:
        new_source_count = existing.source_count + 1
        # Compute age from first_seen
        first_seen = existing.first_seen
        if first_seen.tzinfo is None:
            first_seen = first_seen.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - first_seen).total_seconds() / 86400
        severity = compute_severity(
            ioc.raw_confidence, source_count=new_source_count, age_days=age_days
        )
        existing.last_seen = _utcnow()
        existing.source_count = new_source_count
        existing.severity = severity.score
        existing.score_version = CURRENT_SCORE_VERSION
        existing.score_explanation = severity.explanation
        existing.is_active = True
        existing.retired_at = None
        return str(existing.id), False


async def infer_cooccurrence_relationships(
    session: AsyncSession,
    ioc_ids: list[str],
    inferred_by: str,
    confidence: float = 0.7,
) -> int:
    """Create co-occurrence edges for all pairs in *ioc_ids*.

    Returns the number of new edges inserted (conflicts excluded).
    """
    dialect = _dialect_name(session)
    inserted = 0

    for source_id, target_id in combinations(ioc_ids, 2):
        if dialect == "postgresql":
            count = await _insert_edge_postgresql(
                session, source_id, target_id, inferred_by, confidence
            )
        else:
            count = await _insert_edge_sqlite(
                session, source_id, target_id, inferred_by, confidence
            )
        inserted += count

    return inserted


async def _insert_edge_postgresql(
    session: AsyncSession,
    source_id: str,
    target_id: str,
    inferred_by: str,
    confidence: float,
) -> int:
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = (
        pg_insert(IOCRelationshipModel)
        .values(
            id=uuid.uuid4(),
            source_ioc=uuid.UUID(source_id),
            target_ioc=uuid.UUID(target_id),
            relationship="observed_with",
            confidence=confidence,
            inferred_by=inferred_by,
        )
        .on_conflict_do_nothing(constraint="uq_ioc_relationship")
    )
    result = await session.execute(stmt)
    return result.rowcount if result.rowcount >= 0 else 0


async def _insert_edge_sqlite(
    session: AsyncSession,
    source_id: str,
    target_id: str,
    inferred_by: str,
    confidence: float,
) -> int:
    """SQLite fallback — check existence before insert."""
    existing = await session.execute(
        select(IOCRelationshipModel).where(
            IOCRelationshipModel.source_ioc == uuid.UUID(source_id),
            IOCRelationshipModel.target_ioc == uuid.UUID(target_id),
            IOCRelationshipModel.relationship == "observed_with",
        )
    )
    if existing.scalar_one_or_none() is not None:
        return 0

    edge = IOCRelationshipModel(
        id=uuid.uuid4(),
        source_ioc=uuid.UUID(source_id),
        target_ioc=uuid.UUID(target_id),
        relationship="observed_with",
        confidence=confidence,
        inferred_by=inferred_by,
    )
    session.add(edge)
    return 1
