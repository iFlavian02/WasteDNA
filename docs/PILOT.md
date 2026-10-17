# Pilot preparation: redistribution with real partners

**Status: planning document.** The current application is a synthetic demo. Real donors, organizations, addresses or contacts must not be entered until every prerequisite below is complete. The pilot can start after the M2 demo is finished.

## Scope

The first pilot covers one restaurant or supermarket donor and one receiving organization. Household donors join only after the receiving organizations have defined what they accept from households (see "Household donors").

## Prerequisites before real data

| Requirement | Owner | Status |
|---|---|---|
| Authentication, plus authorization by role (donor, organization, coordinator) and resource ownership, replacing the demo session header | Member 1 (infrastructure), member 3 (rules per route) | rules proposed below; awaiting member 1's agreement |
| Choice of identity provider and the written operational rules, documented before implementation | Team + partners | not started (requested from member 1) |
| Addresses and contacts visible only to the parties to a reservation; none in public responses | Member 3 | not started |
| Persistent audit log of handovers (who confirmed, quantity, time) | Member 3 (the `transitions` table already records state changes) | partial |
| Retention period for donation records, separate from the 24 h analytics cache | Team + partners | not started |
| Tests showing that cross-account and cross-organization access is rejected and that personal data is absent from public responses | Member 3 | not started |
| Operational checklist complete | Coordinator | not started |

## Proposed authorization model (member 3 proposal, to agree with member 1)

The demo's `X-Demo-Session-Id` is not authentication: anyone holding the ID can act as every donor and organization. For real partners it is replaced by signed-in accounts. Member 1 owns the identity infrastructure (provider, sessions, tokens). Member 3 owns the per-route rules below, enforced in `backend/app/api/redistribution.py` and the service layer.

**Roles.** An account belongs to exactly one party:

| Role | Linked to | Purpose |
|---|---|---|
| `donor` | one `Donor` | publishes offers and confirms daily surplus |
| `organization` | one `Organization` | finds, reserves and receives food |
| `coordinator` | the pilot team | operational oversight, no impersonation |

**Permissions per route** (✓ allowed, own = only records the account's party owns or is party to):

| Action | donor | organization | coordinator |
|---|---|---|---|
| Create, list or cancel offers | own | — | list all, cancel with reason |
| `GET /offers` (available) | own | available offers within its radius, without the donor's exact address | all |
| `GET /offers/{id}/matches` | own offers | — | ✓ |
| Reserve, release | — | own reservations | release with reason |
| Confirm handover | — | own reservations | — |
| `POST/GET /surplus-log` | own | — | read |
| `GET /impact` | own totals | own totals | all |
| `GET /forecasts` | own | aggregated by area, no donor identity | all |
| Plan route | — | own reservations | ✓ |

**Data visibility:**
- Exact addresses and contacts are shown to the other party only after a reservation exists, and only until handover or release.
- Before that, an organization sees the distance and area, not the address.
- No personal data in public responses or logs. IDs stay opaque.

**Audit.** Every state change (offer, reservation, handover) is already recorded in the `transitions` table. For the pilot, add the acting account ID to each transition. Handover confirmations must name the confirming organization account.

**Retention.**
- Donation records are kept for the pilot period plus an agreed review window.
- They are separate from the 24 h analytics cache.
- Deleting an account anonymizes its records; it does not change confirmed quantities.

**Tests required before real data:**
- Cross-account access returns `404` (not `403`, to avoid revealing existence).
- An organization cannot reserve for another organization.
- A donor cannot confirm a handover.
- No address appears before a reservation.
- Every transition has an actor.

## To validate with partners

Confirm these with each partner before go-live. Base them on the requirements that apply at that time; this document does not assert any legal or food-safety rule.

- Food categories accepted, and items never accepted.
- Information required with each offer. In the app today this is the category, the declared allergens (unknown allergens block automatic matching), storage and transport conditions, the quantity in kg, and the pickup window.
- Responsibilities for transport and storage: who collects, which vehicle and storage conditions are used, and who keeps the cold chain for chilled or frozen food.
- Who confirms the received quantity, and how refused or partially accepted food is recorded. Only the confirmed received kg counts as impact.
- Opening hours, daily capacity in kg and maximum pickup radius for each organization.
- What happens when a pickup is missed, and how a reservation is released in time.

## Pilot protocol and metrics

Record these separately from the demo:

| Metric | Definition |
|---|---|
| Time to publish | From surplus identified to offer created |
| Acceptance rate | Offers reserved ÷ offers published |
| Received kg | Sum of confirmed handovers. Offered and reserved kg are reported separately. |
| Missed pickups | Reservations expired or released, with the reason |
| Rejections | Matching rejection reasons, by frequency |

For prevention, compare the restaurant's surplus as a share of production across comparable periods. Do not attribute the difference to the application automatically, because other changes may explain it.

## Household donors

The demo already includes a household donor. A real household pilot activates only after the receiving organizations have defined their acceptance criteria for household food. Until then, household offers with unknown allergens stay unmatched.

## Results log

Record the criteria, the responsible people and the outcomes here, kept separate from the demo results.
