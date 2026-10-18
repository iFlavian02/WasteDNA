# Member 1 — Remaining prototype implementation plan

Updated: 2026-10-18. Owner: Member 1. Branch: `platform`.

## Goal and scope

Deliver clearer deterministic recommendations and statistical inference on existing diagnostic patterns. Core platform, analytics, simulator, report, and redistribution functionality is already implemented; extend those modules.

This replaces the completed Member 1 platform checklist. The user's revised prototype scope supersedes the proposed owner assignments and Claude/authentication tasks in [PLAN.md](../../PLAN.md). Member 1 takes responsibility for the analytics and recommendation changes below. Previous implementation records remain in Git history and module documentation.

| Remaining work | Decision |
|---|---|
| Improve recommendation titles and explanations | Implement with local deterministic templates |
| Statistical tests, BY correction, and diagnostic badges (Package 1) | Implement after the quick wording improvement |
| Integration tests and feature documentation | Required before sharing |
| External Claude integration (Package 2) | Omitted from this prototype |
| Authentication, RBAC, PII controls, and audit extension (Package 3) | Deferred; keep the existing synthetic demo-session flow |
| Presentation, rehearsals, PDF, and screencast | Other members' presentation work; outside this implementation plan |
| Partner protocol, sign-off, and new pilot KPI dashboard | Deferred from this fast prototype; presentation ownership does not establish ownership or completion of these tasks |

Baseline: fetched `origin/main` at `a6922a3` includes an optional Claude helper in `backend/app/decisions/wording.py`, but it is not integrated into orchestration. Leave it inactive; no API key, SDK installation, or external wording integration is needed.

## Working rules

- Update the branch from `main` before implementation and preserve unrelated local changes.
- Treat old fixture requests as obsolete per the user. Check newly written requests; do not revive old Claude/authentication requests.
- Member 1 owns the cross-module changes listed here for this task. Extend existing implementations rather than duplicating analytics, models, or recommendation logic. Avoid unrelated changes to other members' active work and presentation assets.
- No missing producer code has been identified. If one is discovered, stop the dependent task, identify the member and implementation step required, and write a new request in their `docs/fixtures/<area>/REQUESTS.md`.
- Document every implemented feature under `/docs`, add meaningful tests, and run them before committing. Check items only after verification.

## Step 1 — Polish deterministic recommendations

- [ ] Review existing templates in `backend/app/decisions/recommendations.py` and their rendering in Actions and Report.
- [ ] Write concise, practical titles and explanations: observed pattern, comparable baseline and support, and a concrete next action. These recommendations come from computed patterns and rules; wording changes do not require a new ML model.
- [ ] Preserve calculated values, units, IDs, evidence references, effort, ordering, simulator links, and donation prefill behavior. Separate measured evidence from suggested experiments; avoid guaranteed savings or invented production reductions.
- [ ] Improve insufficient-history/no-pattern guidance. Keep unsold surplus distinct from confirmed discarded food.
- [ ] Add/update backend decision tests for evidence and number preservation, repeatability, and insufficient data. Update frontend tests when rendering or handoffs change.
- [ ] Document template behavior and extension points in `docs/DECISIONS_MODULE.md`; mark the external wording helper inactive for this prototype.

Acceptance: Actions and Report display clear advice grounded in existing results, without external services; tests and action handoffs pass.

## Step 2 — Implement daily tests and multiple-testing correction

- [ ] Inspect the existing pattern candidate generation. Define a deterministic hypothesis family and eligibility rules before effect-based filtering, ranking, or display truncation.
- [ ] Add `backend/app/analytics/statistical_tests.py`. Aggregate group and comparable-baseline observations into daily unsold rates with positive production; missing days are not zero observations.
- [ ] Use Welch's test for disjoint date sets and paired tests for identical date sets aligned by date. Mark partially overlapping date sets unavailable unless a justified method is implemented and documented.
- [ ] Define the hypothesis, sidedness, significance threshold, support requirements, and treatment of degenerate variance before evaluating results. Return unavailable status for unsupported/nonfinite cases without crashing analysis.
- [ ] Apply `scipy.stats.false_discovery_control(..., method="by")` across all valid tests in the declared family before selecting displayed patterns. Keep unavailable inference distinct from a valid nonsignificant result.
- [ ] Preserve descriptive bootstrap intervals. Explain the difference between daily test statistics and production-weighted descriptive effects, and document temporal independence assumptions: BY adjustment does not repair invalid raw tests.
- [ ] Add `backend/tests/analytics/test_statistical_tests.py` covering known adjustment examples, paired date alignment, ordering, empty/single-day/zero-variance cases, partial overlap, and correction across candidates omitted from display.

Acceptance: available adjusted p-values are finite and in [0, 1]; correction uses the full declared family; unavailable inference leaves descriptive analysis usable.

## Step 3 — Integrate inference into API contracts and persistence

- [ ] Extend existing analytics contracts with optional `p_adj`, explicit inference status, method/threshold metadata, and limitations. Agree field names in documentation before frontend work.
- [ ] Integrate inference into the existing pattern pipeline with a documented disable option. Disabled/unavailable inference preserves descriptive results and recommendation behavior.
- [ ] Update analysis cache versioning to prevent reuse of incompatible results. Handle existing persisted responses through compatible defaults or documented invalidation.
- [ ] Update fixtures, `docs/API.md`, and exported `docs/openapi.json`. Add `docs/STATISTICAL_INFERENCE.md` describing the family, assumptions, statuses, and disable behavior.
- [ ] Add contract/API/cache tests under `backend/tests/analytics/` and `backend/tests/platform/`: disabled inference, insufficient/partial results, aggregate/component consistency, and refresh/restart persistence without retraining on reads.

Acceptance: inference survives serialization and persistence; existing datasets and unsupported data remain usable.

## Step 4 — Display understandable inference badges

- [ ] Extend `frontend/src/features/diagnostics/` with adjusted p-values and clear significant, exploratory/nonsignificant, and unavailable states.
- [ ] Explain the threshold and adjustment briefly; do not imply causation or guaranteed savings. Keep support counts, effect sizes, and descriptive intervals visible.
- [ ] Support responses without inference fields, disabled inference, and insufficient data.
- [ ] Add frontend tests for each state, missing fields, and threshold boundaries. Check the real page against backend results.

Acceptance: users can distinguish descriptive evidence from adjusted inference, and existing diagnostic states/navigation still work.

## Step 5 — Verify and hand off

- [ ] Run focused tests after each slice; before sharing, run `python -m pytest backend/tests` from the repository root.
- [ ] From `frontend`, run `node --test src/api/*.test.js src/features/platform/*.test.js src/features/diagnostics/*.test.js src/features/decisions/*.test.js src/features/redistribution/*.test.js`, `npm run lint`, and `npm run build`. Record opt-in skips explicitly.
- [ ] For contract changes, run `python scripts/export_openapi.py`; run `git diff --check`.
- [ ] Smoke-test demo import → Diagnostics → Actions → Simulator → Report against the actual backend, including refresh, insufficient history, disabled inference, and donation prefill. Verify no external LLM calls occur.
- [ ] Update `docs/PROGRESS.md` and reconcile `PLAN.md` with implemented work and explicit prototype deferrals. Document results for the presentation team without changing their assets.
- [ ] Record commands, results, commit, and unresolved issues below. Local tests do not establish deployed verification or completed presentation rehearsal.

## Progress

- 2026-10-18: Updated `platform` to fetched `origin/main` (`a6922a3`) and replaced the old plan with this prototype scope. The implementation steps above remain unstarted by this planning change.
