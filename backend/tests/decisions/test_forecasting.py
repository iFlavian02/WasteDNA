import ast
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest

from app.contracts.common import ComponentState
from app.contracts.decisions import ForecastResult
from app.decisions import forecast_surplus
from app.decisions.forecasting import _choose_method, _split
from app.redistribution.schemas import SurplusObservation

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "docs" / "fixtures" / "decisions"
GENERATED_AT = datetime(2025, 12, 1, 8, 0, tzinfo=timezone.utc)
START = date(2025, 6, 1)


def observation(donor_id, day, quantity, complete=True, donor_type="restaurant"):
    start = datetime(day.year, day.month, day.day, 21, 0, tzinfo=timezone.utc)
    return SurplusObservation(
        donor_id=donor_id,
        donor_type=donor_type,
        date=day.isoformat(),
        interval_start=start,
        interval_end=start + timedelta(hours=1),
        observed_quantity=quantity,
        unit="kg",
        is_complete_observation=complete,
    )


def complete_history(donor_id="donor-a", days=120, seed=7, skip=()):
    """Synthetic complete daily history: weekday profile plus noise; Fridays highest."""
    rng = np.random.default_rng(seed)
    profile = [4.0, 4.0, 4.5, 5.0, 9.0, 6.0, 2.0]
    records = []
    for offset in range(days):
        if offset in skip:
            continue
        day = START + timedelta(days=offset)
        records.append(observation(donor_id, day, round(max(0.0, profile[day.weekday()] + rng.normal(0, 0.8)), 2)))
    return records


def fixture_history():
    return (
        complete_history("donor-restaurant-01", days=120)
        + [observation("donor-supermarket-01", START + timedelta(days=i), 12.0, complete=False, donor_type="supermarket") for i in range(0, 120, 2)]
        + complete_history("donor-household-01", days=30, seed=3)
    )


def test_ready_forecast_shape_and_horizon():
    result = forecast_surplus(complete_history(), 7, generated_at=GENERATED_AT)
    assert result.status == ComponentState.ready
    donor = result.items[0]
    assert donor.status == ComponentState.ready and donor.unit == "kg"
    assert donor.support_days == 120 and donor.test_days == 24
    assert [p.predicted_for for p in donor.predictions] == [START + timedelta(days=120 + i) for i in range(7)]
    assert all(p.lower <= p.upper for p in donor.predictions)
    friday = next(p for p in donor.predictions if p.predicted_for.weekday() == 4)
    sunday = next(p for p in donor.predictions if p.predicted_for.weekday() == 6)
    assert friday.predicted_quantity > sunday.predicted_quantity


def test_model_is_compared_with_baseline_on_test_days():
    donor = forecast_surplus(complete_history(), 7, generated_at=GENERATED_AT).items[0]
    assert donor.baseline == "weekday_median"
    assert donor.model in {"weekday_median", "weekday_profile_recent_level"}
    assert donor.model_mae is not None and donor.baseline_mae is not None
    assert 0 <= donor.interval_coverage_test <= 1 and donor.interval_level == 0.8


def test_insufficient_history_per_donor():
    result = forecast_surplus(complete_history(days=59), 7, generated_at=GENERATED_AT)
    assert result.status == ComponentState.insufficient_data
    donor = result.items[0]
    assert donor.status == ComponentState.insufficient_data and donor.support_days == 59
    assert donor.predictions == [] and donor.model_mae is None
    assert "minimum 60" in donor.limitations[0]


def test_offers_only_history_is_not_treated_as_total_surplus():
    records = [observation("donor-b", START + timedelta(days=i), 5.0, complete=False) for i in range(100)]
    donor = forecast_surplus(records, 7, generated_at=GENERATED_AT).items[0]
    assert donor.status == ComponentState.insufficient_data
    assert donor.support_days == 0 and donor.excluded_incomplete_days == 100
    assert "offers do not show total surplus" in donor.limitations[0]


def test_missing_days_are_not_zero_and_confirmed_zero_days_count():
    skipped = set(range(10, 40))
    gaps = forecast_surplus(complete_history(days=100, skip=skipped), 7, generated_at=GENERATED_AT).items[0]
    assert gaps.support_days == 70  # absent days are not filled in
    zeros = complete_history(days=100, skip=skipped) + [observation("donor-a", START + timedelta(days=i), 0.0) for i in skipped]
    with_zeros = forecast_surplus(zeros, 7, generated_at=GENERATED_AT).items[0]
    assert with_zeros.support_days == 100  # confirmed zero-surplus days are observations


def test_no_leakage_from_test_period_into_method_choice_and_interval():
    series = [(date.fromisoformat(r.date), r.observed_quantity) for r in complete_history()]
    train, calibration, test = _split(series)
    assert train[-1][0] < calibration[0][0] and calibration[-1][0] < test[0][0]
    assert len(train) + len(calibration) + len(test) == len(series)
    method, quantiles = _choose_method(train, calibration)
    tampered = complete_history()
    for record in tampered[len(train) + len(calibration):]:
        record.observed_quantity = record.observed_quantity * 10
    tampered_series = [(date.fromisoformat(r.date), r.observed_quantity) for r in tampered]
    t_train, t_calibration, _ = _split(tampered_series)
    # Method choice and interval width depend only on train and calibration days.
    assert _choose_method(t_train, t_calibration) == (method, quantiles)


def test_forecast_starts_after_the_latest_history_date_for_every_donor():
    history = complete_history("donor-a", days=120) + complete_history("donor-c", days=90, seed=11)
    result = forecast_surplus(history, 3, generated_at=GENERATED_AT)
    first_days = {item.predictions[0].predicted_for for item in result.items if item.status == ComponentState.ready}
    assert first_days == {START + timedelta(days=120)}


def test_mixed_units_are_rejected_without_conversion():
    records = complete_history(days=80)
    records[0] = records[0].model_copy(update={"unit": "portions"})
    donor = forecast_surplus(records, 7, generated_at=GENERATED_AT).items[0]
    assert donor.status == ComponentState.insufficient_data and "mixes units" in donor.limitations[0]


def test_empty_history():
    result = forecast_surplus([], 7, generated_at=GENERATED_AT)
    assert result.status == ComponentState.insufficient_data and result.items == []


def test_forecasting_has_no_side_effects_or_donation_writes():
    source = (ROOT / "backend" / "app" / "decisions" / "forecasting.py").read_text(encoding="utf-8")
    imported = {
        node.module if isinstance(node, ast.ImportFrom) else alias.name
        for node in ast.walk(ast.parse(source))
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    }
    assert imported <= {"collections", "datetime", "statistics", "typing", "numpy", "app.contracts.common", "app.contracts.decisions", "app.redistribution.schemas"}
    history = complete_history()
    before = [r.model_dump() for r in history]
    forecast_surplus(history, 7, generated_at=GENERATED_AT)
    assert [r.model_dump() for r in history] == before


@pytest.mark.parametrize(("name", "state"), [("forecast_ready.json", "ready"), ("forecast_insufficient_data.json", "insufficient_data")])
def test_fixtures_are_the_real_function_output(name, state):
    expected = ForecastResult.model_validate_json((FIXTURES / name).read_text(encoding="utf-8"))
    history = fixture_history() if state == "ready" else fixture_history()[120:]
    assert expected.status == state
    assert forecast_surplus(history, 7, generated_at=GENERATED_AT) == expected


def test_real_member_3_history_from_offers_is_insufficient(tmp_path):
    """Integration with member 3's extract_surplus_history on their demo session."""
    from app.redistribution import Repository, create_demo_session, extract_surplus_history

    now = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
    repo = Repository(tmp_path / "redistribution.sqlite")
    session_id = create_demo_session(repo, now, with_surplus_history=False)
    history = extract_surplus_history(repo, session_id, now)
    assert history, "member 3 demo should contain offers"
    result = forecast_surplus(history, 7, generated_at=now)
    assert result.status == ComponentState.insufficient_data
    assert result.items and all(item.status == ComponentState.insufficient_data for item in result.items)
    assert all(item.excluded_incomplete_days > 0 for item in result.items)


def test_real_member_3_confirmed_surplus_log_gives_ready_forecasts(tmp_path):
    """With member 3's donor-confirmed daily surplus log, donors with at least
    60 complete days are ready; the 30-day household stays insufficient."""
    from app.redistribution import Repository, create_demo_session, extract_surplus_history

    now = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
    repo = Repository(tmp_path / "redistribution.sqlite")
    session_id = create_demo_session(repo, now, with_surplus_history=True)
    history = extract_surplus_history(repo, session_id, now)
    result = forecast_surplus(history, 7, generated_at=now)

    assert result.status == ComponentState.ready
    by_type = {item.donor_type: item for item in result.items}
    assert set(by_type) == {"restaurant", "supermarket", "household"}
    for donor_type, days in (("restaurant", 90), ("supermarket", 75)):
        item = by_type[donor_type]
        assert item.status == ComponentState.ready
        assert item.support_days == days
        assert item.unit == "kg"
        assert len(item.predictions) == 7
        assert item.model_mae is not None and item.baseline_mae is not None
        assert item.model_mae <= item.baseline_mae
        assert all(p.lower <= p.predicted_quantity <= p.upper for p in item.predictions)
    household = by_type["household"]
    assert household.status == ComponentState.insufficient_data
    assert household.support_days == 30
    assert not household.predictions
