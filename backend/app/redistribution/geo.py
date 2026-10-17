"""Distance and local-time helpers for redistribution."""

from datetime import date, datetime, timedelta
from math import asin, cos, radians, sin, sqrt
from zoneinfo import ZoneInfo

from app.redistribution.schemas import WEEKDAYS, Location, Organization

BUCHAREST = ZoneInfo("Europe/Bucharest")
EARTH_RADIUS_KM = 6371.0088


def distance_km(a: Location, b: Location) -> float:
    """Great-circle (haversine) distance; not a road distance."""
    lat1, lon1, lat2, lon2 = map(radians, (a.lat, a.lon, b.lat, b.lon))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


def local(value: datetime) -> datetime:
    return value.astimezone(BUCHAREST)


def service_date(value: datetime) -> date:
    """Local calendar day used for daily organization capacity."""
    return local(value).date()


def opening_intervals(org: Organization, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """Concrete opening intervals of `org` that overlap [start, end], in local time."""
    intervals = []
    day = local(start).date()
    while day <= local(end).date():
        for window in org.opening_hours.get(WEEKDAYS[day.weekday()], []):
            opened = datetime.combine(day, window.open, BUCHAREST)
            closed = datetime.combine(day, window.close, BUCHAREST)
            if opened < end and closed > start:
                intervals.append((opened, closed))
        day += timedelta(days=1)
    return intervals


def first_open_window(org: Organization, start: datetime, end: datetime) -> tuple[datetime, datetime] | None:
    """Earliest non-empty intersection of [start, end] with the opening hours."""
    for opened, closed in opening_intervals(org, start, end):
        lo, hi = max(opened, local(start)), min(closed, local(end))
        if lo < hi:
            return lo, hi
    return None


def is_open_at(org: Organization, moment: datetime) -> bool:
    return any(opened <= moment <= closed for opened, closed in opening_intervals(org, moment, moment))
