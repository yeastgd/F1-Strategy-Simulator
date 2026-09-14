"""FastAPI application entry point.

Exposes a health-check plus the domain routes from section 7 of PROJECT_SPEC.md
(/races, /races/{id}/degradation, /races/{id}/laps, /simulate), wired in from
app.api.routes.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router

app = FastAPI(title="F1 Pit Strategy Monte Carlo Simulator", version="0.1.0")

# CORS: the Next.js frontend calls this API from a different origin. Origins are
# configurable via CORS_ORIGINS (comma-separated); the default is the compose-local
# frontend origin. Set CORS_ORIGINS="*" for a fully open public demo, or to the
# real frontend URL when deployed (Phase 5+).
_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Liveness probe. Returns a static payload when the server is up."""
    return {"status": "ok"}
