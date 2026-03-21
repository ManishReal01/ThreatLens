"""Tests for the ThreatFox feed adapter.

Covers:
  - _map_record() mapping logic (pure unit tests, no DB)
  - ioc_type mapping for all five ThreatFox types
  - ip:port → ip stripping
  - confidence_level 0-100 → 0.0-1.0 normalisation
  - is_configured() — requires urlhaus_api_key
  - fetch_and_normalize() with mocked HTTP (integration with upsert)
  - Unsupported query_status raises RuntimeError
  - 1000-IOC cap per run
"""

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config import Settings
from app.feeds.threatfox import ThreatFoxWorker, _map_record
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
        "id": "111111",
        "ioc": "192.0.2.1:4444",
        "ioc_type": "ip:port",
        "ioc_type_desc": "Botnet C2 IP:Port",
        "threat_type": "botnet_cc",
        "threat_type_desc": "Botnet C2",
        "malware": "Win.Trojan.Mirai",
        "malware_printable": "Mirai",
        "malware_alias": None,
        "confidence_level": 75,
        "first_seen": "2024-01-01 00:00:00 UTC",
        "last_seen": None,
        "reporter": "anonymous",
        "reference": "",
        "tags": ["mirai"],
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


def _api_body(records: list[dict], query_status: str = "ok") -> dict:
    return {"query_status": query_status, "data": records}


# ---------------------------------------------------------------------------
# _map_record unit tests — ioc_type mapping
# ---------------------------------------------------------------------------


class TestMapRecordTypes:
    def test_ip_port_maps_to_ip(self):
        ioc = _map_record(_sample_record(ioc="10.0.0.1:1234", ioc_type="ip:port"), "r")
        assert ioc is not None
        assert ioc.ioc_type == IOCType.ip

    def test_ip_port_strips_port(self):
        ioc = _map_record(_sample_record(ioc="10.0.0.1:9999", ioc_type="ip:port"), "r")
        assert ioc.value == "10.0.0.1"

    def test_domain_type(self):
        ioc = _map_record(_sample_record(ioc="evil.example.com", ioc_type="domain"), "r")
        assert ioc.ioc_type == IOCType.domain
        assert ioc.value == "evil.example.com"

    def test_url_type(self):
        ioc = _map_record(_sample_record(ioc="http://evil.example.com/payload", ioc_type="url"), "r")
        assert ioc.ioc_type == IOCType.url

    def test_md5_hash_type(self):
        ioc = _map_record(_sample_record(ioc="d41d8cd98f00b204e9800998ecf8427e", ioc_type="md5_hash"), "r")
        assert ioc.ioc_type == IOCType.hash_md5

    def test_sha256_hash_type(self):
        ioc = _map_record(
            _sample_record(
                ioc="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                ioc_type="sha256_hash",
            ),
            "r",
        )
        assert ioc.ioc_type == IOCType.hash_sha256

    def test_unsupported_ioc_type_returns_none(self):
        ioc = _map_record(_sample_record(ioc_type="email"), "r")
        assert ioc is None

    def test_missing_ioc_value_returns_none(self):
        assert _map_record({"ioc_type": "domain"}, "r") is None
        assert _map_record({"ioc": "", "ioc_type": "domain"}, "r") is None


# ---------------------------------------------------------------------------
# _map_record unit tests — confidence normalisation
# ---------------------------------------------------------------------------


class TestMapRecordConfidence:
    def test_confidence_75_maps_to_0_75(self):
        ioc = _map_record(_sample_record(confidence_level=75), "r")
        assert ioc.raw_confidence == pytest.approx(0.75)

    def test_confidence_100_maps_to_1_0(self):
        ioc = _map_record(_sample_record(confidence_level=100), "r")
        assert ioc.raw_confidence == pytest.approx(1.0)

    def test_confidence_0_defaults_to_0_5(self):
        ioc = _map_record(_sample_record(confidence_level=0), "r")
        assert ioc.raw_confidence == 0.5

    def test_missing_confidence_defaults_to_0_5(self):
        rec = _sample_record()
        rec.pop("confidence_level")
        ioc = _map_record(rec, "r")
        assert ioc.raw_confidence == 0.5


# ---------------------------------------------------------------------------
# _map_record unit tests — metadata & payload
# ---------------------------------------------------------------------------


class TestMapRecordMetadata:
    def test_malware_family_in_metadata(self):
        ioc = _map_record(_sample_record(), "r")
        assert ioc.metadata["malware_family"] == "Win.Trojan.Mirai"
        assert ioc.metadata["malware"] == "Mirai"

    def test_threat_type_in_metadata(self):
        ioc = _map_record(_sample_record(), "r")
        assert ioc.metadata["threat_type"] == "botnet_cc"

    def test_tags_preserved(self):
        ioc = _map_record(_sample_record(tags=["mirai", "c2"]), "r")
        assert ioc.metadata["tags"] == ["mirai", "c2"]

    def test_null_tags_normalised_to_empty_list(self):
        ioc = _map_record(_sample_record(tags=None), "r")
        assert ioc.metadata["tags"] == []

    def test_raw_payload_preserved(self):
        rec = _sample_record()
        ioc = _map_record(rec, "r")
        assert ioc.raw_payload == rec

    def test_feed_name_is_threatfox(self):
        ioc = _map_record(_sample_record(), "run-42")
        assert ioc.feed_name == "threatfox"
        assert ioc.feed_run_id == "run-42"


# ---------------------------------------------------------------------------
# is_configured tests
# ---------------------------------------------------------------------------


class TestIsConfigured:
    def test_configured_with_key(self):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="abc123"))
        assert worker.is_configured() is True

    def test_not_configured_without_key(self):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key=""))
        assert worker.is_configured() is False


# ---------------------------------------------------------------------------
# fetch_and_normalize integration tests (mocked HTTP, real SQLite DB)
# ---------------------------------------------------------------------------


class TestFetchAndNormalize:
    async def test_returns_correct_counts(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        records = [
            _sample_record(ioc="10.0.0.1:80", ioc_type="ip:port"),
            _sample_record(ioc="evil.example.com", ioc_type="domain"),
            _sample_record(ioc="http://evil.example.com/x", ioc_type="url"),
        ]
        worker._post = AsyncMock(return_value=_mock_response(_api_body(records)))

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 3
        assert new == 3
        assert updated == 0

    async def test_no_results_status_returns_zero(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        worker._post = AsyncMock(
            return_value=_mock_response({"query_status": "no_results", "data": None})
        )

        async with worker:
            fetched, new, updated = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 0 and new == 0 and updated == 0

    async def test_error_status_raises(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        worker._post = AsyncMock(
            return_value=_mock_response({"query_status": "error", "data": []})
        )

        async with worker:
            with pytest.raises(RuntimeError, match="unexpected query_status"):
                await worker.fetch_and_normalize(async_session, str(uuid.uuid4()))

    async def test_skips_unsupported_ioc_types(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        records = [
            _sample_record(ioc="10.0.0.1:80", ioc_type="ip:port"),
            _sample_record(ioc="user@example.com", ioc_type="email"),  # unsupported
        ]
        worker._post = AsyncMock(return_value=_mock_response(_api_body(records)))

        async with worker:
            fetched, new, _ = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 1
        assert new == 1

    async def test_deduplication(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        record = _sample_record(ioc="10.0.0.2:8080", ioc_type="ip:port")
        run_id_1, run_id_2 = str(uuid.uuid4()), str(uuid.uuid4())

        worker._post = AsyncMock(return_value=_mock_response(_api_body([record])))
        async with worker:
            _, n1, u1 = await worker.fetch_and_normalize(async_session, run_id_1)
        await async_session.flush()

        worker._post = AsyncMock(return_value=_mock_response(_api_body([record])))
        async with worker:
            _, n2, u2 = await worker.fetch_and_normalize(async_session, run_id_2)

        assert n1 == 1 and u1 == 0
        assert n2 == 0 and u2 == 1

    async def test_cap_at_1000_iocs(self, async_session):
        """Records beyond the 1000-IOC cap must be silently dropped."""
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        # 1050 unique domain records
        records = [
            _sample_record(ioc=f"domain{i}.example.com", ioc_type="domain")
            for i in range(1050)
        ]
        worker._post = AsyncMock(return_value=_mock_response(_api_body(records)))

        async with worker:
            fetched, new, _ = await worker.fetch_and_normalize(
                async_session, str(uuid.uuid4())
            )

        assert fetched == 1000
        assert new == 1000


# ---------------------------------------------------------------------------
# run() lifecycle tests
# ---------------------------------------------------------------------------


class TestRunLifecycle:
    async def test_run_success(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        worker._post = AsyncMock(
            return_value=_mock_response(_api_body([_sample_record()]))
        )

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "success"
        assert feed_run.feed_name == "threatfox"
        assert feed_run.iocs_fetched == 1

    async def test_run_skipped_when_not_configured(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key=""))

        async with worker:
            feed_run = await worker.run(async_session)

        assert feed_run.status == "error"
        assert "not configured" in (feed_run.error_msg or "")

    async def test_run_records_error_on_api_failure(self, async_session):
        worker = ThreatFoxWorker(_make_settings(urlhaus_api_key="key"))
        worker._post = AsyncMock(side_effect=Exception("timeout"))

        async with worker:
            with pytest.raises(Exception, match="timeout"):
                await worker.run(async_session)

        from sqlalchemy import select
        from app.models.feed_run import FeedRunModel

        result = await async_session.execute(
            select(FeedRunModel).where(FeedRunModel.feed_name == "threatfox")
        )
        run = result.scalar_one()
        assert run.status == "error"
        assert "timeout" in run.error_msg
