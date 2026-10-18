# Personal account: food map and orders

The personal account (`/personal`, see [ACCOUNTS.md](ACCOUNTS.md)) is a live map of Iași. Every restaurant or shop that has published surplus food is a circle on the map. Clicking a circle opens that place's page, which lists what it has on sale, each item with **Order now**. The **Orders** tab shows the order history with pickup codes. All data comes from the redistribution backend; nothing on these pages is hard-coded.

| Route | Page |
|---|---|
| `/personal` | The map, plus a **Nearby** list (nearest first, with item count, cheapest price, best discount and distance) |
| `/personal/places/:donorId` | A place's page: name, type, distance, a small map, and **On sale now** (soonest pickup first, portions left, **Order now**) |
| `/personal/orders` | **Orders**: "To collect" (soonest pickup first, with pickup code and Cancel) and "History" (newest first), plus the count and money spent |

## Where the data comes from

1. The shell creates **one demo session** for both accounts with `POST /api/redistribution/demo?marketplace=true` and keeps its ID in `localStorage` under `wiseeat-demo-session-id` ([FRONTEND_SHELL.md](FRONTEND_SHELL.md)).
2. `?marketplace=true` seeds six synthetic Iași restaurants with priced offers (`data/demo/redistribution/marketplace.json`). Their pickup windows are relative to "now", so the map is never empty at demo time. The usual demo donors (Bistro Copou, Market Păcurari) appear too.
3. The map reads `GET /donors` and `GET /offers?status=available` every **15 s** (`POLL_MS`) and when the tab regains focus.
4. A place is shown when it has at least one **live** offer: `status: "available"` and a pickup deadline in the future. **Households are never shown**, because their location is a private home.

Because both accounts share the session, an offer that the business account publishes at **Tracked items → New offer** (`/redistribution/new`) appears on the customer's map within 15 seconds. Its circle and list row pulse for a few seconds.

## Prices

Offers have two optional fields, both in RON (backend: `app/redistribution/schemas.py`):

| Field | Meaning |
|---|---|
| `price_ron` | Customer price for one portion, or for the whole offer when `portion_count` is null |
| `original_price_ron` | Regular price, used for the discount. Requires `price_ron`, and must be ≥ `price_ron` |

Both are `null` for donation offers and for offers stored before the fields existed. The page then shows "Price not set". The business form has "Sale price" and "Regular price" inputs. They are only sent when filled in (`validateOffer` in `features/redistribution/logic.js`).

## Ordering

1. **Order now** on an item opens a modal dialog (`OrderDialog.jsx`, a native `<dialog>`: focus trap and Esc). It shows the pickup window, a portion stepper (1 up to the portions left, at most 10 per order) and the live total with the regular price struck through. An offer without portions is ordered whole.
2. **Confirm order** sends `POST /offers/{id}/orders` as the personal account's `customerId` (`customer-lena-hoffmann` in `accounts.js`), with one idempotency key per attempt. A double click or retry never orders twice; changing the portions starts a new attempt.
3. The dialog then shows **Order placed** with the 4-character **pickup code**, and links to **View my orders**. The map data reloads, so the item shows fewer portions left. A sold-out item disappears from the page and the map, and a place with nothing left disappears from the map.
4. A `409` (someone bought the last portions first) shows the reason in the dialog and reloads the data.

Payment happens at pickup; the demo takes no payment. In the **Orders** tab, a placed order can be cancelled (two-step "Cancel order" → "Yes, cancel") until its pickup window ends, and its portions go back on sale. Statuses come from the pickup window: *Pickup from 17:00*, *Ready for pickup until 19:30*, *Pickup window ended*, *Cancelled*. They refresh every 30 s. Backend rules and fields: [API.md § Customer orders](API.md#customer-orders).

## Map

[Leaflet](https://leafletjs.com) 1.9 through `react-leaflet` 5, with OpenStreetMap's standard tiles. CARTO's basemaps now need an API key and only return a placeholder. The OSM tile policy requires the attribution, so keep it.

- **Circles** are Leaflet `divIcon`s built by `markerHtml(place)`: initials (dark green for restaurants, blue for shops), an offer-count badge and a name label with the cheapest price. Names are HTML-escaped.
- Circles are **focusable**; Enter or a click opens the place's page.
- **Labels** are hidden below zoom 14, where they overlap. They still appear on hover and focus.
- **Stacking:** `.food-map-card` sets `z-index: 0; isolation: isolate` so Leaflet's own z-indexes (400–1000) stay inside the card and never cover the sticky header or the mobile sidebar. Keep this if you restyle the card.
- On first load the view **fits** all places plus the user's position (the blue "You" dot, Centru, `USER_LOCATION`).

## Code (`frontend/src/features/personal/`)

| File | Role |
|---|---|
| `index.jsx` | Default export, mounted by the shell at `/personal/*` with `{ api, sessionId }`; one `useFoodMap` and one orders load shared by all pages |
| `useFoodMap.js` | Loads donors and available offers, polls, and returns `{ client, places, fresh, donors, offers, loadedAt, ready, loading, error, reload }`. `fresh` holds places that gained an offer on the latest poll; a new session never counts as new. |
| `places.js` | Pure logic: `placesFromOffers`, `placeById`, `placesWithNewOffers`, `distanceKm`, `discountPct`, `formatRon` ("12,50 lei"), `pickupLabel` (Bucharest time), `allergenText`, `categoryLabel`, `displayName` (drops "Demo …" and "(synthetic)"; the pages show a **Demo data** badge instead), `markerHtml`, `placePath`. Constants: `IASI_CENTER`, `USER_LOCATION`, `POLL_MS` |
| `CityMap.jsx` | The Leaflet map (`places`, `fresh`, `onOpen`, `still` for the small fixed map on a place page) |
| `FoodMap.jsx`, `PlacePage.jsx` | The map and the place page (with Order now) |
| `OrderDialog.jsx` | The Order now dialog |
| `OrdersPage.jsx` | The Orders tab |
| `orders.js` | Pure order logic: `maxPortions`, `clampPortions`, `orderTotal`, `orderState`, `canCancel`, `splitOrders`, `ordersSummary`, `totalText`, `portionsText`, `formatOrderedAt` |
| `personal.css` | Page, list, circle and place styles |

The Leaflet code is in the lazy `personal` chunk, so the business pages don't load it.

To show a place somewhere else, use `placesFromOffers(donors, offers)` and `<CityMap places={…} onOpen={…} />`. To change the city or user position, change `IASI_CENTER` and `USER_LOCATION`.

## Not in this demo

- No online payment: customers pay at pickup. The business side has no screen yet to see incoming orders or mark them collected.
- The user's position is fixed, not taken from the browser.

## Verification

```bash
# frontend
node --test "src/**/*.test.js"      # places.test.js, orders.test.js, client.test.js (session start path, one session for concurrent calls)
npm run lint && npm run build
# backend
python -m pytest backend/tests/redistribution/test_marketplace.py backend/tests/redistribution/test_orders.py
```
