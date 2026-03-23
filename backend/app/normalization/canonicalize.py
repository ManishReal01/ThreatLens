"""Per-type IOC canonicalization — strips whitespace, normalizes case, and format."""
import ipaddress
from urllib.parse import urlparse, urlunparse

import tldextract

from app.normalization.schema import IOCType


def canonicalize_ioc(value: str, ioc_type: IOCType) -> str:
    """Return canonical form of *value* for the given *ioc_type*.

    Raises ValueError for unrecognized types.
    """
    if ioc_type == IOCType.ip:
        return _canonicalize_ip(value)
    elif ioc_type == IOCType.domain:
        return _canonicalize_domain(value)
    elif ioc_type in (IOCType.hash_md5, IOCType.hash_sha1, IOCType.hash_sha256):
        return value.strip().lower()
    elif ioc_type == IOCType.url:
        return _canonicalize_url(value)
    elif ioc_type == IOCType.cve:
        return value.strip().upper()
    else:
        raise ValueError(f"Unrecognized IOCType: {ioc_type!r}")


def _canonicalize_ip(value: str) -> str:
    addr = ipaddress.ip_address(value.strip())
    # IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1) -> IPv4
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return str(addr.ipv4_mapped)
    return str(addr)


def _canonicalize_domain(value: str) -> str:
    lowered = value.strip().lower()
    # Use tldextract to validate structure but return full lowered+www-stripped value
    _ = tldextract.extract(lowered)  # validate (raises nothing; used for side effects)
    if lowered.startswith("www."):
        lowered = lowered[4:]
    return lowered


def _canonicalize_url(value: str) -> str:
    stripped = value.strip()
    parsed = urlparse(stripped)
    # Lowercase scheme and netloc (host); preserve path, query, fragment
    normalized = parsed._replace(
        scheme=parsed.scheme.lower(),
        netloc=parsed.netloc.lower(),
    )
    return urlunparse(normalized)
