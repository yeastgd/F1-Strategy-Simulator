// Typed client for the FastAPI backend (PROJECT_SPEC.md section 7).
// Base URL is env-driven so it can be repointed at deploy time (Phase 5).

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export type Confidence = "low" | "medium" | "high";

export interface RaceSummary {
  id: string;
  year: number;
  gp: string;
  laps: number;
}

export interface CompoundModel {
  base_pace: number;
  deg_rate: number;
  fuel_rate: number;
  n_laps: number;
  confidence: Confidence;
  was_floored: boolean;
}

// Unavailable compounds come back as null (spec section 7).
export type DegradationResponse = Record<string, CompoundModel | null>;

export interface LapPoint {
  compound: string;
  tyre_life: number;
  lap_time: number;
}

export interface RaceLapsResponse {
  race_laps: number;
  laps: LapPoint[];
}

export interface PitStopIn {
  lap: number;
  compound: string;
}

export interface StrategyIn {
  name: string;
  start_compound: string;
  stops: PitStopIn[];
}

export interface SimulateRequest {
  race_id: string;
  strategies: StrategyIn[];
  n_runs?: number;
  seed?: number;
}

export interface StrategyResult {
  mean_time: number;
  std: number;
  percentiles: Record<string, number>;
  confidence: Confidence;
  n_stops: number;
  sample: number[];
}

export interface SimulateMeta {
  race_id: string;
  race_laps: number;
  pit_loss: number;
  sc_probability: number;
  n_runs: number;
  seed: number;
}

export interface SimulateResponse {
  meta: SimulateMeta;
  strategies: Record<string, StrategyResult>;
  win_probability: Record<string, Record<string, number>>;
}

/** Fetch JSON, surfacing FastAPI's `detail` message on non-2xx responses. */
async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Is the API running (uvicorn on :8000)?`
    );
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body; keep the status message */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getRaces = () => getJSON<RaceSummary[]>("/races");

export const getDegradation = (raceId: string) =>
  getJSON<DegradationResponse>(`/races/${raceId}/degradation`);

export const getLaps = (raceId: string) =>
  getJSON<RaceLapsResponse>(`/races/${raceId}/laps`);

export const postSimulate = (body: SimulateRequest) =>
  getJSON<SimulateResponse>("/simulate", { method: "POST", body: JSON.stringify(body) });
