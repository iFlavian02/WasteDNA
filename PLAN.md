# Remaining Implementation Plan: WasteDNA

This document contains only the **unimplemented and deferred tasks** from the original WasteDNA development plan. All core M1 (descriptive analytics, gradient boosting, TreeExplainer SHAP, empirical simulator, actions, printable reports, React shell) and core M2 features (hourly operational imports, KMeans clustering, donation matching, atomic reservations, pickup routing, surplus forecasting, and synthetic demo flows) are complete and verified.

The remaining tasks are organized below into modular work packages designed for redistribution among the four team members.

---

## Team Redistribution Matrix (Proposed)

| Package | Area | Primary Focus | Candidate Owner | Dependencies |
|---|---|---|---|---|
| **Package 1** | Statistics & Inference | Benjamini–Yekutieli FDR control (`p_adj`) for pattern discovery | **Member 2** (Diagnostics / Analytics) | None (builds on existing patterns) |
| **Package 2** | LLM Synthesis | Optional Claude-powered recommendation copywriting behind `LLM_ENABLED` flag | **Member 4** (Decisions & Generator) | Anthropic API key; fallback to templates |
| **Package 3** | Security & RBAC | Production authentication, role-based access control, PII masking & audit log | **Member 1** (Platform & Infrastructure) | Redistribution API |
| **Package 4** | Pilot Protocol & Rehearsal | Partner onboarding protocol, pilot metrics dashboard & live pitch rehearsal | **Member 3** & **Member 4** (Redistribution & Pitch) | Deployed app & `DEMO_SCRIPT.md` |

---

## Work Packages to Implement

### Package 1: Multiple Testing & FDR Correction (`p_adj`)
*Original reference: Step 2.4 (P2)*

* [ ] **Candidate Hypothesis Family & Statistical Tests:**
  * Define the candidate testing family deterministically before evaluating group effects.
  * Implement two-sample comparisons on daily waste rates:
    * Welch's t-test for disjoint date sets between group and comparable baseline.
    * Paired t-test when identical dates appear in both group and baseline subsets.
    * Mark tests as unavailable when group support or variance is insufficient.
* [ ] **Benjamini–Yekutieli (BY) FDR Adjustment:**
  * Collect valid raw p-values across the candidate family and adjust using SciPy: `scipy.stats.false_discovery_control(p_values, method="by")`.
  * Return `p_adj` and inferential classification labels in `PatternsResult` alongside the existing descriptive percentile bootstrap confidence intervals.
  * Document the temporal independence assumptions and caveats in the API responses and documentation.
* [ ] **Frontend Inference Badges:**
  * Update `frontend/src/features/diagnostics/` pattern cards to display `p_adj` badges when available, clearly distinguishing exploratory patterns from statistically significant ones.
* [ ] **Verification Criteria:**
  * Unit tests in `backend/tests/analytics/test_statistical_tests.py`:
    * $p_{\text{adj}} \in [0, 1]$ across all valid candidate tests.
    * Zero variance or single-day edge cases handled cleanly without exceptions.
    * Core diagnostic engine works unchanged when inferential statistics are disabled or unavailable.

---

### Package 2: LLM-Assisted Action Synthesis (Claude API Integration)
*Original reference: Step 4.2 (P2)*

* [ ] **Backend Claude Client & Structured Prompting:**
  * Add an optional LLM client in `backend/app/decisions/` active only when `LLM_ENABLED=true` (requiring `ANTHROPIC_API_KEY`).
  * Construct prompts containing strictly validated numeric outputs and pattern IDs from the deterministic pipeline (never send raw CSV rows, user identifiers, or database content).
  * Request concise action titles, operational rationale, and category action tags without permitting the model to introduce ungrounded numbers.
* [ ] **Schema Validation, Caching & Fallback:**
  * Validate Claude responses against Pydantic model `RecommendationAction`.
  * Implement an 8-second timeout, exponential retry limit, and persistent cache keyed by `(pattern_hash, model_version)`.
  * In case of timeout, invalid JSON, API rate limits, unknown pattern IDs, or missing keys, fall back immediately and transparently to the existing deterministic template actions.
* [ ] **Frontend Transparency:**
  * Display an indicator badge on recommendation cards when copy has been synthesized by the LLM versus the default deterministic templates.
* [ ] **Verification Criteria:**
  * Unit tests in `backend/tests/decisions/test_llm_recommendations.py`:
    * Mocked timeout, malformed JSON, and unknown IDs cleanly fall back to deterministic templates.
    * No raw credentials, prompts, or unvalidated figures leak into frontend responses or application logs.
    * Full application flow functions identically when `LLM_ENABLED=false`.

---

### Package 3: Production Authentication, RBAC & PII Masking
*Original reference: Step 11.2 (Security foundation)*

* [ ] **Production Identity & Token Authentication:**
  * Replace the synthetic demo header (`X-Demo-Session-Id`) in production mode with standard JWT token authentication (FastAPI security OAuth2 / Bearer scheme).
  * Maintain backward compatibility with demo sessions for testing and unauthenticated public demo walkthroughs.
* [ ] **Role-Based Access Control (RBAC):**
  * Define explicit roles and permissions:
    * **Donor** (Restaurant, Supermarket, Household): Create and cancel own offers, log verified surplus, inspect own forecasts.
    * **Organization** (Charity, Food Bank): Browse eligible available offers, execute reservations, generate pickup routes, confirm handovers.
    * **Admin**: View aggregate system metrics and manage organization verification.
  * Enforce strict tenant isolation: cross-tenant mutations (e.g. reserving or cancelling another party's offer) return HTTP 403 Forbidden.
* [ ] **PII Protection & Data Privacy:**
  * Mask donor exact addresses, telephone numbers, and contact names on public and unreserved offer listings.
  * Expose sensitive contact details only to the specific organization that holds an active, confirmed reservation.
* [ ] **Tamper-Evident Handover Audit Log:**
  * Add a dedicated, persistent SQLite audit table recording all handover events (timestamp, donor user ID, organization user ID, reservation ID, offered quantity, verified received quantity, and digital acknowledgement).
* [ ] **Verification Criteria:**
  * Tests in `backend/tests/platform/test_auth_rbac.py` and `backend/tests/redistribution/test_auth_isolation.py`:
    * Unauthenticated requests to protected endpoints return 401 Unauthorized.
    * Cross-tenant resource manipulation returns 403 Forbidden.
    * Public listings omit personal addresses and phone numbers.
    * Handover records persist across application restarts with immutable audit trails.

---

### Package 4: Partner Pilot Protocol, Tracking & Pitch Rehearsal
*Original reference: Step 7.1 (item 2) & Step 11.2 (Pilot operational readiness)*

* [ ] **Pilot Protocol & Partner Operational Checklist (`docs/PILOT.md`):**
  * Formalize bilateral acceptance criteria for pilot partners (one restaurant, one supermarket, and one charity partner):
    * Accepted vs prohibited food categories and allergen disclosure policies.
    * Cold-chain and food safety transport responsibilities.
    * Criteria and inspection protocol for household donor drop-offs.
* [ ] **Pilot Tracking & KPI Dashboard:**
  * Add monitoring views / queries for key pilot metrics:
    * Time from offer publication to charity reservation.
    * Acceptance rate of generated offers.
    * Total received kilograms vs planned surplus.
    * Missed pickup incident logging with root cause attribution.
    * Counterfactual waste prevention metric (comparing surplus-to-production ratios across comparable operating periods).
* [ ] **Live Pitch Rehearsal & Contingency Assets (`docs/DEMO_SCRIPT.md`):**
  * Execute two consecutive end-to-end dry runs following the 3-minute pitch timing in `docs/DEMO_SCRIPT.md`.
  * Verify full state persistence across browser refresh and backend restarts during rehearsal.
  * Export and archive a finalized printable PDF report for the demo restaurant.
  * Record a standalone, offline screencast video of the complete walkthrough as a pitch backup.
* [ ] **Verification Criteria:**
  * Completed partner sign-off checklist recorded in `docs/PILOT.md`.
  * All items in `docs/DEMO_SCRIPT.md` rehearsal checklist verified and checked.
  * Zero browser console errors and sub-second UI transitions measured during consecutive runs.

---

## Affected Files for Remaining Implementation

* `backend/app/analytics/statistical_tests.py` — Welch/paired tests and Benjamini–Yekutieli FDR adjustment
* `backend/tests/analytics/test_statistical_tests.py` — statistical test suite
* `backend/app/decisions/llm_client.py` — Claude API integration and template fallback
* `backend/tests/decisions/test_llm_recommendations.py` — LLM client and prompt validation tests
* `backend/app/auth/{models,service,dependencies}.py` — JWT authentication and RBAC dependency injection
* `backend/app/redistribution/audit.py` — handover audit log repository
* `backend/tests/platform/test_auth_rbac.py` — auth and access control tests
* `frontend/src/features/diagnostics/` — inferential significance badges
* `frontend/src/features/decisions/` — LLM synthesized indicator badges
* `frontend/src/features/redistribution/` — PII masking and authenticated state handling
* `docs/PILOT.md` — partner protocol and pilot operations criteria
* `docs/DEMO_SCRIPT.md` — rehearsal records and backup artifact locations
* `docs/team/*.md` — task assignment updates once redistribution is confirmed
