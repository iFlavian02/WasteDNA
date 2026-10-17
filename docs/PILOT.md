# Pilot preparation: redistribution with real partners

**Status: planning document.** The current application is a synthetic demo. Real donors, organizations, addresses or contacts must not be entered until every prerequisite below is complete. The pilot can start after the M2 demo is finished.

## Scope

The first pilot covers one restaurant or supermarket donor and one receiving organization. Household donors join only after the receiving organizations have defined what they accept from households (see "Household donors").

## Prerequisites before real data

| Requirement | Owner | Status |
|---|---|---|
| Authentication, plus authorization by role (donor, organization, coordinator) and resource ownership, replacing the demo session header | Member 1 (infrastructure), member 3 (rules per route) | not started |
| Choice of identity provider and the written operational rules, documented before implementation | Team + partners | not started |
| Addresses and contacts visible only to the parties to a reservation; none in public responses | Member 3 | not started |
| Persistent audit log of handovers (who confirmed, quantity, time) | Member 3 (the `transitions` table already records state changes) | partial |
| Retention period for donation records, separate from the 24 h analytics cache | Team + partners | not started |
| Tests showing that cross-account and cross-organization access is rejected and that personal data is absent from public responses | Member 3 | not started |
| Operational checklist complete | Coordinator | not started |

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
