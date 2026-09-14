"""Unit tests for the Monte Carlo simulation engine (PROJECT_SPEC.md section 6)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.models.degradation import CompoundModel, DegradationModel
from app.models.simulation import (
    PitStop,
    Strategy,
    compare_strategies,
    estimate_sc_probability,
    simulate_strategy,
)


def _model() -> DegradationModel:
    """A small hand-built degradation model with SOFT unavailable (None)."""
    return DegradationModel(
        race_id="TEST",
        compounds={
            "SOFT": None,  # unavailable on purpose
            "MEDIUM": CompoundModel("MEDIUM", base_pace=90.0, deg_rate=0.05, fuel_rate=-0.03, n_laps=300, confidence="high"),
            "HARD": CompoundModel("HARD", base_pace=90.5, deg_rate=0.03, fuel_rate=-0.03, n_laps=120, confidence="medium"),
        },
    )


def test_fixed_seed_is_deterministic():
    """Same seed -> identical samples (regression guard against nondeterminism)."""
    model = _model()
    strat = Strategy("1-stop", "MEDIUM", [PitStop(25, "HARD")])
    kwargs = {"race_laps": 50, "pit_loss": 22.0, "sc_probability": 0.1, "n_runs": 2000, "seed": 7}

    a = simulate_strategy(strat, model, **kwargs)
    b = simulate_strategy(strat, model, **kwargs)

    assert np.array_equal(a.samples, b.samples)
    assert a.mean_time == b.mean_time


def test_extra_unnecessary_stop_is_worse():
    """An extra pit stop, all else equal, must strictly worsen mean finishing time.

    Same opening, same compounds — the two-stop just adds one more stop (and its
    pit loss) that buys only a little fresher-tyre pace at this low deg rate.
    """
    model = _model()
    one_stop = Strategy("1-stop", "MEDIUM", [PitStop(25, "HARD")])
    two_stop = Strategy("2-stop", "MEDIUM", [PitStop(17, "HARD"), PitStop(34, "HARD")])

    kwargs = {"race_laps": 50, "pit_loss": 22.0, "sc_probability": 0.05, "n_runs": 5000, "seed": 99}
    r1 = simulate_strategy(one_stop, model, **kwargs)
    r2 = simulate_strategy(two_stop, model, **kwargs)

    assert r2.mean_time > r1.mean_time
    # And it should also lose the head-to-head most of the time.
    summary = compare_strategies({"one": r1, "two": r2})
    assert summary["win_probability"]["one"]["two"] > 0.5


def test_estimate_sc_probability_parses_concatenated_digits():
    """SC/VSC probability must parse per-digit, not by string equality.

    Statuses: '1' green, '12' green->yellow (no SC/VSC), '4' SC, '671' VSC+SC,
    '2' yellow. Only '4' and '671' count -> 2 of 5 laps flagged = 0.4.
    """
    df = pd.DataFrame(
        {
            "LapNumber": [1, 2, 3, 4, 5],
            "TrackStatus": ["1", "12", "4", "671", "2"],
        }
    )
    assert estimate_sc_probability(df) == pytest.approx(0.4)

    # A naive equality check against '4' would find only 1/5 = 0.2 and miss '671';
    # confirm our per-digit parse does NOT collapse to that wrong answer.
    assert estimate_sc_probability(df) != pytest.approx(0.2)

    # Integer dtype (as read back from CSV) must parse identically.
    df_int = pd.DataFrame({"LapNumber": [1, 2, 3], "TrackStatus": [1, 4, 671]})
    assert estimate_sc_probability(df_int) == pytest.approx(2 / 3)


def test_unavailable_compound_raises():
    """A strategy referencing a None compound must raise, not silently simulate."""
    model = _model()
    bad = Strategy("uses-soft", "SOFT", [PitStop(25, "MEDIUM")])

    with pytest.raises(ValueError, match="SOFT"):
        simulate_strategy(bad, model, race_laps=50, pit_loss=22.0, sc_probability=0.1, n_runs=100, seed=1)


def test_sc_reduces_pit_cost_relative_to_no_sc():
    """Sanity: with SC always out, pit cost is halved, so a stopping strategy is
    faster than the identical strategy with SC never out (isolates the SC->pit link)."""
    model = _model()
    strat = Strategy("2-stop", "MEDIUM", [PitStop(17, "HARD"), PitStop(34, "HARD")])
    common = {"race_laps": 50, "pit_loss": 22.0, "n_runs": 4000, "seed": 3}

    no_sc = simulate_strategy(strat, model, sc_probability=0.0, **common)
    all_sc = simulate_strategy(strat, model, sc_probability=1.0, **common)

    # Two stops * halved pit loss = ~22s saved.
    assert (no_sc.mean_time - all_sc.mean_time) == pytest.approx(2 * 22.0 * 0.5, abs=0.5)
