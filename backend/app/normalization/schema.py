"""NormalizedIOC Pydantic model — contract every feed adapter must produce."""
from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, field_validator


class IOCType(str, Enum):
    ip = "ip"
    domain = "domain"
    hash_md5 = "hash_md5"
    hash_sha1 = "hash_sha1"
    hash_sha256 = "hash_sha256"
    url = "url"


class NormalizedIOC(BaseModel):
    value: str
    ioc_type: IOCType
    raw_confidence: float
    feed_name: str
    raw_payload: Dict
    metadata: Dict = {}
    feed_run_id: Optional[str] = None

    @field_validator("raw_confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if v < 0.0 or v > 1.0:
            raise ValueError(f"raw_confidence must be in [0.0, 1.0], got {v}")
        return v
