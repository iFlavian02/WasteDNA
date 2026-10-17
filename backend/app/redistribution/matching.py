"""Rule-based offer → organization eligibility with readable reasons.

This is a deterministic filter, not a trained model. All mandatory rules are
evaluated so a rejection lists every failing reason. Eligible organizations
are ranked by distance, then organization ID (the deadline is the same for all
candidates of one offer). Across offers, urgency is the earliest deadline; see
`offer_urgency_key`.
"""

from datetime import datetime

from app.redistribution.geo import distance_km, first_open_window, local
from app.redistribution.schemas import EligibleMatch, MatchesResult, Offer, Organization, PickupWindow, RejectedMatch


def evaluate(offer: Offer, org: Organization, now: datetime, committed_kg: float) -> EligibleMatch | RejectedMatch:
    """Check one organization for one offer.

    `committed_kg` is the organization's capacity already used on the offer's
    service day by active reservations and confirmed handovers (excluding this
    offer)."""
    accepted, rejected = [], []

    if offer.category in org.accepted_categories:
        accepted.append(f"Accepts {offer.category}")
    else:
        rejected.append(f"Does not accept category: {offer.category}")

    if offer.allergens is None:
        rejected.append("Allergens unknown: automatic matching blocked until the donor declares them")
    else:
        blocked = sorted(set(offer.allergens) & set(org.excluded_allergens))
        if blocked:
            rejected.append(f"Does not accept declared allergen: {', '.join(blocked)}")
        else:
            accepted.append("Declared allergens are accepted" if offer.allergens else "No declared allergens")

    missing = sorted(set(offer.storage_requirements) - set(org.storage_capabilities))
    if missing:
        rejected.append(f"Cannot store or transport: {', '.join(missing)}")
    elif offer.storage_requirements:
        accepted.append(f"Can store at {', '.join(offer.storage_requirements)} conditions")

    distance = distance_km(offer.location, org.location)
    if distance <= org.max_pickup_radius_km:
        accepted.append(f"Within pickup radius ({distance:.1f} km of {org.max_pickup_radius_km:g} km)")
    else:
        rejected.append(f"Outside pickup radius ({distance:.1f} km > {org.max_pickup_radius_km:g} km)")

    remaining = max(0.0, org.daily_capacity_kg - committed_kg)
    if offer.quantity_kg <= remaining + 1e-9:
        accepted.append(f"Daily capacity available ({remaining:g} kg)")
    else:
        rejected.append(f"Insufficient daily capacity ({remaining:g} kg left, offer is {offer.quantity_kg:g} kg)")

    window = None
    if now >= offer.pickup_deadline:
        rejected.append("Pickup deadline has passed")
    else:
        window = first_open_window(org, max(offer.available_from, now), offer.pickup_deadline)
        if window is None:
            rejected.append("Not open during the pickup window")
        else:
            accepted.append("Open during the pickup window")

    if rejected:
        return RejectedMatch(organization_id=org.id, reasons=rejected)
    return EligibleMatch(
        organization_id=org.id,
        distance_km=round(distance, 2),
        capacity_available_kg=round(remaining, 3),
        pickup_window=PickupWindow(from_=window[0], to=window[1]),
        reasons=accepted,
    )


def match_offer(offer: Offer, organizations: list[Organization], now: datetime, committed: dict[str, float]) -> MatchesResult:
    """Evaluate all organizations; `committed` maps organization ID → used kg."""
    eligible, rejected = [], []
    for org in organizations:
        outcome = evaluate(offer, org, now, committed.get(org.id, 0.0))
        (eligible if isinstance(outcome, EligibleMatch) else rejected).append(outcome)
    eligible.sort(key=lambda match: (match.distance_km, match.organization_id))
    rejected.sort(key=lambda match: match.organization_id)
    return MatchesResult(offer_id=offer.id, eligible=eligible, rejected=rejected)


def offer_urgency_key(offer: Offer) -> tuple[datetime, str]:
    """Sort key across offers: earliest pickup deadline first, then ID."""
    return local(offer.pickup_deadline), offer.id
