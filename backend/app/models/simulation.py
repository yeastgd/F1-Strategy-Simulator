"""Monte Carlo pit-strategy simulation engine (PROJECT_SPEC.md section 6).

Given a race's fitted `DegradationModel` (section 5), the persisted pit loss
(`_meta.json`, section 4) and a safety-car probability estimated from the race's
`TrackStatus`, this simulates a strategy lap-by-lap `N` times and aggregates the
finishing-time distribution, then compares strategies pairwise.

Modelling choices (kept deliberately close to the spec):
  * Per-lap pace is ``base_pace + deg_rate * tyre_age + noise`` with
    ``noise ~ Normal(0, sigma)``. The fitted ``fuel_rate`` is intentionally NOT
    applied here (the spec's per-lap formula omits it): fuel burn is identical
    across strategies on the same race, so it cancels in every pairwise
    comparison. Absolute finishing times are therefore inflated (no fuel
    lightening) but relative strategy ranking — the whole point — is unaffected.
  * A safety car is rolled independently each lap at ``sc_probability``. Per the
    spec, SC only makes pitting cheaper (pit loss halved on an SC lap); it does
    not slow green-lap pace (which would hit all strategies equally anyway).
  * ``tyre_age`` is 1 on the first lap of a stint, matching FastF1's ``TyreLife``.

Common random numbers: for a given ``seed`` the noise and SC draws depend only on
``(n_runs, race_laps)``, not on the strategy, so simulating several strategies
with the same seed makes run *i* share identical race conditions. That is what
makes the pairwise win probabilities in ``compare_strategies`` a like-for-like
comparison of strategy merit rather than of independent noise.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from app.models.degradation import (
    PROCESSED_DIR,
    Confidence,
    DegradationModel,
)

# Std-dev (seconds) of per-lap noise. Representative of green-lap scatter left
# over after the degradation fit; exposed as a parameter on simulate_strategy.
LAP_TIME_SIGMA = 0.35

# TrackStatus digits that mean a safety car / VSC is out (spec section 4/6).
# 4 = Safety Car, 6 = VSC deployed, 7 = VSC ending.
SC_VSC_DIGITS = frozenset("467")

# Under a safety car, a pit stop costs far less (the whole field is slowed, so the
# time lost relative to rivals shrinks). We model this as halving the pit loss.
SC_PIT_LOSS_FACTOR = 0.5

_CONFIDENCE_ORDER: dict[Confidence, int] = {"low": 0, "medium": 1, "high": 2}


# ---------------------------------------------------------------------------
# Inputs derived from the processed data
# ---------------------------------------------------------------------------
def _status_to_str(value: object) -> str:
    """Normalise a TrackStatus cell to a plain digit string (''=unknown/NaN)."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def estimate_sc_probability(laps_df: pd.DataFrame) -> float:
    """Fraction of race laps that were under safety car / VSC.

    ``TrackStatus`` values are concatenated flag strings (e.g. ``"671"`` = VSC +
    VSC-ending + SC all on one entry), so we test for the *presence* of any SC/VSC
    digit (4/6/7) rather than string equality. When a ``LapNumber`` column is
    present we deduplicate to one status per race lap (a lap is "under SC" if any
    car's status that lap shows an SC/VSC digit); otherwise we score every row
    (used by the unit test, which passes a bare status series).
    """
    if "TrackStatus" not in laps_df.columns or laps_df.empty:
        return 0.0

    flagged = laps_df["TrackStatus"].map(
        lambda v: any(d in _status_to_str(v) for d in SC_VSC_DIGITS)
    )

    if "LapNumber" in laps_df.columns:
        per_lap = flagged.groupby(laps_df["LapNumber"]).any()
        return float(per_lap.mean())
    return float(flagged.mean())


def load_pit_loss(race_id: str, processed_dir: str | Path = PROCESSED_DIR) -> float:
    """Read ``pit_loss_seconds`` from the race's ``_meta.json`` (spec section 4/6)."""
    meta_path = Path(processed_dir) / f"{race_id}_meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"No meta file at {meta_path} - run fetch_race_data first")

    meta = json.loads(meta_path.read_text())
    pit_loss = meta.get("pit_loss_seconds")
    if pit_loss is None:
        raise ValueError(
            f"{meta_path.name} has no usable pit_loss_seconds "
            f"(value is null - see pit_loss_warning in the file)"
        )
    return float(pit_loss)


# ---------------------------------------------------------------------------
# Strategy definition
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PitStop:
    lap: int       # the lap at the END of which the car pits
    compound: str  # the compound fitted at this stop


@dataclass(frozen=True)
class Strategy:
    """A pit strategy: a starting compound then an ordered list of stops.

    NOTE: the spec's wire shape is ``{name, stops:[{lap, compound}]}``, but a
    simulation is under-specified without the first stint's compound (a 1-stop is
    two stints, one stop). ``start_compound`` supplies it; ``from_dict`` accepts
    an explicit ``start_compound`` or, failing that, treats the first stop as the
    opening stint so the Phase 4 API can adapt either convention.
    """

    name: str
    start_compound: str
    stops: list[PitStop] = field(default_factory=list)

    @property
    def compounds_used(self) -> list[str]:
        return [self.start_compound, *(s.compound for s in self.stops)]

    @classmethod
    def from_dict(cls, data: dict) -> Strategy:
        raw_stops = [PitStop(int(s["lap"]), str(s["compound"]).upper()) for s in data.get("stops", [])]
        start = data.get("start_compound")
        if start is None:
            if not raw_stops:
                raise ValueError(f"Strategy {data.get('name')!r} has no start_compound and no stops")
            start, raw_stops = raw_stops[0].compound, raw_stops[1:]
        return cls(name=str(data["name"]), start_compound=str(start).upper(), stops=raw_stops)


# ---------------------------------------------------------------------------
# Simulation result + aggregation
# ---------------------------------------------------------------------------
@dataclass
class SimulationResult:
    name: str
    samples: np.ndarray          # total race time per run (seconds), shape (n_runs,)
    confidence: Confidence       # lowest confidence among compounds used
    sc_probability: float
    pit_loss: float
    n_stops: int

    @property
    def n_runs(self) -> int:
        return int(self.samples.size)

    @property
    def mean_time(self) -> float:
        return float(self.samples.mean())

    @property
    def std(self) -> float:
        return float(self.samples.std(ddof=1))

    def percentiles(self, qs: tuple[int, ...] = (5, 25, 50, 75, 95)) -> dict[str, float]:
        values = np.percentile(self.samples, qs)
        return {f"p{q}": float(v) for q, v in zip(qs, values)}

    def to_dict(self, sample_size: int = 500) -> dict:
        sample = self.samples[:sample_size]
        return {
            "mean_time": self.mean_time,
            "std": self.std,
            "percentiles": self.percentiles(),
            "confidence": self.confidence,
            "n_stops": self.n_stops,
            "sample": sample.tolist(),
        }


def _build_lap_plan(
    strategy: Strategy,
    degradation_model: DegradationModel,
    race_laps: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (deterministic lap-time per lap, pit-lap boolean mask).

    Raises ValueError on an unavailable compound or a structurally invalid plan
    (non-increasing stops, stop outside the race). Strategy *legality* (min 2
    compounds, gaps, etc.) is the caller's job (Phase 4 / .NET service).
    """
    # Validate every compound the strategy touches is actually fitted for this race.
    for compound in strategy.compounds_used:
        model = degradation_model.get(compound)
        if model is None:
            usable = degradation_model.usable_compounds()
            raise ValueError(
                f"Strategy {strategy.name!r} uses compound {compound!r}, which has no usable "
                f"degradation fit for race {degradation_model.race_id!r} "
                f"(usable compounds: {usable}). Validate strategies before simulating."
            )

    laps = np.arange(1, race_laps + 1)
    lap_base = np.empty(race_laps, dtype=float)
    pit_mask = np.zeros(race_laps, dtype=bool)

    # Stint boundaries: start_compound until stops[0].lap, then each stop's compound.
    boundaries = [s.lap for s in strategy.stops]
    prev = 0
    for lap in boundaries:
        if not (1 <= lap < race_laps):
            raise ValueError(f"Strategy {strategy.name!r}: pit lap {lap} outside [1, {race_laps - 1}]")
        if lap <= prev:
            raise ValueError(f"Strategy {strategy.name!r}: pit laps must strictly increase (got {lap} after {prev})")
        prev = lap

    stint_compounds = strategy.compounds_used
    stint_starts = [1, *[b + 1 for b in boundaries]]
    stint_ends = [*boundaries, race_laps]

    for compound, start, end in zip(stint_compounds, stint_starts, stint_ends):
        model = degradation_model.get(compound)
        stint_laps = laps[(laps >= start) & (laps <= end)]
        tyre_age = stint_laps - start + 1  # 1 on the first lap of the stint
        lap_base[stint_laps - 1] = model.base_pace + model.deg_rate * tyre_age

    for lap in boundaries:
        pit_mask[lap - 1] = True

    return lap_base, pit_mask


def simulate_strategy(
    strategy: Strategy,
    degradation_model: DegradationModel,
    race_laps: int,
    pit_loss: float,
    sc_probability: float,
    n_runs: int = 5000,
    seed: int | None = None,
    lap_time_sigma: float = LAP_TIME_SIGMA,
) -> SimulationResult:
    """Monte Carlo one strategy over ``n_runs`` simulated races."""
    lap_base, pit_mask = _build_lap_plan(strategy, degradation_model, race_laps)

    rng = np.random.default_rng(seed)
    # Draw order is fixed (noise, then SC) and shapes depend only on (n_runs,
    # race_laps), so the same seed yields identical draws across strategies.
    noise = rng.normal(0.0, lap_time_sigma, size=(n_runs, race_laps))
    sc_active = rng.random((n_runs, race_laps)) < sc_probability

    # Pit loss on pit laps, halved on laps where a safety car is out.
    pit_cost = pit_mask[np.newaxis, :] * pit_loss
    pit_cost = pit_cost * np.where(sc_active, SC_PIT_LOSS_FACTOR, 1.0)

    lap_times = lap_base[np.newaxis, :] + noise + pit_cost
    totals = lap_times.sum(axis=1)

    confidences = [degradation_model.get(c).confidence for c in strategy.compounds_used]
    lowest = min(confidences, key=lambda c: _CONFIDENCE_ORDER[c])

    return SimulationResult(
        name=strategy.name,
        samples=totals,
        confidence=lowest,
        sc_probability=sc_probability,
        pit_loss=pit_loss,
        n_stops=len(strategy.stops),
    )


def compare_strategies(results: dict[str, SimulationResult]) -> dict:
    """Aggregate per-strategy stats + pairwise win probabilities.

    Win probability pairs runs by index (common random numbers), so all results
    must share the same ``n_runs`` and should have been simulated with the same
    seed for the comparison to reflect strategy merit rather than noise.
    """
    names = list(results)
    run_counts = {r.n_runs for r in results.values()}
    if len(run_counts) > 1:
        raise ValueError(f"All strategies must have equal n_runs to pair runs; got {run_counts}")

    per_strategy = {
        name: {
            "mean_time": res.mean_time,
            "std": res.std,
            "percentiles": res.percentiles(),
            "confidence": res.confidence,
            "n_stops": res.n_stops,
        }
        for name, res in results.items()
    }

    win_probability: dict[str, dict[str, float]] = {}
    for a in names:
        win_probability[a] = {}
        for b in names:
            if a == b:
                continue
            wins = float((results[a].samples < results[b].samples).mean())
            win_probability[a][b] = wins

    return {"strategies": per_strategy, "win_probability": win_probability}


# ---------------------------------------------------------------------------
# End-to-end demo (python -m app.models.simulation)
# ---------------------------------------------------------------------------
def _race_laps_from_csv(race_id: str) -> tuple[int, pd.DataFrame]:
    laps = pd.read_csv(PROCESSED_DIR / f"{race_id}.csv")
    return int(laps["LapNumber"].max()), laps


def _demo_scenarios() -> dict[str, list[Strategy]]:
    """A couple of hand-picked strategies per race for the sanity-check run."""
    return {
        "2023_Monza": [
            Strategy("1-stop early(26)", "MEDIUM", [PitStop(26, "HARD")]),
            Strategy("1-stop late(32)", "MEDIUM", [PitStop(32, "HARD")]),
            Strategy("2-stop M-H-H", "MEDIUM", [PitStop(18, "HARD"), PitStop(36, "HARD")]),
        ],
        "2023_Spain": [
            Strategy("1-stop early(30)", "MEDIUM", [PitStop(30, "HARD")]),
            Strategy("1-stop late(38)", "MEDIUM", [PitStop(38, "HARD")]),
            Strategy("2-stop S-M-H", "SOFT", [PitStop(20, "MEDIUM"), PitStop(44, "HARD")]),
        ],
        "2023_Singapore": [
            Strategy("1-stop early(28)", "HARD", [PitStop(28, "MEDIUM")]),
            Strategy("1-stop late(34)", "HARD", [PitStop(34, "MEDIUM")]),
            Strategy("2-stop H-M-H", "HARD", [PitStop(20, "MEDIUM"), PitStop(42, "HARD")]),
        ],
    }


def main() -> None:
    from app.models.degradation import build_degradation_model

    seed = 20230914
    for race_id, strategies in _demo_scenarios().items():
        race_laps, laps = _race_laps_from_csv(race_id)
        model = build_degradation_model(race_id)
        pit_loss = load_pit_loss(race_id)
        sc_prob = estimate_sc_probability(laps)

        results = {
            s.name: simulate_strategy(s, model, race_laps, pit_loss, sc_prob, seed=seed)
            for s in strategies
        }
        summary = compare_strategies(results)

        print("=" * 78)
        print(f"{race_id}  |  race_laps={race_laps}  pit_loss={pit_loss:.2f}s  sc_prob={sc_prob:.3f}")
        print("-" * 78)
        for name, stats in summary["strategies"].items():
            p = stats["percentiles"]
            print(
                f"  {name:<16} mean={stats['mean_time']:.2f}s  std={stats['std']:.2f}  "
                f"p50={p['p50']:.2f}  [p5={p['p5']:.1f}, p95={p['p95']:.1f}]  "
                f"stops={stats['n_stops']}  conf={stats['confidence']}"
            )
        print("  win probability:")
        for a, opponents in summary["win_probability"].items():
            for b, prob in opponents.items():
                print(f"    P({a} < {b}) = {prob:.3f}")


if __name__ == "__main__":
    main()
