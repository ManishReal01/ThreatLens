"""Severity scoring formula with exponential recency decay."""
import math

from pydantic import BaseModel

FEED_CONFIDENCE_WEIGHT: float = 0.35
SOURCE_COUNT_WEIGHT: float = 0.25
RECENCY_WEIGHT: float = 0.40
CURRENT_SCORE_VERSION: int = 3

# Severity band thresholds — must stay in sync with frontend utils.ts and iocs.py
SEVERITY_CRITICAL: float = 8.0
SEVERITY_HIGH: float = 6.5
SEVERITY_MEDIUM: float = 4.0


class SeverityResult(BaseModel):
    score: float
    explanation: dict


def compute_severity(
    raw_confidence: float,
    source_count: int = 1,
    age_days: float = 0,
) -> SeverityResult:
    """Compute severity score in [0.0, 10.0] with exponential recency decay.

    Formula:
        confidence_component  = raw_confidence * 10 * 0.35
        source_count_component = min(log2(source_count+1)/log2(11), 1.0) * 10 * 0.25
        recency_component      = exp(-0.008 * age_days) * 10 * 0.40
        score                  = sum of components, rounded to 2 dp

    Weight rationale: recency carries 40% so older IOCs decay to medium/low
    naturally even at high confidence.  Fresh high-confidence multi-source IOCs
    still reach critical.
    """
    confidence_component = raw_confidence * 10 * FEED_CONFIDENCE_WEIGHT
    source_component = (
        min(math.log2(source_count + 1) / math.log2(11), 1.0) * 10 * SOURCE_COUNT_WEIGHT
    )
    recency_component = math.exp(-0.008 * age_days) * 10 * RECENCY_WEIGHT

    total = round(confidence_component + source_component + recency_component, 2)

    explanation: dict = {
        "confidence_component": round(confidence_component, 4),
        "source_count_component": round(source_component, 4),
        "recency_component": round(recency_component, 4),
        "score_version": CURRENT_SCORE_VERSION,
    }

    return SeverityResult(score=total, explanation=explanation)
