# Demo script: three minutes (draft)

Owner: member 4, who coordinates rehearsal. **Every restaurant number below is real output** of the current functions on `data/demo/restaurant_demo_synthetic.csv` with `data/context/context_daily.csv`, measured on 2026-10-17 on `main` 2d231aa plus member 4's forecast slice.

The sales are **simulated**. Say so on screen and out loud. Weather and calendar dates are real; their effect on the sales is simulated.

Screens are named by the planned pages. **The frontend does not exist yet** (member 1 step 4). Until it does, rehearse with the API calls in brackets. Re-measure every number once orchestration and the UI are integrated, and update this file.

## 0:00–0:20 Problem

"An Iași restaurant prepares food every day without knowing what will sell. WasteDNA explains where unsold food comes from, helps plan better quantities, and routes the surplus that remains to charities."

## 0:20–0:50 Upload and summary (member 1)

Click **Load demo data**. [`POST /api/datasets/demo`, then `GET /api/datasets/{id}/summary`]

- Badge: **Simulated sales**. 180 days (1 June – 27 November 2025), 16 dishes, lunch and dinner.
- 96,545 portions prepared, 79,837 sold, **16,708 unsold (17.3%)**, about **156,237 RON** production cost.
- Monthly equivalent: about **26,040 RON** per month.
- Say: "Unsold does not mean thrown away; we only count what we can prove."
- Top dish by unsold cost: Tochitură moldovenească (20,608 RON).

## 0:50–1:30 Diagnostic (member 2)

[`GET /api/datasets/{id}/patterns`, `/model`]

- Three patterns, each compared with the same dish or category in other conditions:
  - Mains on Fridays: 31% unsold vs 15% (+16.6 pp, 25 days).
  - Daily menu during the university break: 48% vs 9% (+39.3 pp, 91 days). The break dates come from the official UAIC calendar.
  - Desserts on rain days: 41% vs 16% (+24.5 pp, 46 days). Rain comes from real Open-Meteo history.
- Model check on the last 36 days, which it never saw: model error 15.0 pp vs 16.2 pp for the simple baseline. "We show the baseline even when it wins."
- Say: "These are associations, not proven causes."

## 1:30–2:00 Actions (member 4)

[`GET /api/datasets/{id}/recommendations`. **Waits for member 1 step 3 orchestration**; today, call `build_recommendations(analyze_patterns(rows, context))` directly.]

| Action | Effort | Indicative opportunity |
|---|---|---|
| Prepare fewer portions of main dishes on Fridays | medium | about 2,332 RON / 30 days |
| Plan dish-05 (daily menu) quantities ahead during university break | medium | about 2,221 RON / 30 days |
| Plan dessert quantities ahead on rain days | high | about 826 RON / 30 days |

Say: "Each action links to its pattern. These are not guaranteed savings, and we never add them together."

## 2:00–2:30 Simulator (member 4)

Select Tochitură (dish-06), Friday, dinner. [`POST /api/datasets/{id}/simulate` with `{"dish_id":"dish-06","weekday":"Friday","time_slot":"dinner","requested_quantity":24}`]

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
- Forecasts (if shown): on the demo session they honestly report `insufficient_data`, because offers alone do not show a donor's total surplus.

## 2:55–3:00 Close

"Explain the waste, plan quantities, redistribute the rest. Every number shows its evidence and its limits."

## Rehearsal checklist

- [ ] Member 1: orchestration serves recommendations and the model; the demo route loads the full 180-day CSV with context.
- [ ] All pages are built and registered in the shell.
- [ ] Every number re-measured through the UI after integration.
- [ ] Synthetic badges visible on every restaurant screen.
- [ ] Runs offline with the LLM disabled.
- [ ] Two full runs in a row, including a page refresh.
