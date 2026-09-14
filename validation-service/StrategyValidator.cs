namespace ValidationService;

/// <summary>One pit stop: the lap the car pits on and the compound it switches to.</summary>
public record StopDto(int Lap, string Compound);

/// <summary>
/// A strategy to validate. Mirrors the Python <c>Strategy</c> shape (section 6/7),
/// including <see cref="StartCompound"/> — the compound the car starts the race on.
/// </summary>
public record ValidateRequest(int RaceLaps, string StartCompound, List<StopDto> Stops);

/// <summary>Validation outcome: valid, plus the first rule violated (or null).</summary>
public record ValidateResponse(bool Valid, string? Reason);

/// <summary>
/// Validates a pit strategy against basic F1 sporting rules (PROJECT_SPEC.md section 9).
/// Rules are checked in a fixed order and the FIRST violation is returned.
/// </summary>
public static class StrategyValidator
{
    /// <summary>Minimum number of laps required between consecutive stops (and before the first).</summary>
    public const int MinStopGap = 5;

    public static ValidateResponse Validate(ValidateRequest request)
    {
        var stops = request.Stops ?? new List<StopDto>();

        // Rule 1: at least 2 distinct compounds used (dry-race F1 rule).
        var compounds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(request.StartCompound))
        {
            compounds.Add(request.StartCompound);
        }
        foreach (var stop in stops)
        {
            if (!string.IsNullOrWhiteSpace(stop.Compound))
            {
                compounds.Add(stop.Compound);
            }
        }
        if (compounds.Count < 2)
        {
            return new ValidateResponse(false,
                $"Strategy uses only {compounds.Count} compound ({string.Join(", ", compounds)}); " +
                "a dry race requires at least 2 different compounds.");
        }

        // Rule 2: stop laps strictly increasing.
        for (var i = 1; i < stops.Count; i++)
        {
            if (stops[i].Lap <= stops[i - 1].Lap)
            {
                return new ValidateResponse(false,
                    $"Pit stop laps must strictly increase: stop {i + 1} at lap {stops[i].Lap} " +
                    $"is not after stop {i} at lap {stops[i - 1].Lap}.");
            }
        }

        // Rule 3: every stop lap within [1, race_laps].
        foreach (var stop in stops)
        {
            if (stop.Lap < 1 || stop.Lap > request.RaceLaps)
            {
                return new ValidateResponse(false,
                    $"Pit stop lap {stop.Lap} is outside the race distance [1, {request.RaceLaps}].");
            }
        }

        // Rule 4: minimum 5-lap gap between consecutive stops, and between the race
        // start (lap 0) and the first stop.
        var previousLap = 0;
        foreach (var stop in stops)
        {
            var gap = stop.Lap - previousLap;
            if (gap < MinStopGap)
            {
                return new ValidateResponse(false, previousLap == 0
                    ? $"First pit stop at lap {stop.Lap} is too early: at least {MinStopGap} laps are " +
                      "required before the first stop."
                    : $"Pit stops at laps {previousLap} and {stop.Lap} are only {gap} lap(s) apart; " +
                      $"a minimum of {MinStopGap} laps is required.");
            }
            previousLap = stop.Lap;
        }

        return new ValidateResponse(true, null);
    }
}
