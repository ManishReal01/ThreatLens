"""Tests for the AbuseIPDB feed adapter.

Covers:
  - _map_record() mapping logic (pure unit tests, no DB)
  - is_configured() with and without API key
  - fetch_and_normalize() via mocked HTTP (integration with upsert using async_session)
  - Feed run lifecycle written by BaseFeedWorker.run()
"""

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config import Settings
from app.feeds.abuseipdb import AbuseIPDBWorker, _map_record
from app.normalization.schema import IOCType


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_settings(**overrides: Any) -> Settings:
    """Return a Settings instance with test defaults."""
    base = Settings(
        database_url="sqlite+aiosqlite:///./test.db",
        abuseipdb_api_key="test-key-123",
        abuseipdb_days_back=1,
    )
    for k, v in overrides.items():
        object.__setattr__(base, k, v)
    return base


def _sample_record(**overrides: Any) -> dict:
    base = {
        "ipAddress": "1.2.3.4",
        "abuseConfidenceScore": 100,
        "countryCode": "CN",
        "usageType": "Data Center/Web Hosting/Transit",
        "isp": "Some ISP",
        "domain": "example.com",
        "totalReports": 10,
        "numDistinctUsers": 5,
        "lastReportedAt": "2024-01-01T00:00:00+00:00",
    }
    base.update(overrides)
    return base


def _mock_response(data: Any, status_code: int = 200) -> MagicMock:
    """Build a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = data
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# _map_record unit tests
# ---------------------------------------------------------------------------


class TestMapRecord:
    def test_maps_ip_and_confidence(self):
        rec = _sample_record()
        ioc = _map_record(rec, "run-001")
        assert ioc is not None
        assert ioc.value == "1.2.3.4"
        assert ioc.ioc_type == IOCType.ip
        assert ioc.raw_confidence == 1.0
        assert ioc.feed_name == "abuseipdb"
        assert ioc.feed_run_id == "run-001"  # _map_record stores whatever string is passed

    def test_confidence_normalization(self):
        assert _map_record(_sample_record(abuseConfidenceScore=100), "r").raw_confidence == 1.0
        assert _map_record(_sample_record(abuseConfidenceScore=50), "r").raw_confidence == 0.5
        assert _map_record(_sample_record(abuseConfidenceScore=0), "r").raw_confidence == 0.0
        assert _map_record(_sample_record(abuseConfidenceScore=25), "r").raw_confidence == 0.25

    def test_metadata_fields_present(self):
        ioc = _map_record(_sample_record(), "r")
        assert ioc.metadata["country_code"] == "CN"
        assert ioc.metadata["isp"] == "Some ISP"
        assert ioc.metadata["domain"] == "example.com"
        assert ioc.metadata["total_reports"] == 10
        assert ioc.metadata["num_distinct_users"] == 5

    def test_raw_payload_preserved(self):
        rec = _sample_record()
        ioc = _map_record(rec, "r")
        assert ioc.raw_payload == rec

    def test_missing_ip_returns_none(self):
        assert _map_record({"abuseConfidenceScore": 100}, "r") is None
        assert _map_record({"ipAddress": "", "abuseConfidenceScore": 100}, "r") is None
        assert _map_record({"ipAddress": "   ", "abuseConfidenceScore": 100}, "r") is None

    def test_confidence_clamped_below_zero(self):
        ioc = _map_record(_sample_record(abuseConfidenceScore=-5), "r")
        assert ioc.raw_confidence == 0.0

    def test_confidence_clamped_above_100(self):
        ioc = _map_record(_sample_record(abuseConfidenceScore=200), "r")
        assert ioc.raw_confidence == 1.0


# ---------------------------------------------------------------------------
# is_configured tests
# ---------------------------------------------------------------------------


class TestIsConfigured:
    def test_configured_with_key(self):
        worker = AbuseIPDBWorker(_make_settings(abuseipdb_api_key="abc"))
        assert worker.is_configured() is True

    def test_not_configured_without_key(self):
        worker = AbuseIPDBWorker(_make_settings(abuseipdb_api_key=""))
        assert worker.is_configured() is False


# ---------------------------------------------------------------------------
# fetch_and_normalize integration tests (mocked HTTP, real DB via async_session)
# ---------------------------------------------------------------------------


class TestFetchAndNormalize:
    async def test_returns_correct_counts(self, async_session):
        """fetch_and_normalize upserts all returned records and counts correctly."""
        settings = _make_settings()
        worker = AbuseIPDBWorker(settings)

        api_data = {
            "data": [
                _sample_record(ipAddress="1.1.1.1", abuseConfidenceScore=90),
                _sample_record(ipAddress="2.2.2.2", abuseConfidenceScore=50),
                _sample_record(ipAddress="3.3.3.3", abuseConfidenceScore=30),
            ]
        }
        worker._get = AsyncMock(return_value=_mock_response(api_data))
        run_id = str(uuid.uuid4())

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(async_session, run_id)

        assert fetched == 3
        assert new == 3
        assert updated == 0

    async def test_skips_records_with_no_ip(self, async_session):
        settings = _make_settings()
        worker = AbuseIPDBWorker(settings)

        api_data = {
            "data": [
                {"ipAddress": "", "abuseConfidenceScore": 100},
                {"abuseConfidenceScore": 100},
                _sample_record(ipAddress="4.4.4.4", abuseConfidenceScore=80),
            ]
        }
        worker._get = AsyncMock(return_value=_mock_response(api_data))
        run_id = str(uuid.uuid4())

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(async_session, run_id)

        assert fetched == 1  # only the valid one
        assert new == 1

    async def test_deduplication_on_second_run(self, async_session):
        """Upserting the same IP twice updates rather than creating a new row."""
        settings = _make_settings()
        worker = AbuseIPDBWorker(settings)

        record = _sample_record(ipAddress="5.5.5.5", abuseConfidenceScore=75)
        api_data = {"data": [record]}
        run_id_1 = str(uuid.uuid4())
        run_id_2 = str(uuid.uuid4())

        worker._get = AsyncMock(return_value=_mock_response(api_data))
        async with worker:
            f1, n1, u1 = await worker.fetch_and_normalize(async_session, run_id_1)
        await async_session.flush()

        worker._get = AsyncMock(return_value=_mock_response(api_data))
        async with worker:
            f2, n2, u2 = await worker.fetch_and_normalize(async_session, run_id_2)

        assert n1 == 1 and u1 == 0
        assert n2 == 0 and u2 == 1

    async def test_empty_response_returns_zeros(self, async_session):
        settings = _make_settings()
        worker = AbuseIPDBWorker(settings)
        worker._get = AsyncMock(return_value=_mock_response({"data": []}))

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
        """run() creates a FeedRunModel with status='success' on a clean run."""
        settings = _make_settings()
        worker = AbuseIPDBWorker(settings)
        worker._get = AsyncMock(return_value=_mock_response({"data": [_sample_record()]}))

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "success"
        assert feed_run.feed_name == "abuseipdb"
        assert feed_run.iocs_fetched == 1
        assert feed_run.iocs_new == 1
        assert feed_run.completed_at is not None

    async def test_run_skips_when_not_configured(self, async_session):
        """run() writes an error feed_run when the API key is missing."""
        settings = _make_settings(abuseipdb_api_key="")
        worker = AbuseIPDBWorker(settings)

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "error"
        assert "not configured" in feed_run.error_msg

    async def test_run_records_error_on_http_failure(self, async_session):
        """run() writes an error feed_run when the HTTP request raises."""
        settings = _make_settings()
        worker = AbuseIPDBWorker(settings)
        worker._get = AsyncMock(side_effect=Exception("network failure"))

        async with worker:
            with pytest.raises(Exception, match="network failure"):
                await worker.run(async_session)

        # Feed run should still be committed with error status
        from sqlalchemy import select
        from app.models.feed_run import FeedRunModel
        result = await async_session.execute(
            select(FeedRunModel).where(FeedRunModel.feed_name == "abuseipdb")
        )
        run = result.scalar_one()
        assert run.status == "error"
        assert "network failure" in run.error_msg
