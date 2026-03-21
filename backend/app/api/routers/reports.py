"""PDF threat report generation endpoints.

POST /api/reports/ioc/{ioc_id}           — IOC detail report
POST /api/reports/threat-actor/{actor_id} — Threat actor report
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.models import IOCModel, IOCSourceModel, ThreatActorIOCLinkModel, ThreatActorModel

router = APIRouter(prefix="/api/reports", tags=["reports"])

# ── Colour palette matching the ThreatLens dark-theme UI ──────────────────
_DARK        = colors.HexColor("#0f172a")
_CARD        = colors.HexColor("#1e293b")
_PRIMARY     = colors.HexColor("#38bdf8")
_MUTED       = colors.HexColor("#94a3b8")
_FOREGROUND  = colors.HexColor("#e2e8f0")
_CRITICAL    = colors.HexColor("#f87171")
_HIGH        = colors.HexColor("#fb923c")
_MEDIUM      = colors.HexColor("#4ade80")
_LOW         = colors.HexColor("#94a3b8")


def _severity_color(score: float | None) -> colors.Color:
    if score is None:
        return _MUTED
    if score >= 8.5:
        return _CRITICAL
    if score >= 7.0:
        return _HIGH
    if score >= 4.0:
        return _MEDIUM
    return _LOW


def _severity_label(score: float | None) -> str:
    if score is None:
        return "unknown"
    if score >= 8.5:
        return "CRITICAL"
    if score >= 7.0:
        return "HIGH"
    if score >= 4.0:
        return "MEDIUM"
    return "LOW"


def _base_doc(buf: io.BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )


def _styles():
    base = getSampleStyleSheet()
    h1 = ParagraphStyle(
        "TLH1",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        textColor=_PRIMARY,
        spaceAfter=4,
    )
    h2 = ParagraphStyle(
        "TLH2",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=_FOREGROUND,
        spaceBefore=10,
        spaceAfter=4,
    )
    body = ParagraphStyle(
        "TLBody",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=_MUTED,
        spaceAfter=3,
        leading=13,
    )
    mono = ParagraphStyle(
        "TLMono",
        parent=base["Normal"],
        fontName="Courier",
        fontSize=9,
        textColor=_FOREGROUND,
        spaceAfter=2,
    )
    label = ParagraphStyle(
        "TLLabel",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=_MUTED,
        spaceAfter=1,
    )
    return h1, h2, body, mono, label


def _header_block(title: str, subtitle: str) -> list:
    h1, _, body, _, _ = _styles()
    generated = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return [
        Paragraph("ThreatLens — Threat Intelligence Platform", body),
        Paragraph(title, h1),
        Paragraph(subtitle, body),
        Spacer(1, 2 * mm),
        Paragraph(f"Generated: {generated}", body),
        HRFlowable(width="100%", thickness=1, color=_PRIMARY, spaceAfter=6),
    ]


def _section(title: str) -> list:
    _, h2, _, _, _ = _styles()
    return [
        Spacer(1, 3 * mm),
        Paragraph(title, h2),
        HRFlowable(width="100%", thickness=0.5, color=_CARD, spaceAfter=4),
    ]


def _kv_row(label: str, value: str) -> list:
    _, _, body, mono, lbl = _styles()
    return [
        Paragraph(label.upper(), lbl),
        Paragraph(value, mono),
        Spacer(1, 1 * mm),
    ]


_TABLE_STYLE = TableStyle([
    ("BACKGROUND",  (0, 0), (-1, 0), _CARD),
    ("TEXTCOLOR",   (0, 0), (-1, 0), _MUTED),
    ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE",    (0, 0), (-1, 0), 8),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_DARK, _CARD]),
    ("TEXTCOLOR",   (0, 1), (-1, -1), _FOREGROUND),
    ("FONTNAME",    (0, 1), (-1, -1), "Courier"),
    ("FONTSIZE",    (0, 1), (-1, -1), 8),
    ("GRID",        (0, 0), (-1, -1), 0.25, colors.HexColor("#334155")),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING",  (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
])


# ---------------------------------------------------------------------------
# POST /api/reports/ioc/{ioc_id}
# ---------------------------------------------------------------------------


@router.post("/ioc/{ioc_id}")
async def generate_ioc_report(
    ioc_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Generate a PDF threat report for the given IOC."""
    ioc = (await session.execute(select(IOCModel).where(IOCModel.id == ioc_id))).scalar_one_or_none()
    if ioc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IOC not found.")

    sources = (
        await session.execute(
            select(IOCSourceModel)
            .where(IOCSourceModel.ioc_id == ioc_id)
            .order_by(IOCSourceModel.ingested_at.desc())
        )
    ).scalars().all()

    # Linked threat actors
    ta_links = (
        await session.execute(
            select(ThreatActorModel.name, ThreatActorModel.mitre_id)
            .join(ThreatActorIOCLinkModel, ThreatActorIOCLinkModel.threat_actor_id == ThreatActorModel.id)
            .where(ThreatActorIOCLinkModel.ioc_id == ioc_id)
        )
    ).all()

    buf = io.BytesIO()
    doc = _base_doc(buf)
    h1, h2, body, mono, lbl = _styles()
    sev_color = _severity_color(float(ioc.severity) if ioc.severity is not None else None)
    sev_label = _severity_label(float(ioc.severity) if ioc.severity is not None else None)

    story = []
    story += _header_block(
        title=f"IOC Report: {ioc.value}",
        subtitle=f"Type: {ioc.type.upper()}  ·  Severity: {sev_label}  ·  Score: {float(ioc.severity):.1f}" if ioc.severity else f"Type: {ioc.type.upper()}",
    )

    # ── Overview ──────────────────────────────────────────────────────────
    story += _section("Overview")
    overview_data = [
        ["Field",        "Value"],
        ["Value",        ioc.value],
        ["Type",         ioc.type],
        ["Severity",     sev_label],
        ["Score",        f"{float(ioc.severity):.2f}" if ioc.severity else "—"],
        ["Status",       "Active" if ioc.is_active else "Inactive"],
        ["First Seen",   ioc.first_seen.strftime("%Y-%m-%d %H:%M UTC") if ioc.first_seen else "—"],
        ["Last Seen",    ioc.last_seen.strftime("%Y-%m-%d %H:%M UTC") if ioc.last_seen else "—"],
        ["Source Count", str(ioc.source_count)],
    ]
    t = Table(overview_data, colWidths=[50 * mm, 120 * mm])
    t.setStyle(_TABLE_STYLE)
    t.setStyle(TableStyle([("TEXTCOLOR", (1, 3), (1, 3), sev_color)]))
    story.append(t)

    # ── Score Breakdown ───────────────────────────────────────────────────
    if ioc.score_explanation and isinstance(ioc.score_explanation, dict):
        story += _section("Score Breakdown")
        rows = [["Component", "Value"]] + [
            [k.replace("_", " ").title(), str(v)]
            for k, v in ioc.score_explanation.items()
        ]
        t2 = Table(rows, colWidths=[80 * mm, 90 * mm])
        t2.setStyle(_TABLE_STYLE)
        story.append(t2)

    # ── Feed Observations ─────────────────────────────────────────────────
    story += _section(f"Feed Observations ({len(sources)})")
    if sources:
        src_rows = [["Feed", "Ingested At", "Raw Score"]] + [
            [
                s.feed_name,
                s.ingested_at.strftime("%Y-%m-%d %H:%M UTC") if s.ingested_at else "—",
                f"{s.raw_score:.4f}" if s.raw_score is not None else "—",
            ]
            for s in sources
        ]
        t3 = Table(src_rows, colWidths=[50 * mm, 80 * mm, 40 * mm])
        t3.setStyle(_TABLE_STYLE)
        story.append(t3)
    else:
        story.append(Paragraph("No feed observations recorded.", body))

    # ── Linked Threat Actors ──────────────────────────────────────────────
    story += _section(f"Linked Threat Actors ({len(ta_links)})")
    if ta_links:
        ta_rows = [["MITRE ID", "Name"]] + [[row[1], row[0]] for row in ta_links]
        t4 = Table(ta_rows, colWidths=[40 * mm, 130 * mm])
        t4.setStyle(_TABLE_STYLE)
        story.append(t4)
    else:
        story.append(Paragraph("No threat actors linked.", body))

    # ── Enrichment ────────────────────────────────────────────────────────
    enrichment = (ioc.metadata_ or {}).get("enrichment")
    if enrichment and isinstance(enrichment, dict):
        story += _section("Enrichment Data")
        enrich_rows = [["Field", "Value"]] + [
            [k.replace("_", " ").title(), str(v)]
            for k, v in enrichment.items()
            if k not in ("type", "enriched_at")
        ]
        if len(enrich_rows) > 1:
            t5 = Table(enrich_rows, colWidths=[60 * mm, 110 * mm])
            t5.setStyle(_TABLE_STYLE)
            story.append(t5)
        story.append(Spacer(1, 1 * mm))
        enriched_at = enrichment.get("enriched_at", "")
        if enriched_at:
            story.append(Paragraph(f"Enriched at: {str(enriched_at)[:10]}", body))

    doc.build(story)
    buf.seek(0)
    filename = f"ioc-report-{ioc.value[:40].replace('/', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# POST /api/reports/threat-actor/{actor_id}
# ---------------------------------------------------------------------------


@router.post("/threat-actor/{actor_id}")
async def generate_threat_actor_report(
    actor_id: uuid.UUID,
    current_user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Generate a PDF threat report for the given threat actor."""
    actor = (
        await session.execute(select(ThreatActorModel).where(ThreatActorModel.id == actor_id))
    ).scalar_one_or_none()
    if actor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Threat actor not found.")

    # Linked IOCs (up to 50 for the report)
    linked_iocs = (
        await session.execute(
            select(IOCModel.value, IOCModel.type, IOCModel.severity)
            .join(ThreatActorIOCLinkModel, ThreatActorIOCLinkModel.ioc_id == IOCModel.id)
            .where(ThreatActorIOCLinkModel.threat_actor_id == actor_id)
            .order_by(IOCModel.severity.desc().nullslast())
            .limit(50)
        )
    ).all()

    buf = io.BytesIO()
    doc = _base_doc(buf)
    _, h2, body, mono, lbl = _styles()

    story = []
    story += _header_block(
        title=f"Threat Actor: {actor.name}",
        subtitle=f"MITRE ID: {actor.mitre_id}" + (f"  ·  Country: {actor.country}" if actor.country else ""),
    )

    # ── Overview ──────────────────────────────────────────────────────────
    story += _section("Overview")
    aliases_str = ", ".join(actor.aliases) if actor.aliases else "—"
    motivations_str = ", ".join(actor.motivations) if actor.motivations else "—"
    overview_data = [
        ["Field",        "Value"],
        ["MITRE ID",     actor.mitre_id],
        ["Name",         actor.name],
        ["Aliases",      aliases_str],
        ["Country",      actor.country or "—"],
        ["Motivations",  motivations_str],
        ["First Seen",   str(actor.first_seen) if actor.first_seen else "—"],
        ["Last Seen",    str(actor.last_seen) if actor.last_seen else "—"],
    ]
    t = Table(overview_data, colWidths=[50 * mm, 120 * mm])
    t.setStyle(_TABLE_STYLE)
    story.append(t)

    # ── Description ───────────────────────────────────────────────────────
    if actor.description:
        story += _section("Description")
        story.append(Paragraph(actor.description[:2000], body))

    # ── Techniques ────────────────────────────────────────────────────────
    techniques = actor.techniques or []
    story += _section(f"MITRE ATT&CK Techniques ({len(techniques)})")
    if techniques:
        tech_rows = [["Technique ID", "Name"]] + [
            [t_item.get("id", ""), t_item.get("name", "")]
            for t_item in techniques[:60]
        ]
        t2 = Table(tech_rows, colWidths=[40 * mm, 130 * mm])
        t2.setStyle(_TABLE_STYLE)
        story.append(t2)
    else:
        story.append(Paragraph("No techniques recorded.", body))

    # ── Tools & Software ──────────────────────────────────────────────────
    software = actor.software or []
    story += _section(f"Tools & Software ({len(software)})")
    if software:
        sw_rows = [["Tool ID", "Name"]] + [
            [s_item.get("id", ""), s_item.get("name", "")]
            for s_item in software[:40]
        ]
        t3 = Table(sw_rows, colWidths=[40 * mm, 130 * mm])
        t3.setStyle(_TABLE_STYLE)
        story.append(t3)
    else:
        story.append(Paragraph("No tools recorded.", body))

    # ── Associated Malware ────────────────────────────────────────────────
    malware = actor.associated_malware or []
    if malware:
        story += _section(f"Associated Malware ({len(malware)})")
        story.append(Paragraph(", ".join(str(m) for m in malware), body))

    # ── Linked IOCs ───────────────────────────────────────────────────────
    story += _section(f"Linked IOCs (showing up to 50)")
    if linked_iocs:
        ioc_rows = [["IOC Value", "Type", "Severity"]] + [
            [row[0][:60], row[1], f"{float(row[2]):.1f}" if row[2] else "—"]
            for row in linked_iocs
        ]
        t4 = Table(ioc_rows, colWidths=[100 * mm, 30 * mm, 40 * mm])
        t4.setStyle(_TABLE_STYLE)
        story.append(t4)
    else:
        story.append(Paragraph("No IOCs linked.", body))

    doc.build(story)
    buf.seek(0)
    safe_name = actor.name.replace(" ", "_")[:40]
    filename = f"threat-actor-{safe_name}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
