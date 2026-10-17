"""Optional Claude wording: every failure gives the identical deterministic result.

No network: a fake client stands in for the Anthropic SDK.
"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.contracts.analytics import PatternsResult
from app.contracts.decisions import RecommendationsResult
from app.decisions import build_recommendations, word_recommendations
from app.decisions import wording

ROOT = Path(__file__).resolve().parents[3]
PATTERNS = PatternsResult.model_validate_json((ROOT / "docs" / "fixtures" / "analytics" / "patterns_ready.json").read_text(encoding="utf-8"))
RESULT = build_recommendations(PATTERNS)


class FakeClient:
    """Mimics `client.with_options(...).messages.create(...)`."""

    def __init__(self, reply=None, error=None, stop_reason="end_turn"):
        self.reply, self.error, self.stop_reason = reply, error, stop_reason
        self.calls = []
        self.messages = self

    def with_options(self, **options):
        self.options = options
        return self

    def create(self, **request):
        self.calls.append(request)
        if self.error:
            raise self.error
        text = self.reply if isinstance(self.reply, str) else json.dumps(self.reply)
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=text)])


def good_reply(result=RESULT):
    return {"actions": [{"id": item.id, "title": f"Plan smaller batches {chr(65 + i)}", "advice": "Check the plan the day before and prepare less for these services."} for i, item in enumerate(result.items)]}


@pytest.fixture(autouse=True)
def empty_cache():
    wording._cache.clear()
    yield
    wording._cache.clear()


def test_fixture_has_actions_to_word():
    assert RESULT.items and all(item.evidence_pattern_ids for item in RESULT.items)


def test_valid_wording_keeps_ids_numbers_effort_and_opportunity():
    client = FakeClient(good_reply())
    worded = word_recommendations(RESULT, PATTERNS, enabled=True, client=client)
    assert worded is not RESULT
    for before, after in zip(RESULT.items, worded.items):
        assert after.id == before.id and after.effort == before.effort
        assert after.evidence_pattern_ids == before.evidence_pattern_ids
        assert after.opportunity_ron_per_30_days == before.opportunity_ron_per_30_days
        assert after.title.startswith("Plan smaller batches")
        # Numbers come only from the deterministic evidence sentence.
        evidence = wording._evidence_sentence(before.description)
        assert after.description.startswith(evidence) and after.description.endswith("prepare less for these services.")
    assert worded.limitations[-1] == wording.LIMITATION
    assert client.options == {"timeout": 8.0, "max_retries": 0}


def test_prompt_contains_only_ids_effort_factors_and_metrics():
    client = FakeClient(good_reply())
    word_recommendations(RESULT, PATTERNS, enabled=True, client=client)
    request = client.calls[0]
    sent = json.loads(request["messages"][0]["content"])
    assert {item["id"] for item in sent["actions"]} == {item.id for item in RESULT.items}
    keys = {key for item in sent["actions"] for key in item}
    assert keys == {"id", "current_title", "effort", "evidence"}
    assert "api_key" not in json.dumps(request) and request["model"] == wording.DEFAULT_MODEL


@pytest.mark.parametrize(
    "client",
    [
        FakeClient(error=TimeoutError("timed out")),
        FakeClient(error=ConnectionError("network")),
        FakeClient(reply="not json"),
        FakeClient(reply={"actions": []}),
        FakeClient(reply={"wrong": True}),
        FakeClient(good_reply(), stop_reason="refusal"),
        FakeClient(good_reply(), stop_reason="max_tokens"),
    ],
    ids=["timeout", "api-error", "invalid-json", "missing-actions", "wrong-shape", "refusal", "truncated"],
)
def test_failures_return_the_identical_deterministic_result(client):
    assert word_recommendations(RESULT, PATTERNS, enabled=True, client=client) is RESULT


def test_unknown_or_repeated_id_is_rejected():
    reply = good_reply()
    reply["actions"][0]["id"] = "action-invented"
    assert word_recommendations(RESULT, PATTERNS, enabled=True, client=FakeClient(reply)) is RESULT
    reply = good_reply()
    reply["actions"].append(dict(reply["actions"][0]))
    assert word_recommendations(RESULT, PATTERNS, enabled=True, client=FakeClient(reply)) is RESULT


@pytest.mark.parametrize("field,text", [("title", "Cut Friday mains by 20%"), ("advice", "Prepare 5 fewer portions on rainy days.")])
def test_any_digit_from_claude_is_rejected(field, text):
    reply = good_reply()
    reply["actions"][0][field] = text
    assert word_recommendations(RESULT, PATTERNS, enabled=True, client=FakeClient(reply)) is RESULT


def test_flag_off_or_missing_key_never_calls_claude(monkeypatch):
    client = FakeClient(good_reply())
    assert word_recommendations(RESULT, PATTERNS, enabled=False, client=client) is RESULT
    monkeypatch.setattr(wording, "_default_client", lambda key: pytest.fail("must not build a client without a key"))
    assert word_recommendations(RESULT, PATTERNS, enabled=True, api_key=None) is RESULT
    assert word_recommendations(RESULT, PATTERNS, enabled=True, api_key="") is RESULT
    assert client.calls == []


def test_missing_sdk_falls_back(monkeypatch):
    def no_sdk(key):
        raise ImportError("No module named 'anthropic'")

    monkeypatch.setattr(wording, "_default_client", no_sdk)
    assert word_recommendations(RESULT, PATTERNS, enabled=True, api_key="test-key") is RESULT


def test_insufficient_data_result_is_not_sent():
    collect = build_recommendations(PatternsResult(status="insufficient_data", items=[], limitations=["Too few days."]))
    client = FakeClient(good_reply(collect))
    assert word_recommendations(collect, None, enabled=True, client=client) is collect
    assert client.calls == []


def test_cache_by_input_and_model():
    first = FakeClient(good_reply())
    word_recommendations(RESULT, PATTERNS, enabled=True, client=first)
    second = FakeClient(error=TimeoutError())
    cached = word_recommendations(RESULT, PATTERNS, enabled=True, client=second)
    assert second.calls == [] and cached.items[0].title.startswith("Plan smaller batches")
    other_model = word_recommendations(RESULT, PATTERNS, enabled=True, client=second, model="claude-sonnet-5-5")
    assert len(second.calls) == 1 and other_model is RESULT


def test_result_still_satisfies_the_contract():
    worded = word_recommendations(RESULT, PATTERNS, enabled=True, client=FakeClient(good_reply()))
    RecommendationsResult.model_validate(worded.model_dump())
