"""Filtered dashboard breakdown route."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.breakdown import breakdown
from app.services.storage import DatasetStore

router = APIRouter()


@router.get("/datasets/{dataset_id}/breakdown")
def dataset_breakdown(
    request: Request,
    dataset_id: str,
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    category: str | None = Query(default=None, min_length=1, max_length=100),
    time_slot: Literal["lunch", "dinner"] | None = None,
):
    """Return production-cost breakdowns for a selected dataset period."""
    if start and end and start > end:
        raise HTTPException(400, "`from` must not be after `to`.")
    try:
        record = DatasetStore(request.app.state.settings).get(dataset_id)
    except KeyError:
        raise HTTPException(404, "Dataset not found or expired.") from None
    return breakdown(record, start, end, category, time_slot)
