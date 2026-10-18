"""HTTP routes for surplus redistribution.

Member 1 registers this router with:
    app.include_router(router, prefix="/api/redistribution")

Every route except `POST /demo` requires the `X-Demo-Session-Id` header.
Domain errors become HTTPExceptions so the platform's handlers produce the
common error envelope (404 NOT_FOUND, 409 CONFLICT, 422 INVALID_DATA).
"""

from datetime import UTC, date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from app.contracts.decisions import ForecastResult
from app.redistribution import service
from app.redistribution.demo import create_demo_session
from app.redistribution.forecasts import build_forecasts
from app.redistribution.repository import Repository
from app.redistribution.schemas import (
    Donor,
    Handover,
    HandoverCreate,
    ImpactResult,
    MatchesResult,
    Offer,
    OfferCreate,
    OfferStatus,
    Organization,
    Reservation,
    ReservationCreate,
    ReservationStatus,
    RoutePlan,
    RoutePlanRequest,
    SessionCreated,
    SurplusLogCreate,
    SurplusLogEntry,
)

DEFAULT_DB_PATH = Path("backend/.runtime-redistribution/redistribution.sqlite3")
SESSION_HEADER = "X-Demo-Session-Id"

router = APIRouter(tags=["redistribution"])


def get_repository(request: Request) -> Repository:
    """One repository per app. The path comes from the platform setting
    `redistribution_db_path` when member 1 adds it; otherwise a default that is
    separate from the analytics DATA_DIR."""
    repo = getattr(request.app.state, "redistribution_repository", None)
    if repo is None:
        settings = getattr(request.app.state, "settings", None)
        repo = Repository(getattr(settings, "redistribution_db_path", None) or DEFAULT_DB_PATH)
        request.app.state.redistribution_repository = repo
    return repo


def get_now() -> datetime:
    return datetime.now(UTC)


def get_session_id(session_id: str | None = Header(default=None, alias=SESSION_HEADER)) -> str:
    if not session_id:
        raise HTTPException(status_code=404, detail="Unknown or missing demo session.")
    return session_id


def _call(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except service.NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except service.InvalidDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


Repo = Depends(get_repository)
Session = Depends(get_session_id)
Now = Depends(get_now)


@router.post("/demo", status_code=201, response_model=SessionCreated)
def start_demo(marketplace: bool = False, repo: Repository = Repo, now: datetime = Now) -> SessionCreated:
    """`?marketplace=true` also seeds the Iași restaurants of the customer map."""
    session_id = create_demo_session(repo, now, with_surplus_history=True, with_marketplace=marketplace)
    return SessionCreated(session_id=session_id, is_synthetic=True)


@router.get("/donors", response_model=list[Donor])
def donors(repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.list_donors, repo, session_id, now)


@router.get("/organizations", response_model=list[Organization])
def organizations(repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.list_organizations, repo, session_id, now)


@router.post("/offers", status_code=201, response_model=Offer)
def create_offer(body: OfferCreate, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.create_offer, repo, session_id, body, now)


@router.get("/offers", response_model=list[Offer])
def offers(
    status: OfferStatus | None = None,
    category: str | None = None,
    available_before: datetime | None = None,
    repo: Repository = Repo,
    session_id: str = Session,
    now: datetime = Now,
):
    return _call(service.list_offers, repo, session_id, now, status, category, available_before)


@router.get("/offers/{offer_id}", response_model=Offer)
def offer(offer_id: str, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.get_offer, repo, session_id, offer_id, now)


@router.get("/offers/{offer_id}/matches", response_model=MatchesResult)
def matches(offer_id: str, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.find_matches, repo, session_id, offer_id, now)


@router.post("/offers/{offer_id}/reservations", status_code=201, response_model=Reservation)
def reserve(offer_id: str, body: ReservationCreate, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.reserve, repo, session_id, offer_id, body, now)


@router.post("/offers/{offer_id}/cancel", response_model=Offer)
def cancel(offer_id: str, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.cancel_offer, repo, session_id, offer_id, now)


@router.get("/reservations", response_model=list[Reservation])
def reservations(status: ReservationStatus | None = None, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.list_reservations, repo, session_id, now, status)


@router.post("/reservations/{reservation_id}/release", response_model=Reservation)
def release(reservation_id: str, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.release, repo, session_id, reservation_id, now)


@router.post("/reservations/{reservation_id}/handover", status_code=201, response_model=Handover)
def handover(reservation_id: str, body: HandoverCreate, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.confirm_handover, repo, session_id, reservation_id, body, now)


@router.post("/routes/plan", response_model=RoutePlan)
def plan_route(body: RoutePlanRequest, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.plan_pickup_route, repo, session_id, body, now)


@router.post("/surplus-log", status_code=201, response_model=SurplusLogEntry)
def log_surplus(body: SurplusLogCreate, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.log_surplus, repo, session_id, body, now)


@router.get("/surplus-log", response_model=list[SurplusLogEntry])
def surplus_log(donor_id: str | None = None, repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    return _call(service.list_surplus_log, repo, session_id, now, donor_id)


@router.get("/forecasts", response_model=ForecastResult)
def forecasts(days: int = Query(default=7, ge=1, le=60), repo: Repository = Repo, session_id: str = Session, now: datetime = Now):
    """Per-donor surplus forecasts (member 4's `forecast_surplus`). Suggestions
    for coordinating pickups: they never create offers or reservations."""
    return _call(build_forecasts, repo, session_id, days, now)


@router.get("/impact", response_model=ImpactResult)
def impact(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    repo: Repository = Repo,
    session_id: str = Session,
    now: datetime = Now,
):
    return _call(service.impact, repo, session_id, now, date_from, date_to)
