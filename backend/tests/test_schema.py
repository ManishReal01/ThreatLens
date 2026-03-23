"""Tests for NormalizedIOC Pydantic model and IOCType enum."""
import pytest
from pydantic import ValidationError

from app.normalization.schema import IOCType, NormalizedIOC


def _base_ioc(**overrides) -> dict:
    base = {
        "value": "192.168.1.1",
        "ioc_type": IOCType.ip,
        "raw_confidence": 0.85,
        "feed_name": "test-feed",
        "raw_payload": {"source": "test"},
    }
    base.update(overrides)
    return base


def test_valid_ip_ioc():
    ioc = NormalizedIOC(**_base_ioc())
    assert ioc.value == "192.168.1.1"
    assert ioc.ioc_type == IOCType.ip
    assert ioc.raw_confidence == 0.85


def test_raw_confidence_below_zero_raises():
    with pytest.raises(ValidationError):
        NormalizedIOC(**_base_ioc(raw_confidence=-0.1))


def test_raw_confidence_above_one_raises():
    with pytest.raises(ValidationError):
        NormalizedIOC(**_base_ioc(raw_confidence=1.5))


def test_missing_value_raises():
    data = _base_ioc()
    del data["value"]
    with pytest.raises(ValidationError):
        NormalizedIOC(**data)


def test_all_ioc_types_valid():
    expected = {"ip", "domain", "hash_md5", "hash_sha1", "hash_sha256", "url", "cve"}
    actual = {t.value for t in IOCType}
    assert actual == expected


def test_metadata_defaults_to_empty_dict():
    ioc = NormalizedIOC(**_base_ioc())
    assert ioc.metadata == {}


def test_feed_run_id_optional():
    ioc = NormalizedIOC(**_base_ioc(feed_run_id=None))
    assert ioc.feed_run_id is None
    ioc2 = NormalizedIOC(**_base_ioc(feed_run_id="run-abc"))
    assert ioc2.feed_run_id == "run-abc"


def test_raw_confidence_boundary_values():
    ioc_zero = NormalizedIOC(**_base_ioc(raw_confidence=0.0))
    assert ioc_zero.raw_confidence == 0.0
    ioc_one = NormalizedIOC(**_base_ioc(raw_confidence=1.0))
    assert ioc_one.raw_confidence == 1.0
