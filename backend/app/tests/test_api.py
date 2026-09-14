"""API route tests (PROJECT_SPEC.md section 7) using FastAPI's TestClient."""

from __future__ import annotations

from fastapi.testclient import TestClient
import httpx

from app.main import app

client = TestClient(app)

EXPECTED_RACES = {"2023_Monza", "2023_Spain", "2023_Singapore"}

# The Monza 1-stop vs 2-stop strategies from the Phase 3 end-to-end run.
MONZA_STRATEGIES = [
    {"name": "1-stop early(26)", "start_compound": "MEDIUM", "stops": [{"lap": 26, "compound": "HARD"}]},
    {
        "name": "2-stop M-H-H",
        "start_compound": "MEDIUM",
        "stops": [{"lap": 18, "compound": "HARD"}, {"lap": 36, "compound": "HARD"}],
    },
]


def test_list_races_returns_three_known_races():
    resp = client.get("/races")
    assert resp.status_code == 200
    body = resp.json()
    assert {r["id"] for r in body} == EXPECTED_RACES
    monza = next(r for r in body if r["id"] == "2023_Monza")
    assert monza["year"] == 2023
    assert monza["gp"] == "Monza"
    assert monza["laps"] > 0


def test_degradation_shape_for_real_race():
    resp = client.get("/races/2023_Monza/degradation")
    assert resp.status_code == 200
    body = resp.json()
    # Monza ran HARD + MEDIUM (no SOFT stint at all).
    assert "HARD" in body and "MEDIUM" in body
    hard = body["HARD"]
    assert set(hard) == {"base_pace", "deg_rate", "fuel_rate", "n_laps", "confidence", "was_floored"}
    assert hard["confidence"] in {"low", "medium", "high"}
    assert isinstance(hard["was_floored"], bool)


def test_degradation_unknown_race_404():
    resp = client.get("/races/not_a_real_race/degradation")
    assert resp.status_code == 404


def test_laps_returns_race_laps_and_list():
    resp = client.get("/races/2023_Monza/laps")
    assert resp.status_code == 200
    body = resp.json()
    # race_laps must be present and match the value GET /races reports (max LapNumber).
    races = client.get("/races").json()
    monza_laps = next(r for r in races if r["id"] == "2023_Monza")["laps"]
    assert body["race_laps"] == monza_laps
    assert body["race_laps"] > 0
    assert len(body["laps"]) > 0
    assert set(body["laps"][0]) == {"compound", "tyre_life", "lap_time"}


def test_simulate_valid_body_returns_both_strategies():
    resp = client.post(
        "/simulate",
        json={"race_id": "2023_Monza", "strategies": MONZA_STRATEGIES, "n_runs": 2000},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["strategies"]) == {"1-stop early(26)", "2-stop M-H-H"}
    # Win probability matrix is present and directionally sane (1-stop beats 2-stop).
    assert body["win_probability"]["1-stop early(26)"]["2-stop M-H-H"] > 0.5
    for stats in body["strategies"].values():
        assert stats["mean_time"] > 0
        assert "p50" in stats["percentiles"]
        assert len(stats["sample"]) > 0


def test_simulate_unavailable_compound_returns_400():
    resp = client.post(
        "/simulate",
        json={
            "race_id": "2023_Monza",
            "strategies": [
                {"name": "soft-at-monza", "start_compound": "SOFT", "stops": [{"lap": 26, "compound": "HARD"}]}
            ],
            "n_runs": 100,
        },
    )
    assert resp.status_code == 400
    assert "SOFT" in resp.json()["detail"]


def test_simulate_rejected_by_validation_service(monkeypatch):
    """When the .NET validator rejects a strategy, /simulate returns 400 with the
    reason surfaced, and NO simulation runs."""
    from app.api import routes

    sim_calls = {"count": 0}

    def _counting_sim(*args, **kwargs):
        sim_calls["count"] += 1
        raise AssertionError("simulate_strategy must not run when validation fails")

    reason = "Strategy uses only 1 compound (MEDIUM); a dry race requires at least 2 different compounds."
    monkeypatch.setattr(routes, "_validation_enabled", lambda: True)
    monkeypatch.setattr(routes, "_validate_remote", lambda strat, race_laps: (False, reason))
    monkeypatch.setattr(routes, "simulate_strategy", _counting_sim)

    resp = client.post(
        "/simulate",
        json={
            "race_id": "2023_Monza",
            "n_runs": 5000,  # would be slow if it ran; the 400 must short-circuit it
            "strategies": [
                {"name": "one-compound", "start_compound": "MEDIUM", "stops": [{"lap": 26, "compound": "MEDIUM"}]}
            ],
        },
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "one-compound" in detail  # strategy name surfaced
    assert "2 different compounds" in detail  # .NET reason surfaced
    assert sim_calls["count"] == 0  # no simulation ran


def test_simulate_runs_when_validator_is_down(monkeypatch):
    """A 502/timeout from the optional .NET service must not block simulation."""
    from app.api import routes

    def fake_post(*args, **kwargs):
        request = httpx.Request("POST", "https://example.test/validate")
        return httpx.Response(502, request=request, text="Bad Gateway")

    monkeypatch.setattr(routes, "_validation_enabled", lambda: True)
    monkeypatch.setattr(routes.httpx, "post", fake_post)

    resp = client.post(
        "/simulate",
        json={"race_id": "2023_Monza", "strategies": MONZA_STRATEGIES, "n_runs": 400},
    )
    assert resp.status_code == 200
    assert set(resp.json()["strategies"]) == {"1-stop early(26)", "2-stop M-H-H"}


def test_simulate_duplicate_names_returns_400():
    resp = client.post(
        "/simulate",
        json={
            "race_id": "2023_Monza",
            "n_runs": 5000,  # large so a real run would be slow; the 400 must short-circuit
            "strategies": [
                {"name": "A", "start_compound": "MEDIUM", "stops": [{"lap": 26, "compound": "HARD"}]},
                {"name": "A", "start_compound": "HARD", "stops": [{"lap": 30, "compound": "MEDIUM"}]},
            ],
        },
    )
    assert resp.status_code == 400
    assert "A" in resp.json()["detail"]
