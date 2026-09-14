"""Unit tests for the tyre degradation model (PROJECT_SPEC.md section 5)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.models.degradation import CompoundModel, fit_degradation


def _make_synthetic_race(
    deg_rate: float,
    fuel_rate: float,
    base_pace: float = 90.0,
    n_stints: int = 3,
    stint_len: int = 20,
    noise_sigma: float = 0.0,
    seed: int = 0,
) -> pd.DataFrame:
    """Build laps where LapTime is a KNOWN mix of tyre wear AND fuel burn.

    Each stint runs TyreLife 1..stint_len while RaceLap keeps climbing across the
    whole race, exactly like a real race: within a stint TyreLife and RaceLap move
    together, but TyreLife resets every stop while RaceLap does not. That reset is
    what lets a two-predictor fit separate the two effects — and what makes a naive
    single-variable fit conflate them.

        LapTime = base_pace + deg_rate * TyreLife + fuel_rate * RaceLap + noise
    """
    rng = np.random.default_rng(seed)
    rows = []
    race_lap = 0
    for stint in range(1, n_stints + 1):
        for tyre_life in range(1, stint_len + 1):
            race_lap += 1
            lap_time = base_pace + deg_rate * tyre_life + fuel_rate * race_lap
            if noise_sigma:
                lap_time += rng.normal(0.0, noise_sigma)
            rows.append(
                {
                    "Driver": "TST",
                    "LapNumber": float(race_lap),
                    "Stint": float(stint),
                    "Compound": "MEDIUM",
                    "TyreLife": float(tyre_life),
                    "LapTime": lap_time,
                }
            )
    return pd.DataFrame(rows)


def test_fit_recovers_deg_rate_despite_fuel_confound():
    """The two-predictor fit must recover deg_rate even when fuel burn is mixed in.

    Parameters are chosen so the fuel effect is strong enough to INVERT the sign of
    a naive LapTime~TyreLife slope: true degradation is +0.04 s/lap, but naive fit
    sees roughly deg + fuel = -0.02 s/lap (tyres 'getting faster with age'). This is
    exactly the Phase 1 bug; the assertions below would fail against a polyfit model.
    """
    true_deg = 0.04
    true_fuel = -0.06
    df = _make_synthetic_race(deg_rate=true_deg, fuel_rate=true_fuel)

    model = fit_degradation(df, "MEDIUM")
    assert isinstance(model, CompoundModel)

    # Two-predictor fit recovers both coefficients (noise-free -> near exact).
    assert abs(model.deg_rate - true_deg) < 1e-6
    assert abs(model.fuel_rate - true_fuel) < 1e-6

    # Sanity: a naive single-variable polyfit on the SAME data gets it badly wrong,
    # even flipping the sign, which is precisely the failure the fuel term fixes.
    naive_slope = np.polyfit(df["TyreLife"].to_numpy(), df["LapTime"].to_numpy(), 1)[0]
    assert naive_slope < 0  # inverted sign: naive says tyres get faster with age
    assert abs(naive_slope - true_deg) > 0.05  # visibly wrong vs the true +0.04


def test_fit_recovers_deg_rate_with_noise():
    """With realistic noise the fit should still land close to the true deg_rate."""
    true_deg = 0.05
    true_fuel = -0.03
    df = _make_synthetic_race(deg_rate=true_deg, fuel_rate=true_fuel, noise_sigma=0.15, seed=42)

    model = fit_degradation(df, "MEDIUM")
    assert isinstance(model, CompoundModel)
    assert abs(model.deg_rate - true_deg) < 0.02
    assert abs(model.fuel_rate - true_fuel) < 0.02


def test_returns_none_for_thin_sample():
    """Fewer than 15 usable laps -> None, not a fit and not an exception."""
    # One short stint of 12 laps; after dropping the first lap of the stint only
    # 11 usable laps remain, which is below the 15-lap threshold.
    df = _make_synthetic_race(deg_rate=0.05, fuel_rate=-0.03, n_stints=1, stint_len=12)
    assert len(df) == 12

    assert fit_degradation(df, "MEDIUM") is None


def test_returns_none_for_absent_compound():
    """A compound not present in the data -> None (e.g. Monza has no SOFT)."""
    df = _make_synthetic_race(deg_rate=0.05, fuel_rate=-0.03)
    assert fit_degradation(df, "SOFT") is None


def test_negative_slope_is_floored_to_zero():
    """A genuinely negative fitted slope must clip to 0 with was_floored=True."""
    df = _make_synthetic_race(deg_rate=-0.03, fuel_rate=-0.03)

    model = fit_degradation(df, "MEDIUM")
    assert isinstance(model, CompoundModel)
    assert model.was_floored is True
    assert model.deg_rate == 0.0
    # Only deg_rate is clipped; the fuel term (regression logic) is untouched.
    assert abs(model.fuel_rate - (-0.03)) < 1e-6

    # A normal positive-slope fit leaves the flag off.
    positive = fit_degradation(_make_synthetic_race(deg_rate=0.05, fuel_rate=-0.03), "MEDIUM")
    assert positive is not None and positive.was_floored is False


def test_confidence_tier_from_n_laps():
    """confidence follows n_laps bands: <75 low, 75-200 medium, >200 high."""
    # usable laps = n_stints * (stint_len - 1) since the first lap of each stint drops.
    low = fit_degradation(_make_synthetic_race(0.05, -0.03, n_stints=3, stint_len=15), "MEDIUM")
    medium = fit_degradation(_make_synthetic_race(0.05, -0.03, n_stints=6, stint_len=21), "MEDIUM")
    high = fit_degradation(_make_synthetic_race(0.05, -0.03, n_stints=12, stint_len=21), "MEDIUM")

    assert low is not None and low.n_laps == 42 and low.confidence == "low"
    assert medium is not None and medium.n_laps == 120 and medium.confidence == "medium"
    assert high is not None and high.n_laps == 240 and high.confidence == "high"
