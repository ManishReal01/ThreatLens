"""Severity scoring formula with exponential recency decay."""
import math
from typing import Dict

from pydantic import BaseModel

FEED_CONFIDENCE_WEIGHT: float = 0.40
SOURCE_COUNT_WEIGHT: float = 0.35
RECENCY_WEIGHT: float = 0.25
CURRENT_SCORE_VERSION: int = 1


class SeverityResult(BaseModel):
    score: float
    explanation: Dict


def compute_severity(
    raw_confidence: float,
    source_count: int = 1,
    age_days: float = 0,
) -> SeverityResult:
    """Compute severity score in [0.0, 10.0] with exponential recency decay.

    Formula:
        confidence_component  = raw_confidence * 10 * 0.40
        source_count_component = min(log2(source_count+1)/log2(11), 1.0) * 10 * 0.35
        recency_component      = exp(-0.008 * age_days) * 10 * 0.25
        score                  = sum of components, rounded to 2 dp
    """
    confidence_component = raw_confidence * 10 * FEED_CONFIDENCE_WEIGHT
    source_component = (
        min(math.log2(source_count + 1) / math.log2(11), 1.0) * 10 * SOURCE_COUNT_WEIGHT
    )
    recency_component = math.exp(-0.008 * age_days) * 10 * RECENCY_WEIGHT

    total = round(confidence_component + source_component + recency_component, 2)

    explanation: Dict = {
        "confidence_component": round(confidence_component, 4),
        "source_count_component": round(source_component, 4),
        "recency_component": round(recency_component, 4),
        "score_version": CURRENT_SCORE_VERSION,
    }

    return SeverityResult(score=total, explanation=explanation)
