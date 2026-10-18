# Business Orders tab

The business account’s **Orders** navigation item opens `/redistribution`. Its index screen presents surplus offers using the WiseEat card design: page title and **New offer** action, status/category filters, refresh, and a responsive offer grid.

## Offer cards

Each card shows category and weight, status, description, donor, pickup window, allergens, and a single **View details** link. The former **Find organizations** card action is intentionally not shown; matching remains available after opening an available offer’s details.

The grid displays four columns on wide screens, two below 1280 px, and one below 640 px. The standard dashboard header is hidden for this business route on desktop to match the Orders workspace design, but remains visible on mobile so the navigation drawer is reachable.

## Related routes

The existing redistribution workflows are unchanged:

- `/redistribution/new` creates an offer.
- `/redistribution/offers/:offerId` shows offer details and matching for available offers.
- `/redistribution/reservations` manages reservations and pickup.
- `/redistribution/impact` shows confirmed impact.
- `/redistribution/forecasts` shows surplus forecasts.

Deeper workflow routes retain the redistribution section navigation and synthetic-demo notice. API behavior, filters, sorting, and session persistence are unchanged.

## Verification

From `frontend/` run:

```sh
node --test src/features/redistribution/orders-layout.test.js
npm run lint
npm run build
```
