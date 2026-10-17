"""Deterministic, evidence-linked actions built from member 2's patterns.

Every number in an action comes from the supplied pattern; no new metric is
invented, and opportunities are never summed across actions.
"""

from app.contracts.analytics import PatternItem, PatternsResult
from app.contracts.common import ComponentState
from app.contracts.decisions import RecommendationAction, RecommendationsResult

MAX_ACTIONS = 3
_BASE_KEYS = ("dish_id", "category")
_CONTEXT_ORDER = ("weekday", "time_slot", "rain_bin", "university_state")
_PLANNING_CONTEXTS = {"rain_bin", "university_state"}

COLLECT_DATA_ACTION = RecommendationAction(
    id="action-collect-more-data",
    title="Collect more sales history",
    description=(
        "No supported pattern was found yet. Keep recording prepared and sold portions per dish and service; "
        "at least 12 days and 100 portions per compared group are needed."
    ),
    effort="low",
    evidence_pattern_ids=[],
    opportunity_ron_per_30_days=None,
)

LIMITATIONS = [
    "Opportunities are indicative and are not guaranteed savings.",
    "Opportunities of overlapping actions must not be summed.",
    "Associated factors are not proven causes.",
]


def build_recommendations(patterns: PatternsResult) -> RecommendationsResult:
    """Return at most three actions, each linked to exactly one supplied pattern.

    Patterns are taken in member 2's ranking order. A pattern that describes the
    same rows as an already chosen one (same context and identical group
    metrics, e.g. a dish that is the only member of its category) is skipped so
    the same surplus is not recommended twice.
    """
    if patterns.status != ComponentState.ready or not patterns.items:
        return RecommendationsResult(
            status=ComponentState.insufficient_data,
            items=[COLLECT_DATA_ACTION],
            limitations=["No supported patterns were supplied, so no evidence-linked action can be recommended."],
        )

    chosen: list[PatternItem] = []
    for pattern in patterns.items:
        if len(chosen) == MAX_ACTIONS:
            break
        if not any(_same_rows(pattern, other) for other in chosen):
            chosen.append(pattern)

    return RecommendationsResult(
        status=ComponentState.ready,
        items=[_action(pattern) for pattern in chosen],
        limitations=list(LIMITATIONS),
    )


def _context(pattern: PatternItem) -> dict:
    return {key: value for key, value in pattern.factor.items() if key not in _BASE_KEYS}


def _same_rows(left: PatternItem, right: PatternItem) -> bool:
    """A dish pattern and a category pattern with equal context and metrics cover the same rows."""
    bases = {key for key in _BASE_KEYS if key in left.factor} ^ {key for key in _BASE_KEYS if key in right.factor}
    return (
        bases == set(_BASE_KEYS)
        and _context(left) == _context(right)
        and left.group == right.group
        and left.baseline == right.baseline
    )


def _subject(pattern: PatternItem) -> str:
    if "dish_id" in pattern.factor:
        return f"dish {pattern.factor['dish_id']}"
    if "category" in pattern.factor:
        return f"{pattern.factor['category']} dishes"
    return "all dishes"


def _when(context: dict) -> str:
    phrases = []
    for key in sorted(context, key=lambda k: (_CONTEXT_ORDER.index(k) if k in _CONTEXT_ORDER else len(_CONTEXT_ORDER), k)):
        value = context[key]
        if key == "weekday":
            phrases.append(f"on {value}s")
        elif key == "time_slot":
            phrases.append(f"at {value}")
        elif key == "rain_bin":
            phrases.append(f"on {value} days")
        elif key == "university_state":
            phrases.append(f"during university {value}")
        else:
            phrases.append(f"when {key.replace('_', ' ')} is {value}")
    return " ".join(phrases)


def _effort(pattern: PatternItem, context: dict) -> str:
    planning = bool(_PLANNING_CONTEXTS & context.keys())
    single_dish = "dish_id" in pattern.factor
    if planning:
        return "medium" if single_dish else "high"
    return "low" if single_dish else "medium"


def _action(pattern: PatternItem) -> RecommendationAction:
    context = _context(pattern)
    subject, when = _subject(pattern), _when(context)
    if _PLANNING_CONTEXTS & context.keys():
        title = f"Plan {subject} quantities ahead {when}".strip()
        how = "Check the forecast or calendar the day before and lower planned portions for these conditions."
    else:
        title = f"Prepare fewer portions of {subject} {when}".strip()
        how = "Try a lower planned quantity and check it in the simulator before changing the plan."
    description = (
        f"Unsold share was {pattern.group.unsold_rate:.0%} versus {pattern.baseline.unsold_rate:.0%} in comparable "
        f"services (+{pattern.effect_pp:.1f} pp over {pattern.support.days} days). {how}"
    )
    return RecommendationAction(
        id=f"action-{pattern.id}",
        title=title[0].upper() + title[1:],
        description=description,
        effort=_effort(pattern, context),
        evidence_pattern_ids=[pattern.id],
        opportunity_ron_per_30_days=pattern.opportunity_ron_per_30_days,
    )
