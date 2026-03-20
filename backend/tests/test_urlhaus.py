"""Tests for the URLhaus feed adapter.

Covers:
  - _map_record() mapping logic (pure unit tests, no DB)
  - is_configured() — always True (no API key needed)
  - _status_to_confidence() mapping
  - fetch_and_normalize() with mocked HTTP (integration with upsert)
  - Error status from URLhaus API raises RuntimeError
"""

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config import Settings
from app.feeds.urlhaus import URLhausWorker, _map_record, _status_to_confidence
from app.normalization.schema import IOCType


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_settings(**overrides: Any) -> Settings:
    base = Settings(database_url="sqlite+aiosqlite:///./test.db")
    for k, v in overrides.items():
        object.__setattr__(base, k, v)
    return base


def _sample_record(**overrides: Any) -> dict:
    base = {
        "id": "1234567",
        "urlhaus_reference": "https://urlhaus.abuse.ch/url/1234567/",
        "url": "http://malicious.example.com/payload.exe",
        "url_status": "online",
        "host": "malicious.example.com",
        "date_added": "2024-01-01 00:00:00 UTC",
        "threat": "malware_download",
        "blacklists": {},
        "reporter": "anonymous",
        "larted": False,
        "tags": ["Emotet", "EK"],
    }
    base.update(overrides)
    return base


def _mock_response(data: Any, status_code: int = 200) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = data
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# _status_to_confidence unit tests
# ---------------------------------------------------------------------------


class TestStatusToConfidence:
    def test_online(self):
        assert _status_to_confidence("online") == 0.9

    def test_offline(self):
        assert _status_to_confidence("offline") == 0.6

    def test_unknown_defaults_to_half(self):
        assert _status_to_confidence("unknown") == 0.5
        assert _status_to_confidence("") == 0.5
        assert _status_to_confidence("other") == 0.5

    def test_case_insensitive(self):
        assert _status_to_confidence("ONLINE") == 0.9
        assert _status_to_confidence("Offline") == 0.6


# ---------------------------------------------------------------------------
# _map_record unit tests
# ---------------------------------------------------------------------------


class TestMapRecord:
    def test_maps_url_ioc(self):
        rec = _sample_record()
        ioc = _map_record(rec, "run-001")
        assert ioc is not None
        assert ioc.value == "http://malicious.example.com/payload.exe"
        assert ioc.ioc_type == IOCType.url
        assert ioc.raw_confidence == 0.9
        assert ioc.feed_name == "urlhaus"
        assert ioc.feed_run_id == "run-001"

    def test_offline_url_lower_confidence(self):
        ioc = _map_record(_sample_record(url_status="offline"), "r")
        assert ioc.raw_confidence == 0.6

    def test_unknown_status_default_confidence(self):
        ioc = _map_record(_sample_record(url_status=""), "r")
        assert ioc.raw_confidence == 0.5

    def test_metadata_fields(self):
        ioc = _map_record(_sample_record(), "r")
        assert ioc.metadata["url_status"] == "online"
        assert ioc.metadata["host"] == "malicious.example.com"
        assert ioc.metadata["threat"] == "malware_download"
        assert ioc.metadata["tags"] == ["Emotet", "EK"]
        assert "urlhaus_reference" in ioc.metadata

    def test_raw_payload_preserved(self):
        rec = _sample_record()
        ioc = _map_record(rec, "r")
        assert ioc.raw_payload == rec

    def test_missing_url_returns_none(self):
        assert _map_record({"url_status": "online"}, "r") is None
        assert _map_record({"url": "", "url_status": "online"}, "r") is None
        assert _map_record({"url": "   ", "url_status": "online"}, "r") is None

    def test_null_tags_normalized_to_empty_list(self):
        ioc = _map_record(_sample_record(tags=None), "r")
        assert ioc.metadata["tags"] == []

    def test_non_list_tags_normalized_to_empty_list(self):
        # Defensive: some API responses may return a string
        ioc = _map_record(_sample_record(tags="Emotet"), "r")
        assert ioc.metadata["tags"] == []


# ---------------------------------------------------------------------------
# is_configured tests
# ---------------------------------------------------------------------------


class TestIsConfigured:
    def test_always_configured(self):
        worker = URLhausWorker(_make_settings())
        assert worker.is_configured() is True


# ---------------------------------------------------------------------------
# fetch_and_normalize integration tests (mocked HTTP, real DB)
# ---------------------------------------------------------------------------


class TestFetchAndNormalize:
    async def test_returns_correct_counts(self, async_session):
        worker = URLhausWorker(_make_settings())
        api_data = {
            "query_status": "ok",
            "urls": [
                _sample_record(url="http://a.example.com/x"),
                _sample_record(url="http://b.example.com/y", url_status="offline"),
                _sample_record(url="http://c.example.com/z", url_status="unknown"),
            ],
        }
        worker._post = AsyncMock(return_value=_mock_response(api_data))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 3
        assert new == 3
        assert updated == 0

    async def test_error_status_raises(self, async_session):
        worker = URLhausWorker(_make_settings())
        worker._post = AsyncMock(
            return_value=_mock_response({"query_status": "error", "urls": []})
        )

        async with worker:
            with pytest.raises(RuntimeError, match="unexpected query_status"):
                await worker.fetch_and_normalize(async_session, str(uuid.uuid4()))

    async def test_skips_records_without_url(self, async_session):
        worker = URLhausWorker(_make_settings())
        api_data = {
            "query_status": "ok",
            "urls": [
                {"url": "", "url_status": "online"},
                {"url_status": "online"},
                _sample_record(url="http://valid.example.com/file"),
            ],
        }
        worker._post = AsyncMock(return_value=_mock_response(api_data))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 1

    async def test_deduplication(self, async_session):
        worker = URLhausWorker(_make_settings())
        record = _sample_record(url="http://dedup.example.com/test")
        api_data = {"query_status": "ok", "urls": [record]}
        run_id_1 = str(uuid.uuid4())
        run_id_2 = str(uuid.uuid4())

        worker._post = AsyncMock(return_value=_mock_response(api_data))
        async with worker:
            _, n1, u1 = await worker.fetch_and_normalize(async_session, run_id_1)
        await async_session.flush()

        worker._post = AsyncMock(return_value=_mock_response(api_data))
        async with worker:
            _, n2, u2 = await worker.fetch_and_normalize(async_session, run_id_2)

        assert n1 == 1 and u1 == 0
        assert n2 == 0 and u2 == 1

    async def test_empty_response(self, async_session):
        worker = URLhausWorker(_make_settings())
        worker._post = AsyncMock(
            return_value=_mock_response({"query_status": "ok", "urls": []})
        )

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 0 and new == 0 and updated == 0


# ---------------------------------------------------------------------------
# run() lifecycle tests
# ---------------------------------------------------------------------------


class TestRunLifecycle:
    async def test_run_always_configured(self, async_session):
        """URLhaus has no API key so run() should never produce 'not configured'."""
        worker = URLhausWorker(_make_settings())
        worker._post = AsyncMock(
            return_value=_mock_response(
                {"query_status": "ok", "urls": [_sample_record()]}
            )
        )

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "success"
        assert feed_run.feed_name == "urlhaus"
        assert feed_run.iocs_fetched == 1

    async def test_run_records_error_on_api_failure(self, async_session):
        worker = URLhausWorker(_make_settings())
        worker._post = AsyncMock(side_effect=Exception("connection refused"))

        async with worker:
            with pytest.raises(Exception, match="connection refused"):
                await worker.run(async_session)

        from sqlalchemy import select
        from app.models.feed_run import FeedRunModel

        result = await async_session.execute(
            select(FeedRunModel).where(FeedRunModel.feed_name == "urlhaus")
        )
        run = result.scalar_one()
        assert run.status == "error"
        assert "connection refused" in run.error_msg
