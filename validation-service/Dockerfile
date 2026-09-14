# .NET validation microservice image (PROJECT_SPEC.md section 10).

# ---- build stage ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first (cached across code-only changes).
COPY ValidationService.csproj ./
RUN dotnet restore ValidationService.csproj

# Build + publish just the web project (tests are excluded via .dockerignore).
COPY . ./
RUN dotnet publish ValidationService.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---- runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl is used by the compose healthcheck (the aspnet image ships without it).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "ValidationService.dll"]
