# WiseEat UI plan

Branch: `ui`. One person works on the whole frontend there, including files that other members own in `docs/team/README.md`. Nothing reaches `main` until the team agrees. Step progress is tracked at the end of this file.

## Product

WiseEat has two roles:

- **Business:** a restaurant manager uploads sales data and sees how much money unsold food costs. They read the statistics and recommendations, then sell leftovers as discounted deals. They set the portions on offer, the normal price and the discount.
- **Customer:** opens a live map of nearby restaurants with discounted leftovers, picks a deal, reserves a number of portions and collects them with a pickup code.

The charity donation flow (matching, organizations, routes, handover, charity impact) is **no longer part of the demo**. Its backend stays as it is and is not removed; the UI simply stops showing it.

## Design direction

- **Brand:** WiseEat. The logo will probably change. Everything brand-related lives in `frontend/src/brand/` (see `docs/UI.md`), so a new logo means swapping one component and the favicon.
- **Palette** from the logo: deep forest green (sidebar, headings, primary buttons), leaf and lime greens (accents and "free"/positive states), and a warm off-white background with white cards. One warm coral/amber accent is reserved for money lost and discounts.
- **Type:** Nunito (variable, self-hosted through `@fontsource-variable/nunito`).
- **Layout:** a dark green sidebar on desktop and a bottom tab bar on phones, with a Business / Customer switch. No login in the demo.
- **Icons:** `lucide-react`. Food categories use illustrated icon tiles rather than photos.
- **Expressive moments:** the money-lost hero on the dashboard and the live map. Everything else stays calm.

## Routes

| Role | Route | Page |
|---|---|---|
| Business | `/business` | Dashboard: upload/demo onboarding, money lost, statistics, deal figures |
| Business | `/business/upload` | Choose another dataset |
| Business | `/business/deals` | Post deals (food → price → review), manage active deals, customer pickups |
| Business | `/business/insights` | Diagnostics (patterns, model check, dish groups) |
| Business | `/business/actions/*` | Recommendations, simulator, printable report |
| Customer | `/map` | Live map with discounted deals and a synced list |
| Customer | `/map/deal/:id` | Deal detail and reservation |
| Customer | `/my-pickups` | The customer's reservations and pickup codes |

Old routes (`/upload`, `/summary`, `/diagnostics`, `/decisions/*`, `/redistribution/*`) redirect to the new ones.

## Business dashboard

- Before any data: an onboarding card with CSV upload, template download and "Try with demo data". Row errors from the API appear inline.
- A **money lost** hero: `unsold_cost_ron`, with `monthly_equivalent_unsold_cost_ron` below and the line "unsold does not mean thrown away".
- Stat cards: prepared, sold, unsold, unsold rate, period.
- A daily trend chart (`summary.daily`), top dishes by unsold cost (`top_dishes`) and analysis progress pills.
- Previews of the top patterns and actions.
- Deal figures: active deals, portions reserved today, revenue recovered from collected portions.
- A "Sell today's leftovers" shortcut that prefills the deal form with a dish.
- A "Simulated data" badge whenever the demo dataset is loaded.

## Business deals

- **Post a deal in three steps:**
  1. **Food:** dish (from `summary.dishes` or typed), category, allergens, portions available, pickup window.
  2. **Price:** normal price per portion, discount by slider or 30/50/70% presets, with the final price and saving shown live. Free is a separate option. The discount is capped at 90%.
  3. **Review:** a preview of the customer card and map pin, then **Publish**.
- **Active deals:** portions left out of the total, time left, current price. Actions: edit price or discount while the deal is live (with a version check), pause, end.
- **Pickups:** customer reservations with a short code. The business marks each one collected.

## Customer map

- Leaflet with free OSM/CARTO tiles (no API key).
- Pins are coloured by discount band, with a discount label and a pulse for deals closing soon. The user's position is shown if they allow location; otherwise the map centres on Iași.
- A list panel on desktop and a draggable bottom sheet on phones. The list and pins stay in sync.
- Filters: distance, category, discount, closing soon. The map refreshes every 15 s; there is no push channel.
- **Reserve:** choose a number of portions (1 up to the portions left, set by the owner) and confirm. The confirmation shows the pickup code, address and window. Payment happens at pickup; there is no card form.

## Backend additions (redistribution module)

These extend the existing offers instead of replacing them.

1. Optional `price_original_ron` and `price_ron` on offers. The server derives `discount_pct`. Priced offers require `portions_available`, and the server validates prices and the 90% cap. Offers without prices behave as before.
2. `PATCH /offers/{id}` for price, discount and pause, with an optimistic `version` check (409 on conflict).
3. `GET /deals`: available priced offers with restaurant name, location, discount and portions left. Filters: category and distance from a lat/lon.
4. Customer reservations: `POST /deals/{id}/reservations` with `{ customer_name, portions, idempotency_key }`. It decrements portions atomically and returns a pickup code. Also `GET /deals/reservations` and a collect action.
5. Seed about 12–15 synthetic Iași restaurants with a mix of deals, all labelled synthetic.
6. Tests for prices, the discount cap, version conflicts, the race for the last portion and idempotent retries.

## UX rules

- WCAG AA contrast (4.5:1 for text), a visible focus ring, full keyboard use including the map list, and a skip link.
- Tap targets of at least 44 px, layouts from 360 px wide, no horizontal page scroll.
- Every view has loading, empty (with a next step) and error (with retry) states.
- One primary action per screen. Status is never shown by colour alone.
- Romanian formatting (RON, kg, Europe/Bucharest times). `prefers-reduced-motion` turns off pulses and chart animations.
- Synthetic-data labels stay visible.

## Build steps

- [x] 1. Foundation: tokens, Nunito, WiseEat brand component, sidebar and bottom-bar shell with role switch, new routes and legacy redirects, new state components.
- [ ] 2. Business dashboard on existing data.
- [ ] 3. Backend: prices, PATCH, deals listing, customer reservations, seed data, tests.
- [ ] 4. Business deals page.
- [ ] 5. Customer map, reservation, my pickups.
- [ ] 6. Restyle insights/actions/report, accessibility and responsive pass, docs.

Each step: tests, `npm run lint`, `npm run build`, docs update, commit to `ui`.
