"""Optional Claude wording for deterministic recommendations (P2, behind a flag).

`word_recommendations` asks Claude to rephrase the title and advice of each
action. Claude receives only action IDs, effort, pattern factors and the
metrics already computed; never the CSV, costs per dish or the API key. Every
number shown to the user still comes from the deterministic calculation: the
description keeps its evidence sentence, and Claude's text may not contain any
digit.

Anything unexpected returns the deterministic result unchanged: the flag off,
no key, SDK not installed, timeout, API error, refusal, invalid JSON, an
unknown, missing or repeated action ID, a digit in the text, or a length limit.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import OrderedDict
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.contracts.analytics import PatternsResult
from app.contracts.decisions import RecommendationAction, RecommendationsResult

DEFAULT_MODEL = "claude-opus-5-5"
TIMEOUT_SECONDS = 8.0
LIMITATION = "Action titles and advice were worded by Claude from the computed metrics; every number comes from the calculation."
_CACHE_SIZE = 256
_cache: "OrderedDict[str, dict[str, tuple[str, str]]]" = OrderedDict()
_log = logging.getLogger(__name__)

SYSTEM = (
    "You write short, practical wording for a restaurant food-waste tool. "
    "For each action in the JSON you receive, return a title (an imperative, at most 80 characters) "
    "and one sentence of advice (at most 240 characters) that a kitchen manager can act on tomorrow. "
    "Use only the facts given. Do not write any digit, number, percentage, amount or date: "
    "the numbers are shown separately. Say associations, not causes. Keep every action id exactly as given."
)


def _no_digits(value: str) -> str:
    if re.search(r"\d", value):
        raise ValueError("wording must not contain digits")
    return value


class WordedAction(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: Annotated[str, Field(min_length=1)]
    title: Annotated[str, Field(min_length=3, max_length=80)]
    advice: Annotated[str, Field(min_length=10, max_length=240)]

    _check_title = field_validator("title")(_no_digits)
    _check_advice = field_validator("advice")(_no_digits)


class WordingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actions: list[WordedAction]


RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "advice": {"type": "string"},
                },
                "required": ["id", "title", "advice"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["actions"],
    "additionalProperties": False,
}


def _prompt_payload(result: RecommendationsResult, patterns: PatternsResult | None) -> list[dict[str, Any]]:
    by_id = {item.id: item for item in (patterns.items if patterns else [])}
    payload = []
    for action in result.items:
        evidence = []
        for pattern_id in action.evidence_pattern_ids:
            pattern = by_id.get(pattern_id)
            if pattern is not None:
                evidence.append(
                    {
                        "pattern_id": pattern.id,
                        "factor": pattern.factor,
                        "unsold_share": round(pattern.group.unsold_rate, 3),
                        "comparable_unsold_share": round(pattern.baseline.unsold_rate, 3),
                        "effect_pp": round(pattern.effect_pp, 1),
                    }
                )
        payload.append(
            {
                "id": action.id,
                "current_title": action.title,
                "effort": action.effort,
                "evidence": evidence,
            }
        )
    return payload


def _evidence_sentence(description: str) -> str:
    """The deterministic first sentence, which carries every number."""
    match = re.match(r"(.+?\.)(?=\s+[A-Z]|\s*$)", description)
    return match.group(1) if match else description


def _call_claude(client, model: str, payload: list[dict[str, Any]]) -> dict[str, tuple[str, str]]:
    response = client.with_options(timeout=TIMEOUT_SECONDS, max_retries=0).messages.create(
        model=model,
        max_tokens=2000,
        system=SYSTEM,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
        messages=[{"role": "user", "content": json.dumps({"actions": payload}, ensure_ascii=False, sort_keys=True)}],
    )
    if response.stop_reason != "end_turn":
        raise ValueError(f"unexpected stop reason {response.stop_reason}")
    text = next(block.text for block in response.content if block.type == "text")
    parsed = WordingResponse.model_validate_json(text)
    expected = [item["id"] for item in payload]
    returned = [action.id for action in parsed.actions]
    if sorted(returned) != sorted(expected):
        raise ValueError("Claude returned unknown, missing or repeated action ids")
    return {action.id: (action.title, action.advice) for action in parsed.actions}


def _default_client(api_key: str):
    import anthropic  # optional dependency; ImportError falls back to templates

    return anthropic.Anthropic(api_key=api_key)


def word_recommendations(
    result: RecommendationsResult,
    patterns: PatternsResult | None,
    *,
    enabled: bool,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    client: Any = None,
) -> RecommendationsResult:
    """Return `result` with Claude's wording, or `result` unchanged on any problem.

    `client` is for tests; production passes `api_key` and the SDK client is
    built here. The key is never logged or returned.
    """
    actionable = [item for item in result.items if item.evidence_pattern_ids]
    if not enabled or not actionable or (client is None and not api_key):
        return result
    payload = _prompt_payload(result.model_copy(update={"items": actionable}), patterns)
    key = hashlib.sha256((model + json.dumps(payload, sort_keys=True)).encode("utf-8")).hexdigest()
    wording = _cache.get(key)
    if wording is None:
        try:
            wording = _call_claude(client or _default_client(api_key), model, payload)
        except (ImportError, ValidationError, ValueError, StopIteration) as exc:
            _log.warning("Claude wording rejected, using templates: %s", type(exc).__name__)
            return result
        except Exception as exc:  # SDK errors: timeout, connection, rate limit, 4xx/5xx
            _log.warning("Claude wording unavailable, using templates: %s", type(exc).__name__)
            return result
        _cache[key] = wording
        if len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    else:
        _cache.move_to_end(key)

    items = []
    for item in result.items:
        if item.id in wording:
            title, advice = wording[item.id]
            item = RecommendationAction.model_validate(
                {**item.model_dump(), "title": title, "description": f"{_evidence_sentence(item.description)} {advice}"}
            )
        items.append(item)
    return RecommendationsResult.model_validate(
        {**result.model_dump(), "items": [i.model_dump() for i in items], "limitations": [*result.limitations, LIMITATION]}
    )
