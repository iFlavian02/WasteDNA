# Demo script: three minutes

Owner: member 4, who coordinates rehearsal. **Every number below is real API output** after `POST /api/datasets/demo` (the 180-day `data/demo/restaurant_demo_synthetic.csv` with `data/context/context_daily.csv`) and `POST /api/redistribution/demo`, measured on 2026-10-17 on `main` 694f3ee plus member 4's operations fixtures. Re-measure after any change to the generator, analytics or orchestration.

The sales are **simulated**. Say so on screen and out loud. Weather and calendar dates are real; their effect on the sales is simulated.

Each section names the page in the shell, with the API call behind it in brackets.

## 0:00–0:20 Problem

"An Iași restaurant prepares food every day without knowing what will sell. WasteDNA explains where unsold food comes from, helps plan better quantities, and routes the surplus that remains to charities."

## 0:20–0:50 Upload and summary (member 1)

On `/upload`, click **Load demo data**, then open `/summary`. [`POST /api/datasets/demo`, then `GET /api/datasets/{id}/summary`]

- Badge: **Simulated sales**. 180 days (1 June – 27 November 2025), 16 dishes, lunch and dinner.
- 96,687 portions prepared, 79,829 sold, **16,858 unsold (17.4%)**, about **157,464 RON** production cost.
- Monthly equivalent: about **26,244 RON** per month.
- Say: "Unsold does not mean thrown away; we only count what we can prove."
- Top dish by unsold cost: Tochitură moldovenească (21,072 RON).

## 0:50–1:30 Diagnostic (member 2)

Open `/diagnostics`. [`GET /api/datasets/{id}/patterns`, `/model`, `/clusters`]

- Three patterns, each compared with the same dish or category in other conditions:
  - Mains on Fridays: 31% unsold vs 15% (+16.5 pp, 25 days).
  - Daily menu during the university break: 48% vs 9% (+39.3 pp, 91 days). The break dates come from the official UAIC calendar.
  - Desserts on rain days: 41% vs 16% (+24.5 pp, 46 days). Rain comes from real Open-Meteo history.
- Model check on the last 36 days, which it never saw: model error 15.1 pp vs 16.3 pp for the simple baseline. "We show the baseline even when it wins."
- Unusual batches: 23 residual alerts, including all 5 batches we planted in the simulated data (the planted list is never shown to the model).
- Dish profiles: two groups of similar dishes (10 and 6).
- Say: "These are associations, not proven causes."

## 1:30–2:00 Actions (member 4)

Open `/decisions/actions`. [`GET /api/datasets/{id}/recommendations`]

| Action | Effort | Indicative opportunity |
|---|---|---|
| Prepare fewer portions of main dishes on Fridays | medium | about 2,312 RON / 30 days |
| Plan dish-05 (daily menu) quantities ahead during university break | medium | about 2,221 RON / 30 days |
| Plan dessert dishes quantities ahead on rain days | high | about 828 RON / 30 days |

Say: "Each action links to its pattern. These are not guaranteed savings, and we never add them together."

## 2:00–2:30 Simulator (member 4)

Click **Try it in the simulator** on the Friday action, or open `/decisions/simulator` and select Tochitură (dish-06), Friday, dinner. [`POST /api/datasets/{id}/simulate` with `{"dish_id":"dish-06","weekday":"Friday","time_slot":"dinner","requested_quantity":24}`]

- Based on 25 Friday dinners. Today's typical batch is **31 portions**: about 9.2 portions unsold per service, and almost never short.
- Move the slider to **24 portions**:
  - Unsold drops to about **2.8** per service.
  - About **112 RON less production cost per service**.
  - Trade-off: at least 0.7 portions short on average, and some shortage on at least 16% of Fridays.
- The warning shows: some Fridays sold out, so real shortage may be higher.
- The slider moves locally, with no request per move.

## 2:30–2:55 Redistribution (member 3)

[`POST /api/redistribution/demo`, then offers → matches → reservation → handover, as in `docs/fixtures/redistribution/README.md`]

- The surplus that remains becomes an offer.
- Show the matched charity and the reasons why it fits and others don't.
- Reserve it, then confirm the handover.
- Impact counts only kilograms actually received.
- Forecasts (`/redistribution/forecasts`, if shown): from donor-confirmed daily surplus logs. The restaurant (90 days) and supermarket (75 days) get 7-day forecasts; the household (30 days) honestly shows `insufficient_data`. Say that for the restaurant the simple weekday baseline is as good as the model (MAE 0.86 kg both), and the model is only slightly better for the supermarket (1.93 vs 1.96 kg).
- Optional, from the actions page: **Offer the surplus to a charity** opens the offer form with category and description only. The donor enters the real kilograms and pickup window.

## 2:55–3:00 Close

"Explain the waste, plan quantities, redistribute the rest. Every number shows its evidence and its limits."

## Rehearsal checklist

- [x] Member 1: orchestration serves recommendations, the model and clusters; the demo route loads the full 180-day CSV with context.
- [x] All pages are built and registered in the shell.
- [x] Every number re-measured through the API after integration (2026-10-17).
- [x] Every number checked on screen in the UI (actions, simulator, report; 2026-10-17).
- [x] Report print rules checked: header, navigation and buttons are hidden; the synthetic label and units remain.
- [ ] Synthetic badges visible on every restaurant screen.
- [ ] Runs offline with the LLM disabled.
- [ ] Two full runs in a row, including a page refresh.
