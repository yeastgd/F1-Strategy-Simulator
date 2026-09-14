using ValidationService;
using Xunit;

namespace ValidationService.Tests;

public class StrategyValidatorTests
{
    private static ValidateRequest Req(int raceLaps, string start, params (int lap, string compound)[] stops)
        => new(raceLaps, start, stops.Select(s => new StopDto(s.lap, s.compound)).ToList());

    [Fact]
    public void ValidTwoStopStrategy_Passes()
    {
        var result = StrategyValidator.Validate(Req(51, "MEDIUM", (17, "HARD"), (34, "MEDIUM")));

        Assert.True(result.Valid);
        Assert.Null(result.Reason);
    }

    [Fact]
    public void SingleCompound_FailsFirstRuleSpecifically()
    {
        // Laps here are otherwise perfectly legal, so the ONLY violation is the
        // 2-compound rule — it must be the rule that fires, not a later one.
        var result = StrategyValidator.Validate(Req(51, "MEDIUM", (26, "MEDIUM")));

        Assert.False(result.Valid);
        Assert.Contains("at least 2 different compounds", result.Reason);
    }

    [Fact]
    public void NonIncreasingLaps_Fails()
    {
        var result = StrategyValidator.Validate(Req(51, "MEDIUM", (30, "HARD"), (20, "SOFT")));

        Assert.False(result.Valid);
        Assert.Contains("strictly increase", result.Reason);
    }

    [Fact]
    public void StopOutsideRaceDistance_Fails()
    {
        var result = StrategyValidator.Validate(Req(51, "MEDIUM", (60, "HARD")));

        Assert.False(result.Valid);
        Assert.Contains("outside the race distance", result.Reason);
    }

    [Fact]
    public void ConsecutiveStopsTooClose_Fails()
    {
        var result = StrategyValidator.Validate(Req(51, "MEDIUM", (20, "HARD"), (23, "SOFT")));

        Assert.False(result.Valid);
        Assert.Contains("minimum of 5 laps", result.Reason);
    }

    [Fact]
    public void FirstStopTooEarly_Fails()
    {
        var result = StrategyValidator.Validate(Req(51, "MEDIUM", (3, "HARD")));

        Assert.False(result.Valid);
        Assert.Contains("before the first stop", result.Reason);
    }
}
