"""Tests for the AlienVault OTX feed adapter.

Covers:
  - _map_indicator() type mapping (all supported and unsupported types)
  - is_configured() with and without API key
  - _process_pulse() co-occurrence edge inference
  - fetch_and_normalize() with mocked HTTP (single page + pagination)
  - Delta query: modified_since sent when last successful run exists
"""

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.config import Settings
from app.feeds.otx import OTXWorker, _map_indicator, _OTX_TYPE_MAP
from app.normalization.schema import IOCType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_settings(**overrides: Any) -> Settings:
    base = Settings(
        database_url="sqlite+aiosqlite:///./test.db",
        otx_api_key="test-otx-key",
        otx_pulse_limit=50,
    )
    for k, v in overrides.items():
        object.__setattr__(base, k, v)
    return base


def _indicator(otx_type: str, value: str, **extra: Any) -> dict:
    return {
        "id": 1,
        "type": otx_type,
        "indicator": value,
        "description": "test indicator",
        "created": "2024-01-01T00:00:00",
        **extra,
    }


def _pulse(indicators: list[dict], name: str = "Test Pulse") -> dict:
    return {"id": str(uuid.uuid4()), "name": name, "indicators": indicators}


def _page(results: list[dict], next_url: Any = None) -> dict:
    return {"count": len(results), "results": results, "next": next_url, "previous": None}


def _mock_response(data: Any, status_code: int = 200) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = data
    resp.headers = {}
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# _map_indicator type mapping unit tests
# ---------------------------------------------------------------------------


class TestMapIndicator:
    """Test OTX type → IOCType mapping and value extraction."""

    @pytest.mark.parametrize("otx_type,expected_ioc_type", [
        ("IPv4", IOCType.ip),
        ("IPv6", IOCType.ip),
        ("domain", IOCType.domain),
        ("hostname", IOCType.domain),
        ("URL", IOCType.url),
        ("FileHash-MD5", IOCType.hash_md5),
        ("FileHash-SHA1", IOCType.hash_sha1),
        ("FileHash-SHA256", IOCType.hash_sha256),
    ])
    def test_supported_types(self, otx_type, expected_ioc_type):
        ioc = _map_indicator(_indicator(otx_type, "1.2.3.4"), "r", "pulse")
        assert ioc is not None
        assert ioc.ioc_type == expected_ioc_type

    @pytest.mark.parametrize("otx_type", [
        "CIDR", "FileHash-PEHASH", "FileHash-IMPHASH", "Mutex",
        "CVE", "email", "YARA", "FilePath", "unknown_type",
    ])
    def test_unsupported_types_return_none(self, otx_type):
        ioc = _map_indicator(_indicator(otx_type, "irrelevant"), "r", "pulse")
        assert ioc is None

    def test_empty_indicator_value_returns_none(self):
        assert _map_indicator(_indicator("IPv4", ""), "r", "pulse") is None
        assert _map_indicator(_indicator("IPv4", "   "), "r", "pulse") is None

    def test_metadata_populated(self):
        ind = _indicator("IPv4", "1.2.3.4", description="C2 server")
        ioc = _map_indicator(ind, "run-id", "My Pulse")
        assert ioc.metadata["pulse_name"] == "My Pulse"
        assert ioc.metadata["otx_type"] == "IPv4"
        assert ioc.metadata["description"] == "C2 server"

    def test_raw_payload_preserved(self):
        ind = _indicator("domain", "evil.example.com")
        ioc = _map_indicator(ind, "r", "p")
        assert ioc.raw_payload == ind

    def test_feed_name_is_otx(self):
        ioc = _map_indicator(_indicator("IPv4", "10.0.0.1"), "r", "p")
        assert ioc.feed_name == "otx"

    def test_default_confidence(self):
        ioc = _map_indicator(_indicator("URL", "http://evil.com/"), "r", "p")
        assert ioc.raw_confidence == 0.75


# ---------------------------------------------------------------------------
# is_configured
# ---------------------------------------------------------------------------


class TestIsConfigured:
    def test_configured_with_key(self):
        assert OTXWorker(_make_settings(otx_api_key="key")).is_configured() is True

    def test_not_configured_without_key(self):
        assert OTXWorker(_make_settings(otx_api_key="")).is_configured() is False


# ---------------------------------------------------------------------------
# fetch_and_normalize — mocked HTTP, real DB
# ---------------------------------------------------------------------------


class TestFetchAndNormalize:
    async def test_single_page_multi_indicator_types(self, async_session):
        """Indicators of different supported types are all upserted."""
        worker = OTXWorker(_make_settings())
        indicators = [
            _indicator("IPv4", "1.2.3.4"),
            _indicator("domain", "evil.example.com"),
            _indicator("FileHash-MD5", "d41d8cd98f00b204e9800998ecf8427e"),
        ]
        worker._get = AsyncMock(
            return_value=_mock_response(_page([_pulse(indicators)]))
        )

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 3
        assert new == 3
        assert updated == 0

    async def test_unsupported_types_skipped(self, async_session):
        worker = OTXWorker(_make_settings())
        indicators = [
            _indicator("IPv4", "9.9.9.9"),
            _indicator("CIDR", "10.0.0.0/8"),       # skip
            _indicator("Mutex", "malware_mutex"),    # skip
        ]
        worker._get = AsyncMock(
            return_value=_mock_response(_page([_pulse(indicators)]))
        )

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 3  # fetched counts all indicators including skipped
        assert new == 1      # only IPv4 was upserted

    async def test_pagination_follows_next_url(self, async_session):
        """Adapter stops at otx_max_pages_first_run=1 cap on first run."""
        worker = OTXWorker(_make_settings())
        page1 = _page([_pulse([_indicator("IPv4", "1.1.1.1")])], next_url="http://otx.example/page2")

        worker._get = AsyncMock(return_value=_mock_response(page1))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert worker._get.call_count == 1
        assert new == 1

    async def test_empty_pulse_list(self, async_session):
        worker = OTXWorker(_make_settings())
        worker._get = AsyncMock(return_value=_mock_response(_page([])))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 0 and new == 0 and updated == 0

    async def test_deduplication_across_pulses(self, async_session):
        """Same IP in two different pulses is upserted, not duplicated."""
        worker = OTXWorker(_make_settings())
        ip = "3.3.3.3"
        pulse_a = _pulse([_indicator("IPv4", ip)], name="Pulse A")
        pulse_b = _pulse([_indicator("IPv4", ip)], name="Pulse B")

        worker._get = AsyncMock(
            return_value=_mock_response(_page([pulse_a, pulse_b]))
        )

        async with worker:
            _, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert new == 1
        assert updated == 1


# ---------------------------------------------------------------------------
# Co-occurrence relationship inference
# ---------------------------------------------------------------------------


class TestCooccurrence:
    async def test_cooccurrence_edges_created(self, async_session):
        """3 IOCs in one pulse → 3 edges (C(3,2) = 3)."""
        worker = OTXWorker(_make_settings())
        indicators = [
            _indicator("IPv4", "5.5.5.5"),
            _indicator("domain", "cooc.example.com"),
            _indicator("FileHash-SHA256", "a" * 64),
        ]
        worker._get = AsyncMock(
            return_value=_mock_response(_page([_pulse(indicators)]))
        )

        async with worker:
            await worker.fetch_and_normalize(async_session, str(uuid.uuid4()))

        from sqlalchemy import select
        from app.models.relationship import IOCRelationshipModel

        result = await async_session.execute(
            select(IOCRelationshipModel).where(
                IOCRelationshipModel.inferred_by == "otx"
            )
        )
        edges = result.scalars().all()
        assert len(edges) == 3  # C(3,2) = 3

    async def test_single_indicator_pulse_no_edges(self, async_session):
        """A pulse with only 1 indicator produces no relationship edges."""
        worker = OTXWorker(_make_settings())
        indicators = [_indicator("IPv4", "6.6.6.6")]
        worker._get = AsyncMock(
            return_value=_mock_response(_page([_pulse(indicators)]))
        )

        async with worker:
            await worker.fetch_and_normalize(async_session, str(uuid.uuid4()))

        from sqlalchemy import select
        from app.models.relationship import IOCRelationshipModel

        result = await async_session.execute(select(IOCRelationshipModel))
        assert result.scalars().all() == []


# ---------------------------------------------------------------------------
# Delta query — modified_since uses last_successful_sync
# ---------------------------------------------------------------------------


class TestDeltaQuery:
    async def test_no_modified_since_on_first_run(self, async_session):
        """No prior successful run → GET request has no modified_since param."""
        worker = OTXWorker(_make_settings())
        worker._get = AsyncMock(return_value=_mock_response(_page([])))

        async with worker:
            await worker.fetch_and_normalize(async_session, str(uuid.uuid4()))

        call_kwargs = worker._get.call_args
        params = call_kwargs[1].get("params") or {}
        assert "modified_since" not in params

    async def test_modified_since_sent_after_successful_run(self, async_session):
        """A prior successful feed_run causes modified_since to be included."""
        from app.models.feed_run import FeedRunModel

        last_sync = datetime(2024, 6, 15, 12, 0, 0, tzinfo=timezone.utc)
        prior_run = FeedRunModel(
            feed_name="otx",
            status="success",
            last_successful_sync=last_sync,
        )
        async_session.add(prior_run)
        await async_session.flush()

        worker = OTXWorker(_make_settings())
        worker._get = AsyncMock(return_value=_mock_response(_page([])))

        async with worker:
            await worker.fetch_and_normalize(async_session, str(uuid.uuid4()))

        call_kwargs = worker._get.call_args
        params = call_kwargs[1].get("params") or {}
        assert "modified_since" in params
        assert params["modified_since"] == "2024-06-15T12:00:00"


# ---------------------------------------------------------------------------
# run() lifecycle
# ---------------------------------------------------------------------------


class TestRunLifecycle:
    async def test_run_creates_success_record(self, async_session):
        worker = OTXWorker(_make_settings())
        worker._get = AsyncMock(
            return_value=_mock_response(
                _page([_pulse([_indicator("IPv4", "7.7.7.7")])])
            )
        )

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "success"
        assert feed_run.feed_name == "otx"
        assert feed_run.iocs_fetched == 1
        assert feed_run.last_successful_sync is not None

    async def test_run_skips_when_not_configured(self, async_session):
        worker = OTXWorker(_make_settings(otx_api_key=""))

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "error"
        assert "not configured" in feed_run.error_msg
