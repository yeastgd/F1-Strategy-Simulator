using System.Text.Json;
using ValidationService;

var builder = WebApplication.CreateBuilder(args);

// The Python backend speaks snake_case (race_laps, start_compound, ...), so bind
// and emit JSON with the snake_case naming policy (.NET 8) rather than PascalCase.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
});

var app = builder.Build();

// Health probe (matches the Python backend's /health; used by the compose healthcheck).
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Validate a strategy against the F1 sporting rules; returns {valid, reason}.
app.MapPost("/validate", (ValidateRequest request) => Results.Ok(StrategyValidator.Validate(request)));

app.Run();

// Exposed so a WebApplicationFactory-based integration test could boot the app if needed.
public partial class Program { }
