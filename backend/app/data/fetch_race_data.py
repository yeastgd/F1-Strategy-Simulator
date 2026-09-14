"""FastF1 extraction layer (PROJECT_SPEC.md section 4).

Pulls real historical F1 race laps via FastF1, keeps the columns needed for the
degradation model + Monte Carlo engine, drops unrepresentative in/out laps, and
persists a tidy CSV per race to ``data/processed/{year}_{gp}.csv`` so the rest of
the app never needs FastF1 (or a network connection) at runtime.

Run directly to (re)generate the three reference races from the spec:

    python -m app.data.fetch_race_data
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import fastf1
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths. Resolve relative to the backend/ root so this works no matter what the
# current working directory is when the module is imported or run.
#   backend/app/data/fetch_race_data.py -> parents[2] == backend/
# ---------------------------------------------------------------------------
BACKEND_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = BACKEND_ROOT / "app" / "data" / "cache"
PROCESSED_DIR = BACKEND_ROOT / "data" / "processed"

# Columns pulled from session.laps. The first block is exactly what the spec
# lists; Driver / DriverNumber / LapNumber are added so a processed CSV is
# self-describing (you can tell whose lap each row is without re-joining).
LAP_COLUMNS = [
    "Driver",
    "DriverNumber",
    "LapNumber",
    "Stint",
    "Compound",
    "TyreLife",
    "LapTime",
    "PitInTime",
    "PitOutTime",
    "TrackStatus",
]

# The three reference races (year, gp). ``gp`` is used both for FastF1's fuzzy
# event lookup and for the output filename, so keep it a single clean token.
REFERENCE_RACES: list[tuple[int, str]] = [
    (2023, "Monza"),      # low deg, low SC probability
    (2023, "Spain"),      # high deg, medium SC probability
    (2023, "Singapore"),  # high SC probability, street circuit
]

# Timedelta columns we convert to float seconds on the way out to CSV so the
# downstream numeric code (polyfit, pit-loss median, ...) never has to parse
# pandas timedelta strings back from disk.
_TIMEDELTA_COLUMNS = ["LapTime", "PitInTime", "PitOutTime"]

# Sanity band for the computed pit-lane time loss (seconds). Real-world pit loss
# is ~18-25s depending on track; if the estimate falls outside this (generous)
# band the calculation is almost certainly wrong (SC-heavy stops, bad pairing,
# missing lap times), so we refuse to persist it and flag instead of writing a
# bogus value into the meta file.
PLAUSIBLE_PIT_LOSS_RANGE = (12.0, 40.0)


def enable_cache() -> None:
    """Enable FastF1's on-disk cache at ``app/data/cache/`` (created if missing)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE_DIR))


def fetch_race(year: int, gp: str) -> pd.DataFrame:
    """Load a race session and return its laps as a plain DataFrame.

    Args:
        year: Season, e.g. ``2023``.
        gp: Event identifier FastF1 can fuzzy-match (e.g. ``"Monza"``, ``"Spain"``).

    Returns:
        A DataFrame with the columns in ``LAP_COLUMNS``. Timedelta columns
        (LapTime, PitInTime, PitOutTime) are converted to float seconds.
    """
    enable_cache()

    logger.info("Loading %s %s race session ...", year, gp)
    session = fastf1.get_session(year, gp, "R")
    # Only laps are needed for Phase 1; skip telemetry/weather/messages for speed.
    session.load(laps=True, telemetry=False, weather=False, messages=False)

    laps = session.laps
    available = [c for c in LAP_COLUMNS if c in laps.columns]
    missing = set(LAP_COLUMNS) - set(available)
    if missing:
        logger.warning("Session %s %s missing lap columns: %s", year, gp, sorted(missing))

    df = laps[available].copy()

    # Convert timedeltas -> float seconds (NaN preserved for non-pit laps).
    for col in _TIMEDELTA_COLUMNS:
        if col in df.columns:
            df[col] = df[col].dt.total_seconds()

    # Detach from FastF1's Laps subclass -> a vanilla DataFrame.
    return pd.DataFrame(df).reset_index(drop=True)


def compute_pit_loss(df: pd.DataFrame) -> float | None:
    """Estimate the race's pit-lane time loss in seconds (PROJECT_SPEC.md section 4).

    Must be called on the *raw* laps (before in/out laps are dropped), since the
    in-lap and out-lap times are exactly what carry the pit-lane cost.

    For each pit stop:
        pit_time_loss = (in_lap_time + out_lap_time)
                        - 2 * median_clean_lap_time_for_that_driver_stint
    where the reference is the median of that driver's clean (non in/out) laps in
    the stint the in-lap belongs to. The in-lap is the last lap of the stint that
    is ending, so its stint pace is the natural "what a normal lap here costs"
    baseline; we fall back to the driver's overall clean median if that stint has
    no clean laps (e.g. a very short stint). The race-level pit loss is the median
    across all stops, which is robust to the occasional cheap under-SC stop.

    Returns:
        The median pit loss in seconds, or ``None`` if it can't be computed.
    """
    required = {"Driver", "LapNumber", "Stint", "LapTime", "PitInTime", "PitOutTime"}
    if not required.issubset(df.columns):
        logger.warning("Cannot compute pit loss - missing columns: %s", required - set(df.columns))
        return None

    is_in_lap = df["PitInTime"].notna()
    is_out_lap = df["PitOutTime"].notna()
    clean = df[~is_in_lap & ~is_out_lap & df["LapTime"].notna()]

    stint_median = clean.groupby(["Driver", "Stint"])["LapTime"].median()
    driver_median = clean.groupby("Driver")["LapTime"].median()

    losses: list[float] = []
    for driver, g in df.sort_values("LapNumber").groupby("Driver"):
        g = g.set_index("LapNumber")
        in_laps = g[g["PitInTime"].notna()]
        for lap_num, in_row in in_laps.iterrows():
            out_lap_num = lap_num + 1
            if out_lap_num not in g.index:
                continue  # driver pitted then retired -> no out-lap
            out_row = g.loc[out_lap_num]
            if isinstance(out_row, pd.DataFrame):  # guard against dup lap numbers
                out_row = out_row.iloc[0]

            in_time = in_row["LapTime"]
            out_time = out_row["LapTime"]
            if pd.isna(in_time) or pd.isna(out_time):
                continue

            ref = stint_median.get((driver, in_row["Stint"]))
            if ref is None or pd.isna(ref):
                ref = driver_median.get(driver)
            if ref is None or pd.isna(ref):
                continue

            losses.append(float(in_time) + float(out_time) - 2.0 * float(ref))

    if not losses:
        logger.warning("Cannot compute pit loss - no usable pit stops found")
        return None

    return float(pd.Series(losses).median())


def process_and_save(year: int, gp: str, out_dir: str | Path = PROCESSED_DIR) -> Path:
    """Fetch, clean, and persist one race to ``{out_dir}/{year}_{gp}.csv``.

    Cleaning (per spec section 4): drop in-laps and out-laps, since a lap where
    the car enters or exits the pits is not representative green-flag pace. We
    additionally drop laps with no recorded LapTime (e.g. lap 1 from a standing
    start, laps cut short) because they carry no usable degradation signal.

    Returns:
        Path to the written CSV.
    """
    df = fetch_race(year, gp)

    n_raw = len(df)

    # --- pit loss MUST be computed here, before in/out laps are dropped ---
    pit_loss = compute_pit_loss(df)

    # In-lap: PitInTime present. Out-lap: PitOutTime present.
    is_in_lap = df["PitInTime"].notna() if "PitInTime" in df else False
    is_out_lap = df["PitOutTime"].notna() if "PitOutTime" in df else False
    df = df[~(is_in_lap | is_out_lap)].copy()
    n_after_pit = len(df)

    # Drop laps with no lap time (unusable for degradation / plotting).
    df = df[df["LapTime"].notna()].copy()
    n_after_time = len(df)

    logger.info(
        "%s %s: %d raw laps -> %d after dropping in/out laps -> %d after dropping null LapTime",
        year,
        gp,
        n_raw,
        n_after_pit,
        n_after_time,
    )

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{year}_{gp}.csv"
    df.to_csv(out_path, index=False)
    logger.info("Wrote %d laps -> %s", len(df), out_path)

    _write_meta(year, gp, pit_loss, out_dir)
    return out_path


def _write_meta(year: int, gp: str, pit_loss: float | None, out_dir: Path) -> Path:
    """Write ``{year}_{gp}_meta.json`` with the pit loss, guarding against nonsense.

    If the computed pit loss is missing or outside ``PLAUSIBLE_PIT_LOSS_RANGE`` we
    refuse to persist a bogus value: ``pit_loss_seconds`` is written as ``null``
    with a ``pit_loss_warning`` explaining why, and a WARNING is logged so it gets
    noticed rather than silently feeding the simulator later.
    """
    lo, hi = PLAUSIBLE_PIT_LOSS_RANGE
    meta: dict[str, object] = {}

    if pit_loss is None:
        meta["pit_loss_seconds"] = None
        meta["pit_loss_warning"] = "could not be computed from the race laps"
        logger.warning("%s %s: pit loss could not be computed", year, gp)
    elif not (lo <= pit_loss <= hi):
        meta["pit_loss_seconds"] = None
        meta["pit_loss_raw"] = round(pit_loss, 3)
        meta["pit_loss_warning"] = (
            f"computed {pit_loss:.3f}s is outside the plausible range {lo}-{hi}s; not persisted"
        )
        logger.warning(
            "%s %s: computed pit loss %.3fs is outside plausible range %s-%ss - NOT writing it",
            year,
            gp,
            pit_loss,
            lo,
            hi,
        )
    else:
        meta["pit_loss_seconds"] = round(pit_loss, 3)
        logger.info("%s %s: pit_loss_seconds = %.3f", year, gp, pit_loss)

    meta_path = out_dir / f"{year}_{gp}_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    logger.info("Wrote meta -> %s", meta_path)
    return meta_path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    for year, gp in REFERENCE_RACES:
        try:
            process_and_save(year, gp)
        except Exception:  # surface which race failed, keep going
            logger.exception("Failed to process %s %s", year, gp)


if __name__ == "__main__":
    main()
