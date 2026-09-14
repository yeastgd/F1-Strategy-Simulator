# F1 Pit Strategy Monte Carlo Simulator — Project Spec

This document is the single source of truth for the project. Keep it in the repo root.
Reference it explicitly in every Cursor prompt ("follow PROJECT_SPEC.md, Phase N").

## 1. Goal

Build a small full-stack app that:
1. Pulls real historical F1 race data (laps, tyre compounds, pit stops, track status).
2. Fits a tyre degradation model per compound from that data.
3. Runs a Monte Carlo simulation comparing pit-stop strategies (1-stop vs 2-stop vs 3-stop)
   and outputs a distribution of finishing times / win probability per strategy.
4. Exposes this through a small API and a dashboard (charts).
5. Is containerized, has CI, and (optionally) a tiny .NET microservice for strategy validation.

## 2. Tech stack

- **Backend**: Python 3.11, FastAPI, `fastf1`, `numpy`, `pandas`, `scipy`, `pytest`, `ruff`.
- **Frontend**: Next.js (App Router), TypeScript, Recharts for charts, CSS Modules.
- **Optional microservice**: ASP.NET Core 8 Web API (`validation-service`) — validates a
  strategy against basic F1 sporting regs (min. 2 compounds in a dry race, pit laps within
  race distance, no duplicate pit laps, min. gap between stops).
- **Infra**: Docker, docker-compose (local), Kubernetes manifests (demo-grade), GitHub Actions CI.
- **Deploy target**: frontend → Vercel; backend + validation-service → Fly.io or Render
  (free tier is enough for a portfolio demo).

## 3. Repo structure

```
f1-strategy-sim/
├── PROJECT_SPEC.md
├── README.md
├── docker-compose.yml
├── .github/workflows/ci.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── data/
│   │   │   ├── fetch_race_data.py      # FastF1 extraction → data/processed/*.csv
│   │   │   └── cache/                  # fastf1 cache dir (gitignored)
│   │   ├── models/
│   │   │   ├── degradation.py          # fit_degradation(), DegradationModel
│   │   │   └── simulation.py           # StrategySimulator, run_monte_carlo()
│   │   ├── api/
│   │   │   └── routes.py               # /races, /races/{id}/degradation, /races/{id}/laps, /simulate
│   │   └── tests/
│   │       ├── test_degradation.py
│   │       └── test_simulation.py
├── frontend/
│   ├── Dockerfile
│   ├── app/
│   │   ├── page.tsx                    # race selector
│   │   └── race/[id]/page.tsx          # dashboard
│   └── components/
│       ├── DegradationChart.tsx
│       ├── StrategyBuilder.tsx
│       ├── ResultsHistogram.tsx
│       └── StrategyComparisonTable.tsx
├── validation-service/                 # optional .NET piece
│   ├── Dockerfile
│   └── Program.cs
└── k8s/
    ├── backend-deployment.yaml
    ├── frontend-deployment.yaml
    └── service.yaml
```

## 4. Data layer

- Use `fastf1.Cache.enable_cache("app/data/cache")` once at startup.
- Pick 2–3 real races with different character, e.g.:
  - 2023 Monza GP (low deg, low SC probability)
  - 2023 Spain GP (high deg, medium SC probability)
  - 2023 Singapore GP (high SC probability, street circuit)
- Extract via `session.laps`: `LapTime`, `Compound`, `TyreLife`, `Stint`, `PitInTime`,
  `PitOutTime`, `TrackStatus` (for safety car / VSC periods).
- Drop in/out laps before fitting degradation (they're not representative pace).
- Persist to `data/processed/{year}_{gp}.csv` so the simulation doesn't need FastF1 at runtime.
- **Before** dropping in/out laps, compute the race's pit-lane time loss: for each pit stop,
  `pit_time_loss = (in_lap_time + out_lap_time) - 2 * median_clean_lap_time_for_that_driver_stint`
  (excluding in/out laps from that median). Take the median across all pit stops in the race.
  Persist this as `data/processed/{year}_{gp}_meta.json`: `{"pit_loss_seconds": <float>}`. This
  value cannot be recovered later once in/out laps are dropped from the CSV, so it must be
  computed in this same pass.
- `TrackStatus` is a concatenated multi-digit flag string (e.g. `"41"`, `"671"`), not a clean
  category — each digit is a separate event (4=SC, 6/7=VSC, 2=yellow, 1=green). Leave it as-is
  in the processed CSV for now; it gets parsed per-digit in Phase 3 (section 6) for the safety
  car probability model, not in Phase 2.

## 5. Tyre degradation model

For each compound, per race:
- Filter to representative laps (exclude first lap of stint and lap right before a pit stop).
- **Fuel correction is required, not optional.** Pooling laps across a race and fitting
  `LapTime ~ TyreLife` alone conflates tyre wear with fuel burn-off (cars get lighter and
  faster as the race goes on) — this has already been observed to invert the sign of the
  slope at low-degradation tracks. Fit a two-predictor linear regression instead:
  `LapTime = intercept + deg_rate * TyreLife + fuel_rate * RaceLap` (via
  `numpy.linalg.lstsq`, not `polyfit`). Because `TyreLife` resets to 0 every stint while
  `RaceLap` increases monotonically, the two predictors are not collinear and the fit can
  separate tyre degradation from fuel effect. `deg_rate` (the `TyreLife` coefficient) is
  what feeds the simulator.
- Trim outliers before fitting: drop laps beyond ~1.5x the stint's median lap time (catches
  SC/VSC/traffic-affected laps that survived the in/out-lap filter).
- Some compounds may have zero or very few laps in a given race (e.g. no SOFT stint at all,
  or only a handful of laps). `DegradationModel` must handle this gracefully: return `None`
  for that compound rather than fitting on too little data (set a minimum sample threshold,
  e.g. 15 laps), and downstream code (API, simulator, strategy builder) must check for `None`
  and exclude that compound rather than crashing.
- `deg_rate` must be floored at 0 after fitting — a negative value (tyres "getting faster"
  with age) is a track-evolution/noise artifact, not physically meaningful. When a fit comes
  back negative, clip it to 0 and set `was_floored: True` on the `CompoundModel` so the
  clipping stays visible/traceable rather than silently changing the number.
- Add a `confidence: "low" | "medium" | "high"` field to `CompoundModel`, derived from
  `n_laps` (suggested bands: <75 low, 75–200 medium, >200 high — tune if the real
  distribution across the 3 races suggests otherwise). This must be surfaced later in the
  API and frontend so a thin-sample fit (e.g. Singapore SOFT at 51 laps) is visibly flagged
  to whoever is using the dashboard, rather than presented with the same confidence as a
  488-lap HARD fit.
- Known limitation to document in the README (Phase 6), not to fix now: `deg_rate` ordering
  across compounds can come out counter-intuitive (e.g. HARD showing a steeper slope than
  SOFT) because compound choice is confounded with stint length and track position — HARD
  tends to run long, clean stints spanning a wide tyre-age range, while SOFT runs short,
  noisier stints over a narrow range. This is a real limitation of fitting per-compound
  from a single race's data, not a bug in the fit itself.
- Store `{compound: {base_pace, deg_rate, fuel_rate, n_laps} | None}` per race as the
  `DegradationModel`.
- Unit test: generate synthetic data with a known `deg_rate` AND a known `fuel_rate` mixed
  together, assert the two-predictor fit recovers `deg_rate` within a small tolerance (this
  is the test that would have caught the original naive-`polyfit` bug).

## 6. Monte Carlo simulation engine

Inputs per simulation call:
- `race_id`, race distance in laps, `pit_loss` — read from the persisted
  `data/processed/{year}_{gp}_meta.json` (section 4), not recomputed from the processed CSV
  (the raw PitInTime/PitOutTime needed for that no longer exist there).
- A safety-car probability per lap, estimated from the fraction of laps flagged SC/VSC in
  `TrackStatus`. Parse this per-digit — `TrackStatus` values are concatenated flag strings
  (e.g. `"671"` means VSC+VSC-ending+SC all logged on one entry), not a single clean
  category, so check for the presence of digit `4` (SC) or `6`/`7` (VSC) anywhere in the
  string rather than testing equality.
- A list of strategies to compare, each defined as an ordered list of
  `{pit_lap, compound}`.

For each strategy, run `N = 5000` simulations:
- For each lap, look up which stint/compound is active, compute
  `lap_time = base_pace + deg_rate * tyre_age + noise` where `noise ~ Normal(0, sigma)`.
- Roll a random safety car event each lap based on the estimated probability; if active,
  pit stops that lap cost near-zero extra time (SC makes pitting "free").
- Add `pit_loss` on pit laps (reduced under SC).
- Sum lap times → total race time for that run.
Aggregate across runs: mean, std, percentiles, and pairwise win probability between
strategies (fraction of runs where strategy A's time < strategy B's time).

Unit tests:
- Fixed seed → deterministic output (regression test).
- A strategy with an extra unnecessary pit stop should have a strictly worse mean time
  than one without, all else equal.

## 7. API (FastAPI)

- `GET /races` → list of available processed races (`id`, `year`, `gp`, `laps`).
- `GET /races/{race_id}/degradation` → `{compound: {base_pace, deg_rate, fuel_rate, n_laps,
  confidence, was_floored} | null}` per compound.
- `GET /races/{race_id}/laps` → processed lap data for the degradation chart:
  `{race_laps: int, laps: [{compound, tyre_life, lap_time}]}` — `race_laps` is required
  in this payload (don't make the frontend fetch `GET /races` separately just to bound the
  strategy builder's pit-lap input).
- `POST /simulate` → body `{race_id, strategies: [{name, start_compound: str, stops:
  [{lap, compound}]}], n_runs}` — `start_compound` is required: it's the compound the car
  starts the race on, before the first pit stop, which `{stops: [...]}` alone doesn't
  specify (a 1-stop strategy is two stints but only one recorded stop). Strategy `name`s
  must be unique within one request — reject with 400 naming the duplicate rather than
  silently overwriting one strategy's result with another's (results and the
  win-probability matrix are both keyed by name).
  → `{strategy_name: {mean_time, std, percentiles, sample}}` plus pairwise win probabilities.
  Before running, call the .NET `validation-service` (if enabled) to check each strategy is
  legal; return a 400 with the specific rule violated if not.
- Note for the frontend (section 8): simulated race times omit `fuel_rate` (it's identical
  across strategies being compared so it cancels out in ranking/win-probability, but this
  means the absolute `mean_time` in seconds is inflated vs a real race time). Display these
  numbers as a relative comparison between strategies, not as a literal "predicted finish
  time" — label charts accordingly (e.g. "simulated race time (relative)" rather than
  presenting it as a real-world prediction).

## 8. Frontend (Next.js)

- `/` — dropdown to pick one of the 2–3 processed races.
- `/race/[id]` dashboard:
  - `DegradationChart` — lap time vs tyre age, one line per compound. Mark compounds with
    `was_floored=True` distinctly (e.g. a dashed line or an annotation) — a floored-at-zero
    line looks identical to "no wear" on the chart otherwise, which is misleading without
    the flag.
  - `StrategyBuilder` — form to define 2–3 strategies: a `start_compound` selector plus an
    ordered list of `{lap, compound}` stops per strategy (the API requires `start_compound`
    explicitly — see section 7). Only offer compounds where `degradation.{compound} !=
    null` for the selected race; disable/hide unavailable ones rather than letting the user
    submit a doomed request.
  - `ResultsHistogram` — overlapping distributions of finishing time per strategy. Label
    the axis as relative/simulated time, not "predicted race time" (see section 7 — fuel
    burn is omitted, so absolute numbers aren't real-world race times).
  - `StrategyComparisonTable` — mean time, std, win probability per strategy, with a small
    confidence indicator (from the lowest-confidence compound used in that strategy) next
    to each row so a strategy built on a thin sample (e.g. Singapore SOFT) reads visibly
    less certain than one built on a 400+ lap fit.

## 9. Optional .NET validation microservice

- Single endpoint `POST /validate` taking a strategy JSON, returning `{valid: bool, reason?: string}`.
- Rules to check: at least 2 distinct dry compounds used, pit laps strictly increasing and
  within `[1, race_length]`, minimum 5-lap gap between consecutive stops.
- Called by the Python backend over internal HTTP before simulating.
- This is what demonstrates ".NET awareness" from the job posting without inflating scope.

## 10. Docker / Kubernetes / CI

- `backend/Dockerfile`: `python:3.11-slim`, install `requirements.txt`, `uvicorn` entrypoint.
- `frontend/Dockerfile`: multi-stage `node:20-alpine`, `next build` → `next start`.
- `validation-service/Dockerfile`: `mcr.microsoft.com/dotnet/sdk:8.0` build stage →
  `mcr.microsoft.com/dotnet/aspnet:8.0` runtime stage.
- `docker-compose.yml`: all three services on one network, backend depends_on validation-service.
- `k8s/*.yaml`: one `Deployment` + `Service` per component — demo-grade only (no need for
  Ingress/HPA), just enough to show the same OpenShift/Kubernetes muscle as the Ericsson work.
- `.github/workflows/ci.yml`: on push — `ruff check` + `pytest` (backend), `eslint` +
  `next build` (frontend), then build (not push) all three Docker images to confirm they build.

## 11. README requirements

- One-paragraph problem statement + why it's interesting (real data, not toy data).
- Architecture diagram (can be a simple Mermaid diagram in the README).
- "Run locally" section: `docker compose up`, then URLs for frontend/backend.
- 2–3 screenshots: degradation chart, histogram, comparison table.
- Short section explaining the degradation model and Monte Carlo approach in plain language.
- Link to live deploy.

## 12. Phase plan (2 weeks)

1. Days 1–2: FastF1 data extraction + EDA notebook, processed CSVs for 2–3 races.
2. Days 3–4: Degradation model + unit tests.
3. Days 5–7: Monte Carlo engine + unit tests.
4. Days 8–10: FastAPI + Next.js dashboard wired end-to-end.
5. Days 11–12: Dockerfiles, docker-compose, GitHub Actions CI, k8s manifests, optional .NET service.
6. Days 13–14: Deploy, screenshots, README, polish.