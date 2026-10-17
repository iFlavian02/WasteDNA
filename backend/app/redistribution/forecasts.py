"""Surplus forecasts for a demo session.

Thin adapter: it extracts confirmed history and calls member 4's
`forecast_surplus`; it fits no model. Kept out of `app.redistribution.__init__`
because `app.decisions` imports `app.redistribution.schemas`.

The forecast only knows donors that have history records, so donors with no
history at all are added as explicit `insufficient_data` entries instead of
disappearing. Forecasts never create offers, reservations or route stops.
"""

from datetime import datetime

from app.contracts.common import ComponentState
from app.contracts.decisions import DonorForecast, ForecastResult
from app.decisions import forecast_surplus
from app.redistribution import service
from app.redistribution.repository import Repository


def build_forecasts(repo: Repository, session_id: str, days: int, now: datetime) -> ForecastResult:
    history = service.extract_surplus_history(repo, session_id, now)
    result = forecast_surplus(history, days, generated_at=now)
    known = {item.donor_id for item in result.items}
    missing = [
        DonorForecast(
            donor_id=donor.id,
            donor_type=donor.type,
            status=ComponentState.insufficient_data,
            unit="kg",
            support_days=0,
            limitations=["No confirmed surplus history is recorded for this donor."],
        )
        for donor in service.list_donors(repo, session_id, now)
        if donor.id not in known
    ]
    items = sorted([*result.items, *missing], key=lambda item: item.donor_id)
    return result.model_copy(update={"items": items})
