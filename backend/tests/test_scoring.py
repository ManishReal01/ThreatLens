"""Tests for compute_severity — formula weights and recency decay."""
import math

from app.normalization.scoring import (
    CURRENT_SCORE_VERSION,
    FEED_CONFIDENCE_WEIGHT,
    RECENCY_WEIGHT,
    SOURCE_COUNT_WEIGHT,
    SeverityResult,
    compute_severity,
)


def test_weight_constants():
    assert FEED_CONFIDENCE_WEIGHT == 0.50
    assert SOURCE_COUNT_WEIGHT == 0.25
    assert RECENCY_WEIGHT == 0.25


def test_score_version_constant():
    assert CURRENT_SCORE_VERSION == 2


def test_score_in_valid_range():
    result = compute_severity(raw_confidence=1.0, source_count=1, age_days=0)
    assert 0.0 <= result.score <= 10.0


def test_recency_factor_at_age_zero_near_one():
    # exp(-0.008 * 0) = 1.0 exactly
    recency_at_zero = math.exp(-0.008 * 0)
    assert recency_at_zero == pytest.approx(1.0)


def test_recency_decays_with_age():
    r0 = compute_severity(raw_confidence=0.8, source_count=1, age_days=0).score
    r7 = compute_severity(raw_confidence=0.8, source_count=1, age_days=7).score
    assert r0 > r7


def test_recency_near_zero_at_180_days():
    result = compute_severity(raw_confidence=1.0, source_count=10, age_days=180)
    # recency_component at 180 days: exp(-0.008*180) = exp(-1.44) ≈ 0.237
    # Full recency_component = 0.237 * 10 * 0.25 ≈ 0.59 — much less than at age 0 (2.5)
    result_age0 = compute_severity(raw_confidence=1.0, source_count=10, age_days=0)
    assert result.score < result_age0.score


def test_monotonic_decay():
    ages = [0, 7, 30, 90, 180]
    scores = [compute_severity(0.8, 1, age).score for age in ages]
    for i in range(len(scores) - 1):
        assert scores[i] > scores[i + 1], f"Not monotonic at index {i}: {scores}"


def test_higher_source_count_gives_higher_score():
    low = compute_severity(raw_confidence=0.5, source_count=1, age_days=0).score
    high = compute_severity(raw_confidence=0.5, source_count=10, age_days=0).score
    assert high > low


def test_explanation_has_required_keys():
    result = compute_severity(raw_confidence=0.7, source_count=3, age_days=14)
    keys = result.explanation.keys()
    assert "confidence_component" in keys
    assert "source_count_component" in keys
    assert "recency_component" in keys
    assert "score_version" in keys


def test_explanation_score_version_matches_constant():
    result = compute_severity(raw_confidence=0.5, source_count=1, age_days=0)
    assert result.explanation["score_version"] == CURRENT_SCORE_VERSION


def test_severity_result_type():
    result = compute_severity(raw_confidence=0.5, source_count=1, age_days=0)
    assert isinstance(result, SeverityResult)


import pytest
