"""EDA sanity check: lap time vs tyre age per compound (PROJECT_SPEC.md Phase 1).

This is a plain ``# %%`` cell script rather than a ``.ipynb`` notebook, on purpose:
    * it runs headless from the CLI (``python notebooks/eda_lap_times.py``), so it
      works in CI and over SSH without a Jupyter kernel;
    * it diffs cleanly in git (no JSON/output-cell noise), which matters for a
      portfolio repo;
    * Cursor / VS Code still renders the ``# %%`` markers as runnable cells, so you
      keep the interactive notebook experience when you want it.

It loads one processed race and scatters LapTime vs TyreLife, one colour per
compound, with a per-compound linear fit overlaid — a preview of the Phase 2
degradation model, purely to eyeball that the data looks sane.

Usage:
    python notebooks/eda_lap_times.py                # defaults to 2023 Monza
    python notebooks/eda_lap_times.py 2023_Singapore
"""

# %%
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = BACKEND_ROOT / "data" / "processed"

# Official-ish F1 compound colours so the plot reads at a glance.
COMPOUND_COLORS = {
    "SOFT": "#da291c",
    "MEDIUM": "#ffd12e",
    "HARD": "#b0b0b0",
    "INTERMEDIATE": "#43b02a",
    "WET": "#0067ad",
}


# %%
def load_race(race_id: str) -> pd.DataFrame:
    """Load a processed race CSV by id, e.g. ``2023_Monza``."""
    path = PROCESSED_DIR / f"{race_id}.csv"
    if not path.exists():
        available = sorted(p.stem for p in PROCESSED_DIR.glob("*.csv"))
        raise FileNotFoundError(
            f"No processed race at {path}. Available: {available or 'none — run fetch_race_data first'}"
        )
    return pd.read_csv(path)


# %%
def plot_degradation(df: pd.DataFrame, race_id: str, save: bool = True) -> Path | None:
    """Scatter LapTime vs TyreLife per compound with a linear fit overlay."""
    fig, ax = plt.subplots(figsize=(10, 6))

    for compound, group in df.groupby("Compound"):
        group = group.dropna(subset=["TyreLife", "LapTime"])
        if group.empty:
            continue
        color = COMPOUND_COLORS.get(str(compound).upper(), "#333333")
        ax.scatter(
            group["TyreLife"],
            group["LapTime"],
            s=12,
            alpha=0.35,
            color=color,
            label=f"{compound} (n={len(group)})",
        )
        # Preview of the Phase 2 fit: LapTime = base_pace + deg_rate * TyreLife.
        if group["TyreLife"].nunique() >= 2:
            slope, intercept = np.polyfit(group["TyreLife"], group["LapTime"], 1)
            xs = np.linspace(group["TyreLife"].min(), group["TyreLife"].max(), 50)
            ax.plot(xs, intercept + slope * xs, color=color, linewidth=2)

    ax.set_xlabel("Tyre age (laps)")
    ax.set_ylabel("Lap time (s)")
    ax.set_title(f"Lap time vs tyre age by compound — {race_id}")
    ax.legend(title="Compound")
    ax.grid(True, alpha=0.2)

    # Clip the y-axis to the sensible pace band so SC/traffic outliers don't
    # squash the interesting part of the plot.
    lap_times = df["LapTime"].dropna()
    if not lap_times.empty:
        lo = lap_times.quantile(0.01)
        hi = lap_times.quantile(0.95)
        ax.set_ylim(lo - 1, hi + 1)

    fig.tight_layout()

    if save:
        out_path = Path(__file__).resolve().parent / f"eda_{race_id}.png"
        fig.savefig(out_path, dpi=120)
        print(f"Saved plot -> {out_path.name}")
        return out_path
    plt.show()
    return None


# %%
if __name__ == "__main__":
    race = sys.argv[1] if len(sys.argv) > 1 else "2023_Monza"
    frame = load_race(race)
    print(f"Loaded {len(frame)} laps for {race}")
    print(frame["Compound"].value_counts())
    plot_degradation(frame, race)
