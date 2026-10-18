import re
from pathlib import Path

import pandas as pd

from app.analytics import analyze_patterns
from app.contracts.analytics import PatternsResult
from app.contracts.common import ComponentState
from app.contracts.decisions import RecommendationsResult
from app.decisions import build_recommendations

ROOT = Path(__file__).resolve().parents[3]
ANALYTICS_FIXTURES = ROOT / "docs" / "fixtures" / "analytics"
DECISIONS_FIXTURES = ROOT / "docs" / "fixtures" / "decisions"


def pattern(pattern_id, factor, group_rate=0.3, baseline_rate=0.2, prepared=300.0, opportunity=100.0):
    return {
        "id": pattern_id,
        "title": f"Pattern {pattern_id}",
        "factor": factor,
        "group": {"unsold_rate": group_rate, "prepared_portions": prepared},
        "baseline": {"unsold_rate": baseline_rate, "prepared_portions": 900.0},
        "effect_pp": round((group_rate - baseline_rate) * 100, 6),
        "relative_effect": None,
        "support": {"rows": 12, "days": 12},
        "interpretation": "Association only.",
        "opportunity_ron_per_30_days": opportunity,
    }


def ready(*items):
    return PatternsResult(status="ready", items=list(items), limitations=["Associations only."])


def numbers(text):
    return set(re.findall(r"\d+(?:\.\d+)?", text))


def test_fixtures_are_the_real_function_output():
    for source, target in [
        ("patterns_ready.json", "recommendations_ready.json"),
        ("patterns_insufficient_data.json", "recommendations_insufficient_data.json"),
    ]:
        patterns = PatternsResult.model_validate_json((ANALYTICS_FIXTURES / source).read_text(encoding="utf-8"))
        expected = RecommendationsResult.model_validate_json((DECISIONS_FIXTURES / target).read_text(encoding="utf-8"))
        assert build_recommendations(patterns) == expected


def test_insufficient_patterns_prompt_data_collection():
    result = build_recommendations(PatternsResult(status="insufficient_data", items=[], limitations=["Not enough days."]))
    assert result.status == ComponentState.insufficient_data
    assert [item.id for item in result.items] == ["action-collect-more-data"]
    assert result.items[0].title == "Build comparable sales history"
    assert "12 distinct days" in result.items[0].description
    assert "both the observed group and its comparable baseline" in result.items[0].description
    assert result.items[0].evidence_pattern_ids == []
    assert result.items[0].opportunity_ron_per_30_days is None
    assert result.limitations[-1] == "Not enough days."


def test_at_most_three_actions_in_pattern_order():
    patterns = ready(*[pattern(f"p{i}", {"dish_id": f"dish-{i}", "weekday": "Friday"}) for i in range(5)])
    result = build_recommendations(patterns)
    assert [item.evidence_pattern_ids for item in result.items] == [["p0"], ["p1"], ["p2"]]


def test_actions_refer_only_to_supplied_ids_and_metrics():
    supplied = ready(
        pattern("p-dish", {"dish_id": "dish-01", "time_slot": "dinner"}, 0.35, 0.2, opportunity=250.5),
        pattern("p-rain", {"category": "dessert", "rain_bin": "rain"}, 0.4, 0.25, opportunity=None),
    )
    result = build_recommendations(supplied)
    by_id = {p.id: p for p in supplied.items}
    for action in result.items:
        assert len(action.evidence_pattern_ids) == 1
        source = by_id[action.evidence_pattern_ids[0]]
        assert action.opportunity_ron_per_30_days == source.opportunity_ron_per_30_days
        allowed = {
            f"{source.group.unsold_rate:.0%}".rstrip("%"),
            f"{source.baseline.unsold_rate:.0%}".rstrip("%"),
            f"{source.effect_pp:.1f}",
            str(source.support.days),
        } | numbers(source.factor.get("dish_id", ""))
        assert numbers(action.description + " " + action.title) <= allowed | {"01"}
        assert action.description.startswith("Observed evidence:")
        assert "comparable baseline" in action.description
        assert "Suggested experiment:" in action.description
        assert "stockout results before adopting it" in action.description


def test_recommendations_are_repeatable_and_do_not_claim_disposal():
    supplied = ready(pattern("p", {"dish_id": "soup", "weekday": "Friday"}, 0.35, 0.2, opportunity=250.5))
    first = build_recommendations(supplied)
    second = build_recommendations(supplied.model_copy(deep=True))

    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    rendered = " ".join([first.items[0].title, first.items[0].description, *first.limitations]).lower()
    assert "guaranteed savings" in rendered
    assert "do not confirm that food was discarded" in rendered
    assert "will reduce" not in rendered


def test_effort_labels():
    result = build_recommendations(
        ready(
            pattern("a", {"dish_id": "d1", "weekday": "Friday"}),
            pattern("b", {"category": "soup", "university_state": "break"}, group_rate=0.4),
            pattern("c", {"dish_id": "d2", "rain_bin": "rain"}, group_rate=0.5),
        )
    )
    assert [item.effort for item in result.items] == ["low", "high", "medium"]
    assert result.items[1].title == "Test lower planned quantities for soup dishes during university break"


def test_identical_coverage_is_not_recommended_twice():
    # A dish that is the only member of its category yields two patterns over the same rows.
    result = build_recommendations(
        ready(
            pattern("dish", {"dish_id": "dish-02", "time_slot": "dinner"}),
            pattern("category", {"category": "main", "time_slot": "dinner"}),
            pattern("other", {"dish_id": "dish-03", "time_slot": "lunch"}, group_rate=0.45),
        )
    )
    assert [item.evidence_pattern_ids[0] for item in result.items] == ["dish", "other"]


def test_end_to_end_with_member_2_patterns_on_minimal_csv():
    rows = pd.read_csv(ROOT / "data" / "demo" / "restaurant_minimal_synthetic.csv", parse_dates=["date"])
    patterns = analyze_patterns(rows, None)
    result = build_recommendations(patterns)
    assert result.status == ComponentState.ready
    assert 1 <= len(result.items) <= 3
    supplied = {p.id for p in patterns.items}
    assert all(set(item.evidence_pattern_ids) <= supplied for item in result.items)


def test_input_is_not_mutated():
    patterns = ready(pattern("p", {"dish_id": "d1", "weekday": "Friday"}))
    before = patterns.model_dump()
    build_recommendations(patterns)
    assert patterns.model_dump() == before
