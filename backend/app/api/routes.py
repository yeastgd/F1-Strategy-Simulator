"""FastAPI domain routes (PROJECT_SPEC.md section 7).

Wires the existing degradation (section 5) and simulation (section 6) layers behind
HTTP. Pydantic models are used throughout so the OpenAPI docs at ``/docs`` are
usable for hand-testing.

Note on times: simulated ``mean_time`` omits fuel burn (see section 7 / the
simulation docstring), so it is inflated vs a real race time and should be read as
a *relative* comparison between strategies, not a literal finish-time prediction.
"""

import logging
import os
from pathlib import Path

import httpx
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.degradation import PROCESSED_DIR, build_degradation_model
from app.models.simulation import (
    PitStop,
    Strategy,
    compare_strategies,
    estimate_sc_probability,
    load_pit_loss,
    simulate_strategy,
)

# Fixed seed so /simulate is reproducible and matches the Phase 3 end-to-end run.
# All strategies in one request share it (common random numbers -> fair pairing).
DEFAULT_SEED = 20230914

# .NET validation-service integration (PROJECT_SPEC.md section 9). Disabled by
# default so local dev / tests don't need the service running; docker-compose sets
# VALIDATION_ENABLED=true and points VALIDATION_SERVICE_URL at the service.
router = APIRouter()
log = logging.getLogger(__name__)


def _validation_enabled() -> bool:
    return os.getenv("VALIDATION_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def _validation_service_url() -> str:
    return os.getenv("VALIDATION_SERVICE_URL", "http://validation-service:8080")


def _validate_remote(strategy: "StrategyIn", race_laps: int) -> tuple[bool, str | None]:
    """Ask the .NET validation-service whether a strategy is legal.

    Returns ``(valid, reason)``. The validator is optional (section 9): if it
    cannot be reached (cold Render box, 502, timeout), we skip it and let the
    Python simulator's own structural checks run. A live ``valid: false`` still
    rejects the request.
    """
    payload = {
        "race_laps": race_laps,
        "start_compound": strategy.start_compound,
        "stops": [{"lap": s.lap, "compound": s.compound} for s in strategy.stops],
    }
    url = _validation_service_url().rstrip("/") + "/validate"
    try:
        resp = httpx.post(url, json=payload, timeout=5.0)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("Validation service unavailable (%s); simulating without it", exc)
        return True, None
    body = resp.json()
    return bool(body.get("valid", False)), body.get("reason")


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class RaceSummary(BaseModel):
    id: str = Field(..., examples=["2023_Monza"])
    year: int = Field(..., examples=[2023])
    gp: str = Field(..., examples=["Monza"])
    laps: int = Field(..., description="Race length in laps (max LapNumber in the data)", examples=[51])


class CompoundModelOut(BaseModel):
    base_pace: float
    deg_rate: float
    fuel_rate: float
    n_laps: int
    confidence: str = Field(..., description="low | medium | high, from n_laps")
    was_floored: bool = Field(..., description="True if a negative fitted deg_rate was clipped to 0")


class LapOut(BaseModel):
    compound: str
    tyre_life: float = Field(..., description="Tyre age in laps")
    lap_time: float = Field(..., description="Lap time in seconds")


class RaceLapsResponse(BaseModel):
    race_laps: int = Field(..., description="Race length in laps (max LapNumber)", examples=[51])
    laps: list[LapOut]


class StrategyResultOut(BaseModel):
    mean_time: float
    std: float
    percentiles: dict[str, float]
    confidence: str
    n_stops: int
    sample: list[float] = Field(..., description="A subsample of per-run finishing times, for the histogram")


class SimulateMeta(BaseModel):
    race_id: str
    race_laps: int
    pit_loss: float
    sc_probability: float
    n_runs: int
    seed: int


class SimulateResponse(BaseModel):
    meta: SimulateMeta
    strategies: dict[str, StrategyResultOut]
    win_probability: dict[str, dict[str, float]] = Field(
        ..., description="win_probability[A][B] = P(A finishes before B)"
    )


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class PitStopIn(BaseModel):
    lap: int = Field(..., ge=1, description="Lap at the end of which the car pits")
    compound: str = Field(..., examples=["HARD"])


class StrategyIn(BaseModel):
    name: str = Field(..., examples=["1-stop early(26)"])
    start_compound: str = Field(..., description="Compound the car starts on", examples=["MEDIUM"])
    stops: list[PitStopIn] = Field(default_factory=list)


class SimulateRequest(BaseModel):
    race_id: str = Field(..., examples=["2023_Monza"])
    strategies: list[StrategyIn] = Field(..., min_length=1)
    n_runs: int = Field(5000, ge=1, le=100_000)
    seed: int = Field(DEFAULT_SEED, description="RNG seed shared across strategies")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _processed_csv(race_id: str) -> Path:
    """Return the processed CSV path for a race, or 404 if it isn't known."""
    path = PROCESSED_DIR / f"{race_id}.csv"
    if not path.exists():
        known = sorted(p.stem for p in PROCESSED_DIR.glob("*.csv"))
        raise HTTPException(status_code=404, detail=f"Unknown race_id {race_id!r}. Known races: {known}")
    return path


def _race_length(laps_df: pd.DataFrame) -> int:
    return int(laps_df["LapNumber"].max())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/races", response_model=list[RaceSummary], tags=["races"])
def list_races() -> list[RaceSummary]:
    """List processed races found in ``data/processed/``."""
    races: list[RaceSummary] = []
    for csv_path in sorted(PROCESSED_DIR.glob("*.csv")):
        race_id = csv_path.stem
        year_str, _, gp = race_id.partition("_")
        laps_df = pd.read_csv(csv_path, usecols=["LapNumber"])
        races.append(
            RaceSummary(
                id=race_id,
                year=int(year_str) if year_str.isdigit() else 0,
                gp=gp or race_id,
                laps=_race_length(laps_df),
            )
        )
    return races


@router.get(
    "/races/{race_id}/degradation",
    response_model=dict[str, CompoundModelOut | None],
    tags=["races"],
)
def race_degradation(race_id: str) -> dict[str, CompoundModelOut | None]:
    """Per-compound degradation fit for a race (null where unavailable)."""
    _processed_csv(race_id)  # 404 if unknown
    model = build_degradation_model(race_id)
    return {
        compound: (CompoundModelOut(**m.to_dict()) if m is not None else None)
        for compound, m in model.compounds.items()
    }


@router.get("/races/{race_id}/laps", response_model=RaceLapsResponse, tags=["races"])
def race_laps(race_id: str) -> RaceLapsResponse:
    """Lean processed lap data for the degradation chart, plus the race length.

    ``race_laps`` (same value ``GET /races`` derives) is bundled here so the frontend
    can bound the strategy builder's pit-lap input without a second request.
    """
    path = _processed_csv(race_id)
    df = pd.read_csv(path, usecols=["Compound", "TyreLife", "LapTime", "LapNumber"])
    race_length = _race_length(df)
    df = df.dropna(subset=["Compound", "TyreLife", "LapTime"])
    laps = [
        LapOut(compound=str(row.Compound), tyre_life=float(row.TyreLife), lap_time=float(row.LapTime))
        for row in df.itertuples(index=False)
    ]
    return RaceLapsResponse(race_laps=race_length, laps=laps)


@router.post("/simulate", response_model=SimulateResponse, tags=["simulate"])
def simulate(request: SimulateRequest) -> SimulateResponse:
    """Run the Monte Carlo engine for a set of strategies and compare them.

    When ``VALIDATION_ENABLED`` is set, every strategy is sent to the .NET
    validation-service first; the first illegal strategy returns 400 (naming it
    and the service's ``reason``) and no simulations run. Compound availability
    is then checked against this race's ``DegradationModel``.
    """
    path = _processed_csv(request.race_id)  # 404 if unknown

    # Names key both the results dict and the win-probability matrix, so duplicates
    # would silently clobber a strategy. Reject before doing any simulation work.
    seen: set[str] = set()
    for strat in request.strategies:
        if strat.name in seen:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate strategy name {strat.name!r}; strategy names must be unique within a request.",
            )
        seen.add(strat.name)

    laps_df = pd.read_csv(path)
    race_laps = _race_length(laps_df)

    # Legality check via the .NET validation-service (if enabled), for EVERY strategy
    # before any simulation runs. First invalid strategy -> 400 with its name + the
    # service's reason; no simulations are executed.
    if _validation_enabled():
        for strat in request.strategies:
            valid, reason = _validate_remote(strat, race_laps)
            if not valid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Strategy {strat.name!r} failed validation: {reason}",
                )

    model = build_degradation_model(request.race_id)
    usable = set(model.usable_compounds())

    # Pre-flight: reject any strategy referencing an unavailable compound.
    for strat in request.strategies:
        for compound in [strat.start_compound, *(s.compound for s in strat.stops)]:
            if compound.upper() not in usable:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Strategy {strat.name!r} references compound {compound.upper()!r}, which has "
                        f"no usable degradation fit for race {request.race_id!r}. "
                        f"Usable compounds: {sorted(usable)}."
                    ),
                )

    pit_loss = load_pit_loss(request.race_id)
    sc_probability = estimate_sc_probability(laps_df)

    results = {}
    for strat in request.strategies:
        domain = Strategy(
            name=strat.name,
            start_compound=strat.start_compound.upper(),
            stops=[PitStop(lap=s.lap, compound=s.compound.upper()) for s in strat.stops],
        )
        try:
            results[strat.name] = simulate_strategy(
                domain,
                model,
                race_laps=race_laps,
                pit_loss=pit_loss,
                sc_probability=sc_probability,
                n_runs=request.n_runs,
                seed=request.seed,
            )
        except ValueError as exc:  # structurally invalid plan (e.g. non-increasing stops)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    summary = compare_strategies(results)

    return SimulateResponse(
        meta=SimulateMeta(
            race_id=request.race_id,
            race_laps=race_laps,
            pit_loss=pit_loss,
            sc_probability=sc_probability,
            n_runs=request.n_runs,
            seed=request.seed,
        ),
        strategies={name: StrategyResultOut(**res.to_dict()) for name, res in results.items()},
        win_probability=summary["win_probability"],
    )
