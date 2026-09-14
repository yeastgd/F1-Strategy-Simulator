"""Tyre degradation model (PROJECT_SPEC.md section 5).

Fits, per compound per race, a **two-predictor** linear model

    LapTime = base_pace + deg_rate * TyreLife + fuel_rate * RaceLap

via ``numpy.linalg.lstsq``. The second predictor (RaceLap, i.e. the lap number
in the race) absorbs fuel burn-off — cars get lighter and faster as the race
goes on. Fitting ``LapTime ~ TyreLife`` alone conflates the two and can even flip
the sign of the degradation slope at low-deg tracks (observed at Monza in Phase 1
EDA), so the fuel term is mandatory here. ``TyreLife`` resets to 0 each stint
while ``RaceLap`` climbs monotonically, so the predictors are not collinear and
``lstsq`` can separate tyre wear from fuel effect.

``deg_rate`` (the TyreLife coefficient) is what feeds the Monte Carlo simulator.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

Confidence = Literal["low", "medium", "high"]

# backend/app/models/degradation.py -> parents[2] == backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]
PROCESSED_DIR = BACKEND_ROOT / "data" / "processed"

# Minimum usable laps required to trust a fit. Below this we return None rather
# than fit on too little data (e.g. Monza has no SOFT stint at all; Singapore's
# SOFT sample is thin). Downstream code must treat None as "compound unavailable".
MIN_LAPS = 15

# Outlier trim: drop laps slower than this multiple of their stint's median lap
# time. Catches SC/VSC/traffic-compromised laps that slipped past the in/out-lap
# filter without touching legitimate green-flag pace.
OUTLIER_FACTOR = 1.5

# Confidence tiers from usable lap count (spec section 5): a thin-sample fit
# (e.g. Singapore SOFT ~51 laps) must be visibly flagged vs a 488-lap HARD fit.
CONFIDENCE_MEDIUM_MIN = 75
CONFIDENCE_HIGH_MIN = 200


def _confidence_tier(n_laps: int) -> Confidence:
    """<75 -> low, 75-200 -> medium, >200 -> high."""
    if n_laps > CONFIDENCE_HIGH_MIN:
        return "high"
    if n_laps >= CONFIDENCE_MEDIUM_MIN:
        return "medium"
    return "low"


@dataclass(frozen=True)
class CompoundModel:
    """Fitted degradation parameters for one compound in one race."""

    compound: str
    base_pace: float          # intercept (s): modelled pace at TyreLife=0, RaceLap=0
    deg_rate: float           # s per lap of tyre age (what the simulator consumes)
    fuel_rate: float          # s per race lap (usually negative: lighter car = faster)
    n_laps: int               # usable laps the fit was built from
    confidence: Confidence    # low/medium/high, derived from n_laps
    was_floored: bool = False  # True if a negative fitted deg_rate was clipped to 0

    def to_dict(self) -> dict[str, float | int | str | bool]:
        return {
            "base_pace": self.base_pace,
            "deg_rate": self.deg_rate,
            "fuel_rate": self.fuel_rate,
            "n_laps": self.n_laps,
            "confidence": self.confidence,
            "was_floored": self.was_floored,
        }


@dataclass(frozen=True)
class DegradationModel:
    """All per-compound fits for a single race.

    ``compounds`` maps each compound seen in the race to a ``CompoundModel`` or
    ``None`` when there wasn't enough data to fit it. Use ``usable_compounds()``
    to get only the compounds that are safe to simulate.
    """

    race_id: str
    compounds: dict[str, CompoundModel | None]

    def usable_compounds(self) -> list[str]:
        return [c for c, m in self.compounds.items() if m is not None]

    def get(self, compound: str) -> CompoundModel | None:
        return self.compounds.get(compound.upper())

    def to_dict(self) -> dict[str, dict[str, float | int] | None]:
        return {c: (m.to_dict() if m is not None else None) for c, m in self.compounds.items()}


def _prepare_compound_laps(
    laps_df: pd.DataFrame,
    compound: str,
    outlier_factor: float,
) -> pd.DataFrame:
    """Filter/clean laps for one compound: representative laps only, outliers trimmed.

    Steps (spec section 5):
      1. keep only the requested compound;
      2. defensively drop any in/out laps (already removed upstream, but re-check
         here so the function is correct on raw input too);
      3. drop the first lap of every stint (out-lap pace / warm-up, not steady state);
      4. require the numeric predictors to be present;
      5. trim laps slower than ``outlier_factor`` x the stint median.
    """
    df = laps_df[laps_df["Compound"].astype(str).str.upper() == compound.upper()].copy()

    # (2) belt-and-braces: exclude in/out laps if those columns are still around.
    for col in ("PitInTime", "PitOutTime"):
        if col in df.columns:
            df = df[df[col].isna()]

    df = df.dropna(subset=["TyreLife", "LapNumber", "LapTime", "Stint"])
    if df.empty:
        return df

    # Group by driver+stint when Driver is available, else fall back to Stint.
    group_keys = [k for k in ("Driver", "Stint") if k in df.columns]

    # (3) first lap of stint = the smallest lap number within each stint.
    is_first_of_stint = df.groupby(group_keys)["LapNumber"].transform("min") == df["LapNumber"]
    df = df[~is_first_of_stint]
    if df.empty:
        return df

    # (5) per-stint outlier trim.
    stint_median = df.groupby(group_keys)["LapTime"].transform("median")
    df = df[df["LapTime"] <= outlier_factor * stint_median]
    return df


def fit_degradation(
    laps_df: pd.DataFrame,
    compound: str,
    min_laps: int = MIN_LAPS,
    outlier_factor: float = OUTLIER_FACTOR,
) -> CompoundModel | None:
    """Fit the two-predictor degradation model for one compound.

    Returns a ``CompoundModel`` or ``None`` if fewer than ``min_laps`` usable laps
    remain after filtering (thin/absent compound), so callers can simply skip it.
    """
    df = _prepare_compound_laps(laps_df, compound, outlier_factor)
    n = len(df)
    if n < min_laps:
        return None

    tyre_life = df["TyreLife"].to_numpy(dtype=float)
    race_lap = df["LapNumber"].to_numpy(dtype=float)
    lap_time = df["LapTime"].to_numpy(dtype=float)

    # Design matrix: [1, TyreLife, RaceLap] -> [intercept, deg_rate, fuel_rate].
    design = np.column_stack([np.ones(n), tyre_life, race_lap])
    coeffs, *_ = np.linalg.lstsq(design, lap_time, rcond=None)
    intercept, deg_rate, fuel_rate = coeffs

    # Floor deg_rate at 0: a negative slope (tyres "getting faster" with age) is a
    # track-evolution/noise artifact, not physics. Keep the clip visible via
    # was_floored rather than silently altering the number.
    deg_rate = float(deg_rate)
    was_floored = deg_rate < 0.0
    if was_floored:
        deg_rate = 0.0

    return CompoundModel(
        compound=compound.upper(),
        base_pace=float(intercept),
        deg_rate=deg_rate,
        fuel_rate=float(fuel_rate),
        n_laps=n,
        confidence=_confidence_tier(n),
        was_floored=was_floored,
    )


def build_degradation_model(race_id: str, processed_dir: str | Path = PROCESSED_DIR) -> DegradationModel:
    """Load a processed race CSV and fit every compound present in it."""
    path = Path(processed_dir) / f"{race_id}.csv"
    if not path.exists():
        available = sorted(p.stem for p in Path(processed_dir).glob("*.csv"))
        raise FileNotFoundError(
            f"No processed race at {path}. Available: {available or 'none - run fetch_race_data first'}"
        )

    laps = pd.read_csv(path)
    compounds = sorted(laps["Compound"].dropna().astype(str).str.upper().unique())
    models: dict[str, CompoundModel | None] = {c: fit_degradation(laps, c) for c in compounds}
    return DegradationModel(race_id=race_id, compounds=models)


def main() -> None:
    """Fit + print the degradation table for the three reference races."""
    race_ids = ["2023_Monza", "2023_Spain", "2023_Singapore"]
    header = (
        f"{'race':<16}{'compound':<10}{'base_pace':>10}{'deg_rate':>10}{'fuel_rate':>11}"
        f"{'n_laps':>8}{'floored':>9}{'confidence':>12}"
    )
    print(header)
    print("-" * len(header))
    for race_id in race_ids:
        model = build_degradation_model(race_id)
        for compound, m in model.compounds.items():
            if m is None:
                print(f"{race_id:<16}{compound:<10}{'None (insufficient data)':>39}")
            else:
                print(
                    f"{race_id:<16}{compound:<10}{m.base_pace:>10.3f}{m.deg_rate:>10.4f}"
                    f"{m.fuel_rate:>11.4f}{m.n_laps:>8}{m.was_floored!s:>9}{m.confidence:>12}"
                )
        print("-" * len(header))


if __name__ == "__main__":
    main()
