"use client";

import { useState } from "react";
import { postSimulate, type SimulateResponse, type StrategyIn } from "@/lib/api";
import { ErrorBox } from "@/components/ui";
import styles from "./builder.module.css";

interface DraftStop {
  lap: number;
  compound: string;
}
interface DraftStrategy {
  name: string;
  start_compound: string;
  stops: DraftStop[];
}

const N_RUNS = 5000;
const MAX_STRATEGIES = 3;
const MAX_STOPS = 3;

function defaultStrategies(availableCompounds: string[], raceLaps: number): DraftStrategy[] {
  const c0 = availableCompounds[0] ?? "MEDIUM";
  const c1 = availableCompounds[1] ?? c0;
  return [
    { name: "1-stop", start_compound: c0, stops: [{ lap: Math.round(raceLaps / 2), compound: c1 }] },
    {
      name: "2-stop",
      start_compound: c0,
      stops: [
        { lap: Math.round(raceLaps / 3), compound: c1 },
        { lap: Math.round((2 * raceLaps) / 3), compound: c0 },
      ],
    },
  ];
}

export default function StrategyBuilder({
  raceId,
  raceLaps,
  availableCompounds,
  onResult,
}: {
  raceId: string;
  raceLaps: number;
  availableCompounds: string[];
  onResult: (r: SimulateResponse) => void;
}) {
  const [strategies, setStrategies] = useState<DraftStrategy[]>(() =>
    defaultStrategies(availableCompounds, raceLaps)
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = (fn: (draft: DraftStrategy[]) => void) => {
    setStrategies((prev) => {
      const next = prev.map((s) => ({ ...s, stops: s.stops.map((st) => ({ ...st })) }));
      fn(next);
      return next;
    });
  };

  const addStrategy = () =>
    mutate((d) => {
      if (d.length < MAX_STRATEGIES)
        d.push({
          name: `Strategy ${d.length + 1}`,
          start_compound: availableCompounds[0] ?? "MEDIUM",
          stops: [{ lap: Math.round(raceLaps / 2), compound: availableCompounds[1] ?? availableCompounds[0] }],
        });
    });

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const payload: StrategyIn[] = strategies.map((s) => ({
        name: s.name.trim() || "Unnamed",
        start_compound: s.start_compound,
        stops: [...s.stops].sort((a, b) => a.lap - b.lap),
      }));
      const names = payload.map((p) => p.name);
      if (new Set(names).size !== names.length) {
        throw new Error("Strategy names must be unique (they key the results).");
      }
      const res = await postSimulate({ race_id: raceId, strategies: payload, n_runs: N_RUNS });
      onResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className={styles.grid}>
        {strategies.map((s, si) => (
          <div key={si} className={styles.card}>
            <div className={styles.cardHead}>
              <input
                className={styles.nameInput}
                value={s.name}
                aria-label={`Strategy ${si + 1} name`}
                onChange={(e) => mutate((d) => void (d[si].name = e.target.value))}
              />
              {strategies.length > 2 && (
                <button
                  className={styles.iconBtn}
                  aria-label="Remove strategy"
                  onClick={() => mutate((d) => void d.splice(si, 1))}
                >
                  ✕
                </button>
              )}
            </div>

            <label className={styles.row}>
              <span className={styles.label}>Start on</span>
              <select
                value={s.start_compound}
                onChange={(e) => mutate((d) => void (d[si].start_compound = e.target.value))}
              >
                {availableCompounds.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.stops}>
              {s.stops.map((st, ti) => (
                <div key={ti} className={styles.stopRow}>
                  <span className={styles.stopIdx}>Pit {ti + 1}</span>
                  <input
                    type="number"
                    min={1}
                    max={raceLaps - 1}
                    value={st.lap}
                    aria-label={`Pit ${ti + 1} lap`}
                    onChange={(e) => mutate((d) => void (d[si].stops[ti].lap = Number(e.target.value)))}
                  />
                  <span className={styles.arrow}>→</span>
                  <select
                    value={st.compound}
                    onChange={(e) => mutate((d) => void (d[si].stops[ti].compound = e.target.value))}
                  >
                    {availableCompounds.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.iconBtn}
                    aria-label="Remove stop"
                    onClick={() => mutate((d) => void d[si].stops.splice(ti, 1))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {s.stops.length < MAX_STOPS && (
                <button
                  className={styles.addStop}
                  onClick={() =>
                    mutate(
                      (d) =>
                        void d[si].stops.push({
                          lap: Math.min(raceLaps - 1, (s.stops.at(-1)?.lap ?? 0) + 10),
                          compound: availableCompounds[0],
                        })
                    )
                  }
                >
                  + add stop
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        {strategies.length < MAX_STRATEGIES && (
          <button onClick={addStrategy}>+ add strategy</button>
        )}
        <button className="primary" onClick={run} disabled={running}>
          {running ? "Simulating…" : `Run simulation (${N_RUNS.toLocaleString()} runs)`}
        </button>
        <span className={styles.availNote}>
          Available compounds: {availableCompounds.join(", ")}
        </span>
      </div>
      {error && (
        <div className={styles.errorWrap}>
          <ErrorBox message={error} />
        </div>
      )}
    </div>
  );
}
