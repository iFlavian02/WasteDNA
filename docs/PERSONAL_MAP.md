# Personal account: food map of Iași

The personal account (`/personal`, see [ACCOUNTS.md](ACCOUNTS.md)) is a live map of Iași. Every restaurant or shop that has published surplus food is a circle on the map. Clicking a circle opens that place's page, which lists what it has on sale. The data comes from the redistribution backend (member 3); nothing on these pages is hard-coded.

| Route | Page |
|---|---|
| `/personal` | The map, plus a **Nearby** list (nearest first, with item count, cheapest price, best discount and distance) |
| `/personal/places/:donorId` | A place's page: name, type, distance, a small map, and **On sale now** (soonest pickup first) |

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

## Map

[Leaflet](https://leafletjs.com) 1.9 through `react-leaflet` 5, with OpenStreetMap's standard tiles. CARTO's basemaps now need an API key and only return a placeholder. The OSM tile policy requires the attribution, so keep it.

- **Circles** are Leaflet `divIcon`s built by `markerHtml(place)`: initials (dark green for restaurants, blue for shops), an offer-count badge and a name label with the cheapest price. Names are HTML-escaped.
- Circles are **focusable**; Enter or a click opens the place's page.
- **Labels** are hidden below zoom 14, where they overlap. They still appear on hover and focus.
- On first load the view **fits** all places plus the user's position (the blue "You" dot, Centru, `USER_LOCATION`).

## Code (`frontend/src/features/personal/`)

| File | Role |
|---|---|
| `index.jsx` | Default export, mounted by the shell at `/personal/*` with `{ api, sessionId }`; one `useFoodMap` shared by both pages |
| `useFoodMap.js` | Loads donors and available offers, polls, and returns `{ places, fresh, donors, offers, loadedAt, ready, loading, error, reload }`. `fresh` holds places that gained an offer on the latest poll; a new session never counts as new. |
| `places.js` | Pure logic: `placesFromOffers`, `placeById`, `placesWithNewOffers`, `distanceKm`, `discountPct`, `formatRon` ("12,50 lei"), `pickupLabel` (Bucharest time), `allergenText`, `categoryLabel`, `displayName` (drops "Demo …" and "(synthetic)"; the pages show a **Demo data** badge instead), `markerHtml`, `placePath`. Constants: `IASI_CENTER`, `USER_LOCATION`, `POLL_MS` |
| `CityMap.jsx` | The Leaflet map (`places`, `fresh`, `onOpen`, `still` for the small fixed map on a place page) |
| `FoodMap.jsx`, `PlacePage.jsx` | The two pages |
| `personal.css` | Page, list, circle and place styles |

The Leaflet code is in the lazy `personal` chunk, so the business pages don't load it.

To show a place somewhere else, use `placesFromOffers(donors, offers)` and `<CityMap places={…} onOpen={…} />`. To change the city or user position, change `IASI_CENTER` and `USER_LOCATION`.

## Not in this demo

- Customers can't reserve or pay online yet; the place page says to pay and collect at the restaurant. Reservations in the backend are for receiving organizations, not customers.
- The user's position is fixed, not taken from the browser.

## Verification

```bash
# frontend
node --test "src/**/*.test.js"      # places.test.js, client.test.js (session start path, one session for concurrent calls)
npm run lint && npm run build
# backend
python -m pytest backend/tests/redistribution/test_marketplace.py
```
