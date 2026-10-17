# Member 2 — Waste diagnostics and ML

Branch: `feature/waste-diagnostics`. Read [coordination and ownership](README.md). Deliver independently callable analysis functions and, later, the diagnostic dashboard.

## Rules for agents working in parallel

These plans are independently developable after a shared contract setup, not completely dependency-free. A separate branch prevents neither incompatible interfaces nor conflicting edits by itself.

1. Before dependent implementation, confirm the shared setup checkpoint: API request/response shapes, CSV columns and units, internal function signatures, common errors/states, and small example fixtures are agreed and committed to `main`. Record that commit in your Progress section and update your branch from it. The planned 30–45 minutes is an estimate, not automatic approval that setup is complete.
2. If the checkpoint is incomplete, continue isolated work in your owned area and identify the exact missing contract to its owner. Do not invent a competing interface or wait for another member's entire plan to finish.
3. Work only in your assigned files and branch. Request changes to shared files from their owner; record an agreed ownership transfer before editing outside your scope. Agents running simultaneously on one machine need separate worktrees/checkouts; never switch branches in a shared working directory while another agent is using it.
4. Use agreed fixtures or injected test doubles for unavailable dependencies. Keep them explicit and confined to tests or fixture mode; never return mock results as a normal successful analysis or silently replace a failed upload. Implement the real integration when the producer's module is available.
5. Treat contracts as shared agreements. Coordinate field/signature changes with affected owners before implementation, update schemas/examples and documentation through their owners, and do not fork or duplicate another member's production logic.
6. Hand off small completed slices with the interface, example input/output, verification results and remaining dependencies. Integrate through small pull requests and bring merged `main` changes into your branch regularly, within the session's Git permissions. Branch completion is not a prerequisite for integration.
7. Track implementation, fixture-based verification and real integration separately in Progress. Do not mark a cross-member feature complete until it works with the actual modules. When blocked on one dependency, continue other owned tasks and report the specific blocker.

Your dependencies: Develop patterns and ML directly against agreed sample CSVs or small valid local tables. You do not need a running API or the full generated dataset. Member 1 supplies validated data during integration; member 4 supplies the full synthetic dataset later. Publish your result schemas and pattern fixtures early so members 1 and 4 can proceed.

## Master-plan responsibility

Own 2.1–2.4, calculation/evaluation portions of 3.1–3.4, analysis portions of 8.1, and clustering in 8.2. Member 1 exposes results and manages jobs/cache; member 4 generates datasets and owns recommendations, simulator and future surplus forecasts. Support 0.2 with fit/SHAP compatibility checks and 11.1 with evidence for the pitch.

## Owned files

`backend/app/contracts/analytics.py`, `backend/app/analytics/*`, `backend/tests/analytics/*`, `docs/fixtures/analytics/*`, `frontend/src/features/diagnostics/*`. Put clustering here rather than the earlier proposed flat `services/clustering.py` path.

## Build sequence

### 1. Contracts and descriptive patterns

- [x] Define `PatternsResult`, `ModelResult`, `ClustersResult` with member 1. Supply ready/insufficient fixtures first, including complete anomaly and explanation fields.
- [x] Implement `analyze_patterns(rows, context)` with comparable baselines, support thresholds, weighted rates, effect pp and stable ranking/deduplication from the master plan.
- [x] Tests: 20% to 30% is +10 pp/+50% relative; zero baseline; insufficient support; shuffled input; overlapping patterns not summed. Use small local input tables while member 4 builds the full demo.
- [x] Handoff: a ready result with stable pattern IDs for member 4 recommendations, plus invocation instructions for member 1.

### 2. Evaluated model and anomalies

- [ ] Implement `analyze_model(rows, context)` with temporal 60/20/20 split, training-only preprocessing and baseline comparison. Never use sales, surplus or generator truth as prediction features.
- [ ] Compute SHAP with bounded samples and residual anomalies using calibration-derived thresholds. Preserve valid outputs if explanations fail; distinguish unavailable from empty findings.
- [ ] Tests: disjoint dates, no leakage, unknown categories, metrics reproducible from stored predictions, SHAP additivity, anomaly false alarms and recovery on synthetic data.
- [ ] Coordinate artifact serialization with member 1; fitting belongs here, persistent execution/cache belongs to member 1.
- [ ] Verification: `pytest backend/tests/analytics` from repository root; record model versus baseline results, even if baseline wins.

### 3. Diagnostic frontend

- [ ] Build an exported diagnostic page in the owned feature directory with pattern cards, support/baseline details, anomaly timeline, model evaluation and explanation views.
- [ ] Use member 1's client and shared shell; handle partial/insufficient/error states. Show synthetic labels and association limitations.
- [ ] Verify against fixtures, then actual uploaded data; verify refresh does not retrain. Run frontend lint/build after merging the shared shell.

### 4. Later depth

- [ ] Bootstrap on days and optional BY only in the master-plan priority order. Add hourly diagnostic logic once member 1 validates operational records and member 4 supplies fixtures.
- [ ] Implement `cluster_profiles(rows)` and clustering UI with the specified support, standardization, seed, silhouette selection and singleton rejection. Test constant/insufficient data and distinct profiles.

## Avoid overlap

No HTTP routes, CSV upload parser, donation matching, production cache, simulator, recommendations or surplus forecast implementation here. Descriptive patterns and anomalies are your domain; member 4 consumes your outputs for decisions. Ask member 4 to change generator signals instead of editing their scripts.

## Progress

Record completed item, commit, verification command/result and remaining dependency here.

- 2026-10-17 — Completed build sequence 1 on top of shared foundation commit
  `fa42985` and contract decision commit `ec92c30` (implementation commit
  pending). Added strict analytics contracts, ready/insufficient fixtures,
  deterministic descriptive pattern analysis, focused tests, and invocation
  notes in `docs/fixtures/analytics/README.md`.
- Verification: `pytest backend/tests/analytics backend/tests/platform` — 22
  passed (19 analytics and 3 platform); one upstream Starlette/httpx deprecation
  warning. `git diff --check` passed.
- Remaining dependency: validate the ready pattern fixture with member 4's
  recommendation consumer and run the same function against member 1's real
  validated DataFrame during integration. The full member 4 synthetic dataset
  is not required for the completed fixture-based slice.
