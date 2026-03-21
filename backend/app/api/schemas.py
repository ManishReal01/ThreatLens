"""Pydantic response schemas for the ThreatLens REST API."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# IOC observation (one row from ioc_sources)
# ---------------------------------------------------------------------------


class IOCSourceResponse(BaseModel):
    id: uuid.UUID
    feed_name: str
    raw_score: Optional[float]
    ingested_at: datetime
    raw_payload: Optional[dict[str, Any]]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Analyst workspace items (user-scoped, only returned on detail view)
# ---------------------------------------------------------------------------


class TagResponse(BaseModel):
    id: uuid.UUID
    tag: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteResponse(BaseModel):
    id: uuid.UUID
    body: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# IOC list item — used in paginated search results
# ---------------------------------------------------------------------------


class IOCListItem(BaseModel):
    id: uuid.UUID
    value: str
    type: str
    severity: Optional[float]
    first_seen: datetime
    last_seen: datetime
    source_count: int
    is_active: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# IOC detail — full view with severity breakdown, observations, workspace
# ---------------------------------------------------------------------------


class IOCDetailResponse(BaseModel):
    id: uuid.UUID
    value: str
    type: str
    severity: Optional[float]
    first_seen: datetime
    last_seen: datetime
    source_count: int
    is_active: bool
    score_version: int
    score_explanation: Optional[dict[str, Any]]
    # Python attribute is metadata_ (avoids clash with SQLAlchemy reserved name);
    # exposed as "metadata" in the JSON response.
    metadata: Optional[dict[str, Any]]
    sources: list[IOCSourceResponse]
    tags: list[TagResponse]
    notes: list[NoteResponse]


# ---------------------------------------------------------------------------
# Paginated search response
# ---------------------------------------------------------------------------


class PaginatedIOCResponse(BaseModel):
    items: list[IOCListItem]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Graph traversal response
# ---------------------------------------------------------------------------


class GraphNode(BaseModel):
    id: uuid.UUID
    value: str
    type: str
    severity: Optional[float]


class GraphEdge(BaseModel):
    id: uuid.UUID
    source: uuid.UUID
    target: uuid.UUID
    relationship: str
    confidence: Optional[float]


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    # True when the 3-hop or 100-node cap was hit and the graph was clipped.
    truncated: bool


# ---------------------------------------------------------------------------
# Feed health
# ---------------------------------------------------------------------------


class FeedHealthItem(BaseModel):
    feed_name: str
    last_run_at: Optional[datetime]
    last_run_status: Optional[str]
    last_iocs_fetched: Optional[int]
    last_iocs_new: Optional[int]
    last_error_msg: Optional[str]
    total_iocs: int


class FeedHealthResponse(BaseModel):
    feeds: list[FeedHealthItem]


class TriggerResponse(BaseModel):
    status: str
    feed: str


# ---------------------------------------------------------------------------
# Threat Actor schemas
# ---------------------------------------------------------------------------


class ThreatActorTechnique(BaseModel):
    id: str
    name: str


class ThreatActorSoftware(BaseModel):
    id: str
    name: str


class ThreatActorListItem(BaseModel):
    id: uuid.UUID
    mitre_id: str
    name: str
    aliases: list[str]
    country: Optional[str]
    motivations: list[str]
    linked_ioc_count: int

    model_config = {"from_attributes": True}


class ThreatActorDetail(BaseModel):
    id: uuid.UUID
    mitre_id: str
    name: str
    aliases: list[str]
    description: Optional[str]
    country: Optional[str]
    motivations: list[str]
    first_seen: Optional[str]
    last_seen: Optional[str]
    techniques: list[dict[str, Any]]
    software: list[dict[str, Any]]
    associated_malware: list[str]
    metadata: Optional[dict[str, Any]]
    linked_ioc_count: int

    model_config = {"from_attributes": True}


class PaginatedThreatActorResponse(BaseModel):
    items: list[ThreatActorListItem]
    total: int
    page: int
    page_size: int
    pages: int


class ThreatActorLinkItem(BaseModel):
    id: uuid.UUID
    mitre_id: str
    name: str
    country: Optional[str]
    motivations: list[str]
    confidence: Optional[float]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------


class StatsResponse(BaseModel):
    total_iocs: int
    iocs_by_type: dict[str, int]
    # Severity bands: critical (>=8.5), high (7–8.49), medium (4–6.99), low (<4)
    iocs_by_severity: dict[str, int]


class GeoIPPoint(BaseModel):
    value: str
    latitude: float
    longitude: float
    severity: Optional[float]
    feed_source: str


class StatsTrend(BaseModel):
    date: str  # ISO date string YYYY-MM-DD
    count: int


class StatsTrendsResponse(BaseModel):
    trends: list[StatsTrend]
