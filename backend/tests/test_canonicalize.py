"""Tests for canonicalize_ioc — per-type normalization."""
import pytest

from app.normalization.canonicalize import canonicalize_ioc
from app.normalization.schema import IOCType


def test_ip_strips_whitespace():
    assert canonicalize_ioc("  192.168.1.1  ", IOCType.ip) == "192.168.1.1"


def test_ip_ipv4_mapped_ipv6_returns_ipv4():
    # ::ffff:192.168.1.1 is IPv4-mapped IPv6; ipaddress normalizes to IPv4
    result = canonicalize_ioc("::FFFF:192.168.1.1", IOCType.ip)
    assert result == "192.168.1.1"


def test_domain_lowercased_and_www_stripped():
    assert canonicalize_ioc("WWW.Example.COM", IOCType.domain) == "example.com"


def test_domain_subdomain_preserved():
    # Non-www subdomain must NOT be stripped
    assert canonicalize_ioc("sub.example.co.uk", IOCType.domain) == "sub.example.co.uk"


def test_hash_lowercased():
    assert canonicalize_ioc("ABC123DEF", IOCType.hash_md5) == "abc123def"
    assert canonicalize_ioc("ABC123DEF", IOCType.hash_sha1) == "abc123def"
    assert canonicalize_ioc("ABC123DEF", IOCType.hash_sha256) == "abc123def"


def test_url_scheme_and_host_lowercased_path_preserved():
    result = canonicalize_ioc("HTTP://Example.COM/Path?q=1", IOCType.url)
    assert result == "http://example.com/Path?q=1"


def test_url_strips_whitespace():
    result = canonicalize_ioc("  https://EXAMPLE.ORG/  ", IOCType.url)
    assert result == "https://example.org/"


def test_unknown_type_raises_value_error():
    with pytest.raises(ValueError):
        canonicalize_ioc("something", "not_a_real_type")  # type: ignore[arg-type]


def test_domain_strips_whitespace():
    assert canonicalize_ioc("  example.com  ", IOCType.domain) == "example.com"
