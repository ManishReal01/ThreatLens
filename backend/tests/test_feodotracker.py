"""Tests for the Feodo Tracker feed adapter.

Covers:
  - _map_row() mapping logic (pure unit tests, no DB)
  - is_configured() (always True — no API key required)
  - fetch_and_normalize() via mocked HTTP (integration with upsert using async_session)
  - Feed run lifecycle written by BaseFeedWorker.run()
"""

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config import Settings
from app.feeds.feodotracker import FeodoTrackerWorker, _map_row
from app.normalization.schema import IOCType


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_settings(**overrides: Any) -> Settings:
    base = Settings(database_url="sqlite+aiosqlite:///./test.db")
    for k, v in overrides.items():
        object.__setattr__(base, k, v)
    return base


def _sample_row(**overrides: Any) -> list[str]:
    """Return a CSV row in aggressive-blocklist order:
    [first_seen_utc, dst_ip, dst_port, c2_status, last_online, malware]
    """
    base = ["2024-01-01 00:00:00", "1.2.3.4", "443", "online", "2024-01-02", "Dridex"]
    for k, v in overrides.items():
        idx = {"first_seen": 0, "ip": 1, "port": 2, "status": 3, "last_online": 4, "malware": 5}[k]
        base[idx] = str(v)
    return base


def _csv_body(rows: list[list[str]]) -> str:
    """Build a minimal CSV body with a header row."""
    lines = ['"first_seen_utc","dst_ip","dst_port","c2_status","last_online","malware"']
    for row in rows:
        lines.append(",".join(f'"{v}"' for v in row))
    return "\n".join(lines)


def _mock_csv_response(rows: list[list[str]], status_code: int = 200) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.text = _csv_body(rows)
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# _map_row unit tests
# ---------------------------------------------------------------------------


class TestMapRow:
    def test_maps_ip_and_type(self):
        ioc = _map_row(_sample_row(), "run-001")
        assert ioc is not None
        assert ioc.value == "1.2.3.4"
        assert ioc.ioc_type == IOCType.ip
        assert ioc.feed_name == "feodotracker"
        assert ioc.feed_run_id == "run-001"

    def test_confidence_is_constant(self):
        ioc = _map_row(_sample_row(), "r")
        assert ioc.raw_confidence == 0.85

    def test_metadata_fields_present(self):
        ioc = _map_row(_sample_row(), "r")
        assert ioc.metadata["malware"] == "Dridex"
        assert ioc.metadata["port"] == "443"
        assert ioc.metadata["status"] == "online"

    def test_raw_payload_preserved(self):
        row = _sample_row()
        ioc = _map_row(row, "r")
        assert ioc.raw_payload == {"row": row}

    def test_missing_ip_returns_none(self):
        assert _map_row(["2024-01-01", "", "443", "online", "2024-01-02", "Dridex"], "r") is None
        assert _map_row(["2024-01-01", "   ", "443", "online"], "r") is None

    def test_row_too_short_returns_none(self):
        assert _map_row(["only_one_col"], "r") is None

    def test_optional_fields_stored_when_present(self):
        ioc = _map_row(_sample_row(first_seen="2024-06-01 12:00:00"), "r")
        assert ioc.metadata["first_seen"] == "2024-06-01 12:00:00"

    def test_optional_fields_none_when_absent(self):
        row = ["", "5.6.7.8"]  # only 2 columns
        ioc = _map_row(row, "r")
        assert ioc is not None
        assert ioc.metadata["malware"] is None
        assert ioc.metadata["status"] is None


# ---------------------------------------------------------------------------
# is_configured tests
# ---------------------------------------------------------------------------


class TestIsConfigured:
    def test_always_configured(self):
        worker = FeodoTrackerWorker(_make_settings())
        assert worker.is_configured() is True

    def test_configured_regardless_of_env(self):
        worker = FeodoTrackerWorker(_make_settings(otx_api_key=""))
        assert worker.is_configured() is True


# ---------------------------------------------------------------------------
# fetch_and_normalize integration tests (mocked HTTP, real DB via async_session)
# ---------------------------------------------------------------------------


class TestFetchAndNormalize:
    async def test_returns_correct_counts(self, async_session):
        worker = FeodoTrackerWorker(_make_settings())
        rows = [
            _sample_row(ip="1.1.1.1"),
            _sample_row(ip="2.2.2.2"),
            _sample_row(ip="3.3.3.3"),
        ]
        worker._get = AsyncMock(return_value=_mock_csv_response(rows))
        run_id = str(uuid.uuid4())

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(async_session, run_id)

        assert fetched == 3
        assert new == 3
        assert updated == 0

    async def test_skips_records_with_no_ip(self, async_session):
        worker = FeodoTrackerWorker(_make_settings())
        # rows: 2 with empty IP, 1 valid
        rows = [
            ["2024-01-01", "", "443", "online", "2024-01-02", "Dridex"],
            _sample_row(ip="4.4.4.4"),
        ]
        worker._get = AsyncMock(return_value=_mock_csv_response(rows))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 1
        assert new == 1

    async def test_deduplication_on_second_run(self, async_session):
        worker = FeodoTrackerWorker(_make_settings())
        rows = [_sample_row(ip="5.5.5.5")]
        run_id_1 = str(uuid.uuid4())
        run_id_2 = str(uuid.uuid4())

        worker._get = AsyncMock(return_value=_mock_csv_response(rows))
        async with worker:
            f1, n1, u1 = await worker.fetch_and_normalize(async_session, run_id_1)
        await async_session.flush()

        worker._get = AsyncMock(return_value=_mock_csv_response(rows))
        async with worker:
            f2, n2, u2 = await worker.fetch_and_normalize(async_session, run_id_2)

        assert n1 == 1 and u1 == 0
        assert n2 == 0 and u2 == 1

    async def test_empty_response_returns_zeros(self, async_session):
        worker = FeodoTrackerWorker(_make_settings())
        worker._get = AsyncMock(return_value=_mock_csv_response([]))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 0 and new == 0 and updated == 0


# ---------------------------------------------------------------------------
# run() lifecycle integration test
# ---------------------------------------------------------------------------


class TestRunLifecycle:
    async def test_run_creates_success_feed_run(self, async_session):
        worker = FeodoTrackerWorker(_make_settings())
        worker._get = AsyncMock(return_value=_mock_csv_response([_sample_row()]))

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "success"
        assert feed_run.feed_name == "feodotracker"
        assert feed_run.iocs_fetched == 1
        assert feed_run.iocs_new == 1
        assert feed_run.completed_at is not None

    async def test_run_succeeds_without_api_key(self, async_session):
        """Feodo Tracker requires no API key — run should always proceed."""
        worker = FeodoTrackerWorker(_make_settings())
        worker._get = AsyncMock(return_value=_mock_csv_response([]))

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "success"

    async def test_run_records_error_on_http_failure(self, async_session):
        worker = FeodoTrackerWorker(_make_settings())
        worker._get = AsyncMock(side_effect=Exception("network failure"))

        async with worker:
            with pytest.raises(Exception, match="network failure"):
                await worker.run(async_session)

        from sqlalchemy import select
        from app.models.feed_run import FeedRunModel
        result = await async_session.execute(
            select(FeedRunModel).where(FeedRunModel.feed_name == "feodotracker")
        )
        run = result.scalar_one()
        assert run.status == "error"
        assert "network failure" in run.error_msg
