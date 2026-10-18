# Business Orders tab

The business account’s **Orders** navigation item opens `/redistribution`, a customer-sales workspace for leftover food. It is not a donation workflow: the frontend does not load charities, find organization matches, create reservations, or expose handover and impact screens.

## Listing discounted food

Choose **New order** and provide:

- the selling location and product name;
- food category, allergens, storage, total weight, and available portions;
- the regular per-portion price and discount percentage;
- the pickup start and deadline;
- confirmation that the listing details are correct.

The form calculates the customer price to the nearest ban and publishes both `price_ron` and `original_price_ron` through `POST /api/redistribution/offers`. Product, portion count, regular price, and a discount above 0% and below 100% are required. A customer price below 0.01 lei is rejected, so this screen cannot create a free or unpriced listing.

## Orders grid and details

`/redistribution` lists priced offers only. Each card shows product, customer and regular prices, discount, seller, stock, pickup window, and allergens. Status/category filters and refresh continue to use the existing offer API.

`/redistribution/offers/:offerId` shows sale details and allows an available product to be removed from sale. It never calls the organization matching or reservation APIs. Unknown or old unpriced records are rejected from this business view.

The grid displays four columns on wide screens, two below 1280 px, and one below 640 px. The dashboard header stays hidden on desktop and visible on mobile so the navigation drawer remains reachable.

## Verification

From `frontend/` run:

```sh
node --test src/features/redistribution/logic.test.js src/features/redistribution/orders-layout.test.js
npm run lint
npm run build
```
