# Implementation Plan: WasteDNA Hackathon Application

## Goal & Scope

### Four-person execution

For the four-person team, use [the team coordination plan](docs/team/README.md) and its four member plans. They assign ownership and replace the sequential scheduling below with parallel tracks; the feature formulas, safeguards, and acceptance criteria below still apply. All four start with backend/data/analysis work, then build their assigned frontend modules. Member 3 can develop the synthetic redistribution demo alongside M1; advanced M2 work and real pilot activation remain later milestones. No delivery date for all M2 features is implied.

### Objective

O aplicație web cu două direcții: **prevenirea risipei prin diagnostic explicabil** și **redistribuirea surplusului către organizații caritabile**. Diagnosticul analizează vânzările, meniul, programul și istoricul surplusului unui restaurant din Iași: CSV → cost și tipare → explicații ML/anomalii/clustere → acțiuni → simulator → raport. Redistribuirea conectează supermarketuri, restaurante și gospodării cu organizații compatibile: ofertă confirmată → matching explicabil → rezervare → traseu de colectare → predare confirmată. Prognozele ajută la planificarea colectărilor, fără a crea automat donații. Datele comerciale demo sunt sintetice și marcate ca atare. Backendul este Python/FastAPI; frontendul React **JavaScript simplu** cu Vite (`react`, fișiere `.js/.jsx`).

Livrare în două milestone-uri: M1 păstrează diagnosticul și programul existent de 18 ore; M2 adaugă clustering, date operaționale detaliate și redistribuirea. M2 este parte din dezvoltarea planificată, cu timp estimat separat după M1; nu se presupune că toate funcțiile încap în cele 18 ore.

### Success Criteria

* URL-ul public oferă fluxul complet prin „Încarcă datele demo”, inclusiv cu LLM dezactivat.
* Un CSV propriu valid produce rezultate proprii; un CSV invalid produce erori pe linii. Nu se substituie fixtures sau demo unui upload eșuat.
* `/api/health` pe backendul deployat importă pandas, sklearn, shap și întoarce versiunile; frontendul deployat îl apelează fără eroare CORS.
* Costurile provin din costul per porție; tiparele arată un reper comparabil, efectul și suportul; modelul este evaluat pe date ulterioare antrenării.
* Simulatorul actualizează local curba în <1 s și declară explicit că vânzările pot subestima cererea reală.
* Raportul printabil funcționează fără servicii externe; aplicația pornește din instrucțiunile README într-un mediu curat.
* M2: diagnosticul separă tiparele recurente, anomaliile și clusterele; fiecare concluzie arată datele, reperul, suportul și limitele explicației.
* M2: o ofertă de la fiecare tip de donator poate fi potrivită cu o organizație eligibilă; expirarea, capacitatea și incompatibilitățile sunt respectate, inclusiv la rezervări simultane.
* M2: demo-ul parcurge ofertă → matching → rezervare → traseu fezabil → predare; impactul include numai cantitatea efectiv predată, o singură dată.
* M2: prognozele sunt evaluate temporal față de un baseline și separate vizual de ofertele confirmate; lipsa istoricului nu produce predicții fabricate.

### Out of Scope

În M1: autentificare și redistribuire operațională. În ambele milestone-uri: mai multe localuri per dataset analitic, contabilitate/stocuri complete, optimizare cauzală a producției, estimarea cererii pierdute reale, promisiuni de economii, chatbot, PDF server-side, model pentru evenimente fără suport repetat. M2 permite mai mulți donatori în modulul de donații, păstrând analiza separată per local. Demo-ul M2 folosește identități și locații sintetice; operarea cu persoane și donații reale necesită etapa de pregătire a pilotului de mai jos. Claude și testele multiple sunt P2: nu blochează livrarea.

---

## Architecture & Technical Decisions

### Toolchain Baseline

* Python 3.11, FastAPI/Pydantic 2, pandas/NumPy/SciPy, scikit-learn, SHAP, pytest/httpx; un worker backend și maximum o analiză grea activă.
* React + Vite **JavaScript**, React Router, Recharts, linterul deja instalat în scaffold (`npm run lint`, de regulă Oxlint). Nu adăuga TypeScript, `openapi-typescript`, `typecheck`, fișiere `.ts/.tsx` sau tipuri generate.
* OpenAPI se exportă din Pydantic pentru documentare și teste de contract; frontendul folosește `src/api/client.js` și validează stările/răspunsurile folosite.
* Fixează versiunile după smoke test-ul real Python + SHAP; păstrează `package-lock.json` și dependențele Python fixate.

### Data Contract

Un rând CSV = `(date, dish_id, time_slot)` unic. Obligatorii: `date` YYYY-MM-DD, `dish_id`, `dish_name`, `category`, `time_slot` (`lunch|dinner`), `prepared_qty`, `sold_qty`, `unit_cost_ron`. Opționale: `unit_price_ron`, `stockout_confirmed`. Cantități întregi `0≤sold≤prepared`; cost finit `>0`. Nume, categorie și cost consecvente per preparat. UTF-8/BOM, virgulă sau punct și virgulă detectate explicit; fișierele ambigue sunt respinse.

Limită inițială: 5 MiB, 20.000 rânduri, 30 preparate, 366 zile. Validează toate rândurile; erorile au linie, cod, mesaj, iar avertismentele includ acoperirea slabă. Nu transforma zilele lipsă în cerere zero.

### Calculations & Inference

* `surplus=P−S`; `cost_surplus=surplus×unit_cost`; `rata_globală=Σsurplus/ΣP` (null dacă `ΣP=0`); `cost_lunar_echivalent=Σcost_surplus / zile_calendaristice × 30`. Se afișează „surplus nevândut”, nu „mâncare aruncată”.
* Tipare: maximum două condiții inițial; `dish+context` versus același preparat în restul contextelor, `category+context` versus aceeași categorie (mixul de preparate poate influența efectul). Rate ponderate `Σsurplus/ΣP`; efect în puncte procentuale (pp), plus efect relativ numai când reperul >0. Minime: 12 zile și 100 porții în fiecare grup/reper; afișează `n_rows` și `n_days`.
* Oportunitate orientativă: `max(0,rata_grup−rata_reper)×Σ_grup(P×cost)/zile_calendaristice×30`. Nu însuma tipare suprapuse și nu prezenta oportunitatea drept economie garantată.
* Bootstrap pe **zile**, seed fix, 500 replicări, interval percentilic 95% descriptiv; nu îl numi test statistic ajustat. Familia inferențială și corecția BY pentru teste suprapuse sunt extensii P2, doar dacă ipotezele testelor sunt documentate.
* ML: target `surplus/P` pe rândurile `P>0`; features disponibile înainte de vânzare: preparat/categorie, zi, interval, P planificat, vreme, eveniment, perioadă universitară. Niciodată `sold`, `surplus`, cost rezultat sau cererea latentă. Split după date distincte: 60% train, 20% calibration, 20% test; encoder/imputer doar pe train. Raportează MAE model și baseline per preparat/interval, pe test.
* GradientBoostingRegressor mic; SHAP TreeExplainer pe matricea transformată, background ≤100 rânduri train, explicate ≤200 rânduri calibration+test. Agregă contribuțiile one-hot înapoi pe factor; indică acoperirea. Anomaliile pozitive folosesc reziduuri **test** față de centru/MAD calculate în calibration, nu reziduuri train. Factorii sunt asocieri, nu cauze dovedite.

### Local Context & Provenance

Demo: seed 42, 180 zile (2025-06-01–2025-11-27), 16 preparate, două intervale, trei semnale recurente + zgomot și anomalii plantate în test. Generează cererea latentă numai pentru verificări; vânzările sunt `min(P,D)`. Vremea folosită la generare este același snapshot folosit la analiză.

Open-Meteo Historical Weather pentru Iași, snapshot local și metadate sursă. Calendarul pelerinajului și al universității intră doar după verificarea anului și intervalului în surse primare; situațiile inventate au `is_synthetic=true`. Data unui eveniment real nu dovedește că a cauzat vânzările simulate. Demo-ul funcționează offline după pregătirea fișierelor.

### API, State & Ownership

| Rută | Rezultat |
|---|---|
| `GET /api/health`, `/api/template.csv` | stivă/versiuni; șablon CSV |
| `POST /api/datasets`, `/api/datasets/demo` | `dataset_id` opac, metadata, stare; upload invalid 422/413 |
| `GET /api/datasets/{id}` | metadata + stări `summary/patterns/model/explanations/anomalies/recommendations` |
| `GET /api/datasets/{id}/{summary|patterns|explanations|anomalies|recommendations}` | rezultate calculate sau stări `running/insufficient_data/error` |
| `POST /api/datasets/{id}/simulate` | selecție, suport, ipoteze, punct și curba pentru slider |

Modele Pydantic pentru răspunsuri, fixtures validate cu aceleași modele, `ApiError {code,message,details,request_id}`. Resursa în curs: 202; insuficientă: 200 + stare și listă goală; necunoscută/expirată: 404/410. Hash-ul cache include CSV canonic, context, praguri și versiunea pipeline. Sumar disponibil imediat; analiza grea rulează o singură dată la import, cu stări parțiale. Date runtime în `DATA_DIR/{id}`, salvare atomică, TTL 24 h, maximum 3 dataseturi; ID-ul nu intră niciodată în calea fișierelor fără validare.

### Simulator & Recommendations

Pentru `dish_id+weekday+time_slot`, folosește ≥8 zile; fallback anunțat `dish_id+time_slot` cu ≥12 zile; altfel `insufficient_data`. Cu vânzări istorice `S_j`, cantitate nouă `P` și reper `P0=mediana(P_j)`:

`waste_proxy(P)=mean(max(P−S_j,0))`; `shortage_lower_bound(P)=mean(max(S_j−P,0))`; `risk_lower_bound(P)=mean(S_j>P)`; `production_cost_change=(P0−P)×unit_cost`. Curba este **lei/serviciu**, nu lei/lună. Dacă `sold=prepared` ori epuizare confirmată, marchează cererea cenzurată: riscul/lipsa pot fi mai mari, iar surplusul estimat poate fi supraevaluat. Nu calcula profit sau cantitate „optimă” garantată.

Recomandări P0 deterministe din cifre și pattern IDs; maximum trei, efort `low/medium/high`, fără sumarea oportunităților suprapuse. Claude P2 primește numai JSON cu metrici calculate, propune texte/coduri de acțiune fără cifre noi, iar Pydantic validează. Timeout/eroare/JSON invalid → șabloane. Cheia rămâne exclusiv pe backend.

### Delivery Policy

Etapele 0–5 până la ora 13; **feature freeze la ora 13**. Orele 13–15 pentru bug-uri/deploy, 15–18 pentru rezervă și pitch. P0: upload, sumar, tipare descriptive, fallback recomandări, simulator, raport. P1: bootstrap, ML/SHAP/anomalii. P2: Claude și inferență BY. Dacă SHAP nu rulează pe host, arată explicit o importanță calculată alternativ, fără eticheta SHAP.

Aceste priorități și ore se aplică M1. Pentru M2: obligatorii sunt contractele, matching-ul determinist, rezervările și confirmarea predării; urmează clustering, rute și prognoze. Etapele 8–11 se execută după stabilizarea M1, în ordinea dependențelor. Un algoritm bazat pe reguli sau o euristică de traseu este etichetat ca atare, nu prezentat drept model AI antrenat.

### M2: Diagnostic operațional și redistribuire

* Păstrează compatibilitatea CSV-urilor M1. Adaugă opțional `discarded_qty`, `donated_qty`, `carried_over_qty`, întregi nenegativi cu suma ≤ `prepared_qty-sold_qty`; diferența rămâne surplus cu destinație necunoscută. Lipsa acestor câmpuri nu înseamnă zero deșeuri. Numai `discarded_qty` confirmă mâncarea aruncată.
* Pentru afirmații precum „după ora 18:00”, adaugă un import separat de observații orare: `(date,dish_id,interval_start,interval_end)` unic, cantități pentru intervale neintersectate, plus programul localului pe zile și versiunea meniului. Nu amesteca agregate lunch/dinner cu observații orare în același calcul. Meniul/programul se aplică după data efectivă; lipsa lor se afișează ca limită. Fără date orare, se raportează numai intervalul dinner.
* „Vinerea se pregătesc cu 30% mai multe porții decât se vând” înseamnă `(ΣP-ΣS)/ΣS×100`, cu `ΣS>0`, perioadă și suport vizibile. Nu este aceeași metrică cu rata surplusului `(ΣP-ΣS)/ΣP`. Explicațiile identifică factori asociați, nu demonstrează cauzalitatea.
* Clustering exploratoriu cu KMeans din scikit-learn existent, pe profiluri per preparat: rată de surplus, variație zilnică, proporție dinner și volum mediu. Minimum 30 zile și 8 preparate eligibile; standardizare, seed fix, alegere `k` din 2–4 prin silhouette, excluzând grupuri cu un singur membru. Fără structură validă → `insufficient_data`. Afișează centrele în unități originale, membrii și suportul; etichetele descriptive nu sunt cauze.
* Separă stocarea donațiilor de cache-ul analitic cu TTL 24 h. Folosește SQLite pentru demo-ul cu un worker, tranzacții pentru rezervări și istoric persistent al tranzițiilor. Entități: `Donor` (restaurant/supermarket/household, locație), `Organization` (categorii acceptate, alergeni excluși, condiții de păstrare, capacitate kg/zi, program, rază), `Offer`, `Reservation`, `PickupRoute`, `Handover`.
* `Offer`: ID, donator, categorie, descriere, alergeni declarați sau necunoscuți, cerințe de păstrare/transport, masă kg pozitivă, opțional porții și masă per porție, coordonate, `available_from`, `pickup_deadline`, stare și versiune. Timestamps cu fus orar, afișate Europe/Bucharest. Datele necunoscute necesare eligibilității blochează matching-ul automat; nu se deduce siguranța alimentară dintr-o prognoză.
* Matching în două faze: filtre obligatorii pentru categorie, alergeni, păstrare, capacitate, distanță și interval fezabil; apoi ordonare deterministă după termenul cel mai apropiat, distanță și ID pentru egalități. Returnează motive pentru acceptare/respingere. M2 rezervă integral o ofertă unei singure organizații; împărțirea loturilor este extensie ulterioară.
* Stări: `available → reserved → collected`; `available/reserved → expired`; anulare înainte de colectare → `cancelled`. Eliberarea unei rezervări o readuce la `available` numai înainte de termen. Rezervare atomică, expirare verificată și la fiecare mutație, răspuns 409 la concurență/stare incompatibilă, cheie de idempotency pentru rezervare și predare. Capacitatea organizației include rezervările active și predările aceleiași zile.
* Rute: un vehicul cu capacitate kg, punct de plecare, oră de pornire și destinație organizație; grupează doar rezervări ale acelei organizații. Euristică deterministă de inserție cu termene, program, durată de oprire și păstrare compatibilă; returnează opriri ordonate, ore estimate și oferte neincluse cu motiv. Demo-ul folosește o matrice locală de durate, explicit simulată; nu afirmă optim global sau trafic real.
* Prognoză: cantitatea de surplus pe donator/zi/interval, din istoric confirmat și exclusiv date disponibile înaintea predicției. Minimum 60 zile per donator, split temporal și baseline mediană pe zi a săptămânii/interval; MAE în kg sau porții, fără conversii inventate. Include zilele confirmate fără surplus, fără a transforma zilele lipsă în zero. Restaurantul poate reutiliza modelul M1 doar când producția planificată este disponibilă; ceilalți donatori necesită istoric propriu. Predicțiile și intervalele empirice calibrate sunt sugestii pentru coordonare, nu oferte rezervabile.

### M2 API contracts

Toate rutele sunt sub `/api/redistribution`; răspunsuri Pydantic, `ApiError` și OpenAPI conform M1. Demo-ul izolează datele într-o sesiune opacă și nu expune adrese reale; pilotul înlocuiește sesiunea demo cu autorizare pe rol/proprietar.

| Rută | Contract |
|---|---|
| `POST /demo`, `GET /donors`, `GET /organizations` | sesiune cu fixtures sintetice; directoare în sesiune |
| `POST /offers`, `GET /offers`, `GET /offers/{id}/matches` | validare ofertă; listare; eligibilitate și motive |
| `POST /offers/{id}/reservations` | organizație, versiune ofertă, idempotency key; rezervare atomică sau 409 |
| `POST /reservations/{id}/release`, `POST /offers/{id}/cancel` | tranziții validate și eliberare capacitate |
| `POST /routes/plan` | reservation IDs, organizație, vehicul, plecare; opriri și excluderi |
| `POST /reservations/{id}/handover` | cantitate efectiv primită ≤ ofertă, confirmare de primire; impact idempotent |
| `GET /impact`, `GET /forecasts` | kg efectiv predate; prognoze cu suport, proveniență și evaluare |

Diagnosticul adaugă `POST /api/datasets/{id}/operations` pentru observații orare/program/meniu și `GET /api/datasets/{id}/clusters`; importul operațional invalidează numai rezultatele dependente și intră în hash-ul analizei. Clusterizarea apare în manifest cu aceleași stări ca modelul.

---

## Affected Files

Toate sunt planificate `[ ]`; bifează numai după verificarea reală. Globurile permit fișierele create în acea familie.

* [ ] `AGENTS.md`, `README.md`, `.gitignore`, `.env.example`, `LICENSE`
* [ ] `backend/app/{main,config,schemas}.py`, `backend/app/api/*.py`, `backend/app/services/*.py`
* [ ] `backend/tests/*`, `backend/pyproject.toml`, `backend/requirements.lock.txt`, `backend/Dockerfile`
* [ ] `frontend/src/{main,App}.jsx`, `frontend/src/api/client.js`, `frontend/src/{components,pages,styles}/*`
* [ ] `frontend/{package.json,package-lock.json,vite.config.js}` și configurația linterului din scaffold
* [ ] `scripts/{export_openapi,prepare_dataset,generate_synthetic,fetch_weather,build_demo}.py`
* [ ] `data/demo/*`, `data/context/*`, `data/template.csv`
* [ ] `docs/{API,DATASET,DECISIONS,PROGRESS,DEMO_SCRIPT}.md`, `docs/openapi.json`, `docs/fixtures/*`
* [ ] `PLAN.md` — menținerea milestone-urilor și verificărilor
* [ ] `backend/app/redistribution/{schemas,repository,matching,routing,forecasting,service}.py`, `backend/app/api/redistribution.py` — modul M2 și persistență
* [ ] `backend/app/services/{operations,clustering}.py` — date operaționale și profiluri de risipă
* [ ] `backend/tests/test_{operations,clustering,matching,reservations,routing,forecasting,redistribution_flow}.py` — verificări M2
* [ ] `data/demo/redistribution/*`, `docs/PILOT.md` — scenarii sintetice și criterii pentru pilot
* [ ] `docs/team/*.md` — coordination, individual execution plans and progress
* [ ] `backend/app/{contracts,analytics,decisions}/*.py`, `backend/tests/{platform,analytics,redistribution,decisions}/*` — isolated team ownership as defined in `docs/team/README.md`
* [ ] `frontend/src/features/{platform,diagnostics,redistribution,decisions}/*`, `docs/fixtures/{analytics,redistribution,decisions}/*` — independently owned UI modules and fixtures

---

# Execution Sequence

Pentru echipa de patru, execută pașii fiecărui plan individual în ordine, în paralel cu ceilalți, conform `docs/team/README.md`. Citește instrucțiunile aplicabile din `AGENTS.md`; fiecare membru notează progresul în propriul plan, iar membrul 1 consolidează `docs/PROGRESS.md`. Etapele de mai jos sunt referința funcțională; ownership-ul și ordinea de integrare sunt definite în planurile individuale. Nu presupune că `[ ]` înseamnă implementat.

# Feature 1: Stage 0 — Foundation & Deploy (ora 0–1)

## Step 0.1: Repo and configuration

* [ ] Creează directoare, MIT, `.gitignore` pentru `.env`, `.venv`, `node_modules`, runtime; `AGENTS.md`, `README.md`, `.env.example` cu limite/CORS/LLM; `PROGRESS.md`.

### Tests

`git status` exclude fișierele ignorate; variabilele sunt documentate fără valori secrete.

### Verification

Repo-ul se deschide din clone și conține doar fișiere planificate.

## Step 0.2: Pydantic contracts, fixtures, health

* [ ] Definește modele pentru stări, erori, sumar, tipar, explicație, anomalie, recomandare, simulator; rute stub doar în `APP_MODE=fixtures`.
* [ ] `/health` importă efectiv pandas/sklearn/shap și expune versiunile. Rulează fit + TreeExplainer pe un tabel minuscul înainte de fixarea dependențelor.

### Tests

Fixtures validează cu Pydantic; smoke test fit/SHAP și `/health` trec local și în container.

### Verification

`pytest`; `GET /api/health` afișează versiunile reale; fără fixtures în modul normal.

## Step 0.3: React JavaScript, OpenAPI, deploy

* [ ] Folosește scaffold-ul Vite `--template react` existent; creează-l doar dacă lipsește. Adaugă `client.js`, router, `npm run lint/build`; exportă `docs/openapi.json` din backend, fără TypeScript.
* [ ] Publică backendul cu un worker și CORS pentru originile configurate; frontendul folosește `VITE_API_BASE_URL` către backendul real.

### Tests

Lint/build, request și preflight din browser; verifică importurile ML în containerul deployat.

### Verification

Frontendul public afișează versiunile din `/api/health` public. Dacă hostul nu suportă SHAP, rezolvă acum.

# Feature 2: Stage 1 — Data & Summary (ora 1–4)

## Step 1.1: CSV contract and validator

* [ ] Scrie `DATASET.md`, `template.csv`, parser cu limite și raport de erori pe linii + avertismente. Respinge duplicate, numere nefinite, negative și `sold>prepared`.

### Tests

CSV bun, BOM, `;`, antet lipsă/duplicat, rând invalid, 0 producție, fișier supradimensionat.

### Verification

Șablonul trece validatorul; importul greșit are 422 cu linie și cod stabil.

## Step 1.2: Summary and storage

* [ ] Implementează formulele de mai sus, seria zilnică, top preparate; ID aleator, manifest, TTL, salvare atomică și stări pentru componente.

### Tests

Pentru `P=[10,30]`, `S=[7,15]`, cost `[5,10]`: 18 porții, **165 lei**, rata **45%**; producție totală zero → rată null; restart nu lasă job `running` permanent.

### Verification

Upload → ID → `/summary` real; hash-ul, datasetul și stările rămân coerente după refresh.

## Step 1.3: Weather, calendar, source ledger

* [ ] `fetch_weather.py`: istoric Open-Meteo pentru Iași, timezone Europe/Bucharest, precipitații/temperatură zilnică și snapshot local.
* [ ] `calendar_iasi.json` numai cu date ale anului verificate în surse primare; `sources.json` cu URL, accesare și `is_synthetic`. Lipsa contextului → missing flag.

### Tests

Join-ul pe dată păstrează numărul rândurilor; zile fără meteo nu devin zile uscate inventate.

### Verification

Sursele și perioada fiecărui eveniment sunt identificabile; demo-ul merge după pregătire fără API meteo live.

## Step 1.4: Deterministic demo generator

* [ ] Generează 180 zile/16 preparate/2 intervale cu seed 42; folosește snapshot-ul meteo din 1.3, plantează trei efecte recurente și anomalii târzii. Salvează adevărul generatorului separat de CSV-ul utilizat de model.

### Tests

Două rulări produc același hash; `sold≤prepared`; tiparele plantate au suport suficient.

### Verification

Demo-ul trece validatorul și este etichetat „vânzări simulate”; efectul comercial al evenimentelor este tot simulat.

## Step 1.5: API and upload screen

* [ ] `POST /datasets` validează și servește sumarul rapid; analiza grea pornește controlat. `POST /datasets/demo` folosește demo read-only. UI: drag/drop, șablon, erori pe linii, buton demo, navigare și KPI-uri.

### Tests

Upload invalid, backend inactiv, încărcare demo, polling care se oprește, dataseturi succesive fără amestec de date.

### Verification

În deploy, CSV → sumar și demo → sumar afișează exact valorile API.

# Feature 3: Stage 2 — Patterns (ora 4–6)

## Step 2.1: Candidate search and comparable baseline

* [ ] Enumeră determinist maximum 120 candidați din `dish/category` + `weekday/time_slot/rain_bin/university_state`; exclude grupuri identice reperului. Păstrează maximum două condiții și pragurile de suport.

### Tests

Set stabil sub schimbarea ordinii rândurilor, fără comparație globală greșită pentru un preparat.

### Verification

Pentru fiecare pattern: condiții, reper, `n_rows/n_days`, rata grupului/reperului și efect în pp.

## Step 2.2: Impact, bootstrap, ranking

* [ ] Calculează oportunitatea orientativă, bootstrap pe zile și ranking `oportunitate×fracție_bootstrap_pozitivă`; fără bootstrap, ranking doar după oportunitate. Deduplică top 3 când acoperirea rândurilor se suprapune >80%.

### Tests

20% → 30% = +10 pp, +50% relativ; aceeași intrare/seed produce CI identic; niciun total din tipare suprapuse.

### Verification

Cardurile au CI numai dacă este calculat și eticheta „exploratoriu”; nu arată p-value inventat.

## Step 2.3: Synthetic recovery and UI

* [ ] Testează recuperarea a minimum 2/3 efecte recurente în top 10; test null orientativ. Afișează top 3, cost per preparat și cronologie.

### Tests

Testele raportează efecte găsite/ratate și avertismentele; fără suport → stare goală utilă.

### Verification

UI consumă `/patterns` real și explică reperul, unitățile și numărul de zile.

## Step 2.4: Optional adjusted tests [P2, execute only after Step 5.2]

* [ ] Definește familia candidaților înainte de calculul efectelor. Compară rate zilnice cu Welch pe zile disjuncte ori test pereche când aceleași zile apar în ambele grupuri; tratează suportul/varianța insuficiente ca test indisponibil.
* [ ] Ajustează întreaga familie validă cu SciPy `false_discovery_control(method="by")`; afișează `p_adj` și eticheta inferențială doar pentru teste valide, cu ipotezele de independență temporală documentate. CI bootstrap rămâne neajustat.

### Tests

Valori `p_adj∈[0,1]`, cazuri fără variație și 20 seed-uri null raportate orientativ, fără promisiune de control FDR demonstrat de acest test.

### Verification

Modulele P0/P1 funcționează identic când această extensie este dezactivată.

# Feature 4: Stage 3 — ML Explanation (ora 6–9)

## Step 3.1: Features and temporal split

* [ ] Creează features permise, baseline, split 60/20/20 pe zile și preprocesare fit numai pe train; <60 zile → ML `insufficient_data`.

### Tests

Datele partitiilor nu se intersectează; niciun `sold/surplus/latent_D` în features; categorii necunoscute produc predicții finite.

### Verification

Datele partițiilor și MAE baseline sunt disponibile în rezultatele modelului.

## Step 3.2: Small gradient boosting and evaluation

* [ ] Antrenează modelul o singură dată per hash de date+context+versiune; salvează predicții calibration/test, MAE test în pp, comparat onest cu baseline.

### Tests

Metricile se recalculează din predicțiile salvate; refresh nu retrenează; excepția ML păstrează sumarul.

### Verification

API arată metrici reale, inclusiv când modelul este mai slab decât baseline-ul.

## Step 3.3: SHAP and residual anomalies

* [ ] TreeExplainer pe estimator și matricea transformată; agregate globale/per preparat, suport vizibil. Din calibration estimează centru/MAD; marchează doar excesele test peste pragul robust și pragul monetar.

### Tests

Suma SHAP reconstruiește predicția brută în toleranță; anomaliile plantate în test sunt găsite și alarmele în alte zile sunt raportate.

### Verification

Factorii și cronologia arată perioada evaluată, sursa evenimentelor și limitele asociative.

## Step 3.4: Integrate states and dashboard

* [ ] Integrează ordinea context → pattern → model → SHAP/anomalii; UI arată loading/partial/insufficient/error, selector preparat și explicații.

### Tests

Eroarea SHAP lasă sumarul/tiparele disponibile; frontendul nu confundă demo cu upload.

### Verification

În deploy, Diagnostic funcționează după refresh fără retraining.

# Feature 5: Stage 4 — Actions & Report (ora 9–11)

## Step 4.1: Template recommendations and demo cache

* [ ] Creează maximum trei acțiuni deterministe din pattern IDs, cifre validate și efort; zero tipare → „colectează date”. Precalculează demo cu hash/version manifest.

### Tests

Fără cheie LLM raportul se construiește; schimbarea CSV/context invalidează cache-ul demo.

### Verification

Acțiunile au dovadă și oportunitate distinctă, fără total dublat.

## Step 4.2: Optional Claude, behind flag (P2)

* [ ] Numai după pasul 4.1: trimite JSON cu ID-uri și metrici existente; cere texte și coduri de acțiune fără cifre; validează Pydantic, timeout 8 s, fallback și cache pe hash+model.

### Tests

Timeout, JSON greșit, ID necunoscut, cifre noi și lipsă cheie → șabloane identice.

### Verification

Nici cheile, nici CSV-ul brut nu intră în frontend/prompt/loguri; `LLM_ENABLED=false` rămâne traseul complet.

## Step 4.3: Actions UI and printable report

* [ ] Pagina Acțiuni arată priorități, efort, dovezi; raport HTML cu surse, interval, KPI, patternuri, metrici ML, acțiuni, limitări și CSS print.

### Tests

Print preview fără tăieri/overflow; componenta ML indisponibilă nu blochează raportul.

### Verification

Butonul de print produce raport lizibil; demo-ul rămâne marcat simulat.

# Feature 6: Stage 5 — What-if Simulator (ora 11–13)

## Step 5.1: Empirical backend curve

* [ ] Selectează istoricul conform pragurilor, calculează curba pe cantități întregi plus baseline `P0`; răspunsul conține nivelul reperului, suportul și avertismentul de cenzurare.

### Tests

`S=[10,20,30],P=20` → surplus proxy și lipsă minimă `10/3`; pentru P crescător surplusul nu scade și lipsa nu crește; la `P=P0` diferența este zero.

### Verification

Endpointul nu antrenează model și nu numește schimbarea costului „profit”.

## Step 5.2: Slider and integration

* [ ] Descarcă curba la alegerea preparatului/zi/interval; schimbă punctul local la slider. Arată lei/serviciu, porții lipsă minime, risc minim și avertismentul lângă rezultate.

### Tests

P=0, P mare, suport insuficient, schimbare preparat; măsoară actualizarea sliderului <1 s.

### Verification

Pe URL public, Acțiuni → Simulator funcționează fără request la fiecare mișcare.

**FEATURE FREEZE la ora 13:** oprește funcțiile P2 neterminate; notează stările reale în PROGRESS.md.

# Feature 7: Stage 6 — Stabilization (ora 13–15)

## Step 6.1: Failure handling and limits

* [ ] UI: upload invalid/depășit, backend rece, job eșuat, ID expirat; retry limitat fără a repeta automat uploadul.
* [ ] Backend: limită upload/analize, rate limit rezonabil pentru rețea comună, URL-uri și CORS restrânse, date runtime nepublice. Dataset ID este acces temporar, nu autentificare.

### Tests

413/422/429/404, HTML din nume tratat ca text, niciun spinner permanent.

### Verification

Frontendul nu afișează date demo pentru uploaduri eșuate; inspectează erorile în browser și API.

## Step 6.2: Clean install and deployment check

* [ ] Pornește din clone conform README; verifică secrete, lockfile-uri, testele backend, OpenAPI exportat, lint/build și manifestul demo.
* [ ] Măsoară durata analizei demo, memoria maximă și latența sliderului; redu eșantionul SHAP dacă hostul o cere.

### Tests

Rulează testele esențiale și două fluxuri complete consecutive, inclusiv după refresh.

### Verification

Deschide site-ul pe alt dispozitiv/rețea; verifică print și încălzește backendul înainte de prezentare.

# Feature 8: Stage 7 — Pitch & Reserve (ora 15–18)

## Step 7.1: Demo script and rehearsal

* [ ] În `DEMO_SCRIPT.md`: 3 minute, clicurile exacte, cifre copiate din demo, ce este real/simulat, comparația cu baseline-ul și limita cererii cenzurate.
* [ ] Repetă cu cronometru, salvează un raport printat și o înregistrare scurtă de rezervă dacă încape în timp.

### Tests

Flux complet de două ori: demo → tipar → factori → acțiune → slider → raport.

### Verification

Linkurile publice, backendul și materialul de rezervă sunt pregătite; niciun modul P2 neterminat nu apare în pitch.

---

# M2 Execution Sequence

Următoarele etape M2 extind secvența de execuție după Stage 7. Cerințele finale de documentare și testare de la sfârșit se aplică ambelor milestone-uri.

## Stage 8 — Diagnostic: de ce apare surplusul (M2)

### Step 8.1: Date operaționale și explicații verificabile

* [ ] Extinde validatorul, schemele, template-ul și `DATASET.md` cu destinația surplusului; implementează importul separat de observații orare, meniu și program, conform contractelor M2.
* [ ] Extinde tiparele și recomandările pentru intervale orare când există suport; reutilizează anomaliile reziduale și SHAP din Stage 3. Fiecare card separă observația, factorii asociați și acțiunea sugerată, cu reper și perioadă.
* [ ] Tests: compatibilitate CSV M1, sume imposibile, intervale suprapuse, program schimbat, lipsă date orare, vânzări zero; P=130/S=100 produce +30% față de vânzări și aproximativ 23,08% surplus, fără confundarea lor.
* Verification: `pytest backend/tests/test_operations.py`; importurile vechi și noi funcționează; afirmația „după 18:00” apare numai cu observații care o susțin.

### Step 8.2: Clustering și dashboard diagnostic

* [ ] Implementează profilurile, standardizarea, selecția k și stările din contract; adaugă `/clusters`, cache și vizualizare cu membri, centre și explicații descriptive.
* [ ] Tests: seed reproductibil, date constante/insuficiente, absența clusterelor singleton acceptate, profiluri distincte sintetice; nu impune ID-uri numerice arbitrare ale clusterelor în teste.
* Verification: `pytest backend/tests/test_clustering.py`; `npm run lint` și `npm run build` din `frontend`; un preparat poate avea un profil recurent și separat o anomalie punctuală, explicate distinct.

## Stage 9 — Rețeaua de redistribuire (M2)

### Step 9.1: Contracte, persistență și demo

* [ ] Creează schemele, repository-ul SQLite, tranzacțiile, rutele și izolarea pe sesiune; documentează fișierul bazei de date în `.env.example`, separat de `DATA_DIR/{id}` și de TTL-ul analitic.
* [ ] Creează fixtures pentru restaurant, supermarket, gospodărie și cel puțin trei organizații cu restricții diferite; include oferte expirate, fără potrivire și cu informații incomplete. Toate locațiile/contactele sunt sintetice.
* [ ] Tests: validare cantitate/date/coordonate, persistență după restart, separare între sesiuni, stare necunoscută respinsă; ștergerea cache-ului analitic nu șterge donațiile.
* Verification: `pytest backend/tests/test_redistribution_flow.py`; export OpenAPI; repornirea backendului păstrează ofertele și istoricul.

### Step 9.2: Matching explicabil, rezervări și predare

* [ ] Implementează filtrele obligatorii, ordonarea după urgență/distanță și motivele lizibile. Revalidează eligibilitatea și capacitatea la rezervare.
* [ ] Implementează tranzacțiile de rezervare, eliberare, anulare, expirare și predare cu idempotency; înregistrează numai masa efectiv primită. Diferența față de ofertă rămâne nepredată, nu devine automat impact.
* [ ] Tests: organizație apropiată dar incompatibilă exclusă; prioritate termen; capacitate cumulată; două rezervări simultane au un singur câștigător; retry nu dublează predarea; expirarea/anularea eliberează capacitatea; predare peste cantitatea oferită respinsă.
* Verification: `pytest backend/tests/test_matching.py backend/tests/test_reservations.py`; fiecare potrivire poate fi explicată din câmpurile ofertei și organizației.

### Step 9.3: UI donator/organizație și impact

* [ ] Adaugă paginile formular ofertă, listă cu filtre, potriviri cu motive, rezervări și confirmare de primire; selectorul de rol este explicit simulare în demo.
* [ ] Leagă recomandarea „redistribuie surplusul” de un formular precompletat, care cere cantitatea disponibilă și termenul confirmate de donator. Nu publica automat cantități estimate de model.
* [ ] Afișează kg predate, număr de predări și destinații; separă oferit, rezervat și predat. Nu calcula emisii evitate fără factori documentați și unități compatibile.
* [ ] Tests: flux API ofertă → matching → rezervare → predare → impact; lipsă potrivire, conflict 409 și ofertă expirată; UI păstrează datele introduse la erori recuperabile.
* Verification: `pytest backend/tests/test_redistribution_flow.py`; lint/build frontend; parcurgere manuală pentru toate cele trei tipuri de donator, inclusiv refresh.

## Stage 10 — Colectări eficiente și anticiparea surplusului (M2)

### Step 10.1: Gruparea donațiilor în trasee fezabile

* [ ] Implementează euristica și matricea demo din contract, apoi lista ordonată a opririlor cu ore, încărcare și motive pentru excluderi. Planificarea nu schimbă starea rezervărilor.
* [ ] Verifică termenul și la sosirea finală, nu doar la ridicare; include așteptarea pentru deschiderea locațiilor și durata opririlor. Rezervările anulate/expirate invalidează traseul și cer recalculare.
* [ ] Tests: vehicul insuficient, termen imposibil, program închis, lipsă durată în matrice, păstrare incompatibilă, fiecare rezervare inclusă o singură dată; aceeași intrare produce același traseu.
* Verification: `pytest backend/tests/test_routing.py`; demo cu minimum trei ridicări și un caz exclus explicabil; timpii simulați sunt vizibili în UI.

### Step 10.2: Predicția locului și momentului surplusului

* [ ] Implementează prognoze per donator pentru următoarele șapte zile/intervale, cu cantitate estimată, interval empiric calibrat, suport, momentul generării și locația donatorului. Refolosește stiva ML existentă; compară cu baseline înainte de a selecta modelul pentru afișare.
* [ ] Afișează calendar/listă de oportunități estimate și acțiunea de a crea o ofertă după confirmarea donatorului. Pentru gospodării fără istoric suficient arată `insufficient_data`; matching-ul ofertelor manuale rămâne disponibil.
* [ ] Tests: split temporal fără leakage, zero confirmat versus date lipsă, donator nou, unități incompatibile, intervale calibrate numai pe calibration și evaluare pe test; prognoza nu creează rezervări/oferte.
* Verification: `pytest backend/tests/test_forecasting.py`; afișează MAE model/baseline și acoperirea intervalelor pe test, inclusiv când modelul nu aduce îmbunătățiri.

## Stage 11 — Demonstrație integrată și fezabilitate (M2)

### Step 11.1: Verificare și pitch

* [ ] Actualizează raportul și `DEMO_SCRIPT.md`: identifică un tipar → explică factorii/anomalia → propune prevenție → confirmă surplusul rămas → găsește organizația → rezervă → planifică ridicarea → confirmă predarea → arată impactul.
* [ ] Include un caz fără organizație eligibilă și o prognoză cu suport insuficient; nu transforma rezultatele sintetice în afirmații despre economii reale.
* [ ] Tests: flux integrat și regresii M1, repetare după refresh/restart, fără dublarea impactului; erorile din prognoză/clustering nu blochează matching-ul.
* Verification: `pytest`, lint/build frontend, două parcurgeri complete ale demo-ului; actualizează `PROGRESS.md` cu funcțiile efectiv disponibile și timpii măsurați.

### Step 11.2: Pregătirea unui pilot cu parteneri reali

* [ ] Documentează în `docs/PILOT.md` protocolul pentru un restaurant/supermarket și o organizație: timp de publicare, rata ofertelor acceptate, kg primite, ridicări ratate și motive. Pentru prevenție, compară surplusul raportat la producție în perioade comparabile; nu atribui automat diferența aplicației.
* [ ] Înainte de activarea datelor reale: implementează și verifică autentificare/autorizare pe rol și proprietar, acces restrâns la adrese/contacte, jurnal de predare și retenție separată. Selectarea furnizorului de identitate și regulile operaționale se documentează înaintea implementării pilotului.
* [ ] Verifică împreună cu partenerii categoriile acceptate, informațiile necesare și responsabilitățile de transport/păstrare, pe baza cerințelor aplicabile verificate atunci. Pilotul gospodăriilor se activează numai după definirea acceptării de către organizații; demo-ul acoperă deja acest tip de donator.
* [ ] Tests: accesul între conturi/organizații respins, date personale absente din răspunsurile publice, auditul predării persistent; checklist-ul operațional este complet înainte de date reale.
* Verification: criteriile, persoanele responsabile și rezultatele pilotului sunt consemnate separat de demo; M2 demo poate fi finalizat înaintea lansării pilotului.

---

# Final Release-State Requirements

## Documentation

`README.md`: rulare/deploy/comenzi; `DATASET.md`: unități/format/proveniență; `API.md`: rute și stări; `DECISIONS.md`: compromisuri; `PROGRESS.md`: pași/rezultate efective; `DEMO_SCRIPT.md`: pitch. Marchează clar vânzările sintetice și sursele contextului.

## Testing

Fiecare pas se marchează finalizat numai după verificarea lui. Testele prioritare verifică formulele, validarea, lipsa leakage-ului, splitul temporal, fallback-ul LLM și monotonia simulatorului. Comenzi minime: `pytest`, `npm run lint`, `npm run build`, plus smoke test pe URL-urile publice.
