"""THROWAWAY stub standing in for the .NET validation-service during a local UI
demo (the .NET SDK isn't installed here). Implements the same POST /validate +
GET /health contract; only the single-compound rule is needed to trigger a
rejection. Delete after use."""

from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/validate")
def validate(req: dict):
    compounds = {req.get("start_compound", "").upper()} | {
        s["compound"].upper() for s in req.get("stops", [])
    }
    compounds.discard("")
    if len(compounds) < 2:
        return {
            "valid": False,
            "reason": (
                f"Strategy uses only {len(compounds)} compound "
                f"({', '.join(sorted(compounds))}); a dry race requires at least 2 different compounds."
            ),
        }
    return {"valid": True, "reason": None}
