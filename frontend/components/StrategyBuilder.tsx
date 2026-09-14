"use client";

import { useState } from "react";
import { postSimulate, type SimulateResponse, type StrategyIn } from "@/lib/api";
import { CompoundSelect, CompoundSwatch, ErrorBox } from "@/components/ui";
import styles from "./builder.module.css";

export interface DraftStop {
  lap: number;
  compound: string;
}
export interface DraftStrategy {
  name: string;
  start_compound: string;
  stops: DraftStop[];
}

const N_RUNS = 5000;
const MAX_STRATEGIES = 3;
const MAX_STOPS = 3;

function clampLap(lap: number, raceLaps: number): number {
  const maxLap = Math.max(1, raceLaps - 1);
  const n = Number.isFinite(lap) ? Math.round(lap) : 1;
  return Math.min(maxLap, Math.max(1, n));
}

export function defaultStrategies(availableCompounds: string[], raceLaps: number): DraftStrategy[] {
  const c0 = availableCompounds[0] ?? "MEDIUM";
  const c1 = availableCompounds[1] ?? c0;
  return [
    { name: "1-stop", start_compound: c0, stops: [{ lap: clampLap(raceLaps / 2, raceLaps), compound: c1 }] },
    {
      name: "2-stop",
      start_compound: c0,
      stops: [
        { lap: clampLap(raceLaps / 3, raceLaps), compound: c1 },
        { lap: clampLap((2 * raceLaps) / 3, raceLaps), compound: c0 },
      ],
    },
  ];
}

export default function StrategyBuilder({
  raceId,
  raceLaps,
  availableCompounds,
  strategies,
  onChange,
  focusIndex,
  onFocus,
  onResult,
}: {
  raceId: string;
  raceLaps: number;
  availableCompounds: string[];
  strategies: DraftStrategy[];
  onChange: (next: DraftStrategy[]) => void;
  focusIndex: number;
  onFocus: (index: number) => void;
  onResult: (r: SimulateResponse, submitted: StrategyIn[]) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxLap = Math.max(1, raceLaps - 1);

  const mutate = (fn: (draft: DraftStrategy[]) => void) => {
    const next = strategies.map((s) => ({ ...s, stops: s.stops.map((st) => ({ ...st })) }));
    fn(next);
    onChange(next);
  };

  const addStrategy = () =>
    mutate((d) => {
      if (d.length < MAX_STRATEGIES)
        d.push({
          name: `Strategy ${d.length + 1}`,
          start_compound: availableCompounds[0] ?? "MEDIUM",
          stops: [
            {
              lap: clampLap(raceLaps / 2, raceLaps),
              compound: availableCompounds[1] ?? availableCompounds[0],
            },
          ],
        });
    });

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const payload: StrategyIn[] = strategies.map((s) => ({
        name: s.name.trim() || "Unnamed",
        start_compound: s.start_compound,
        stops: [...s.stops]
          .map((st) => ({ ...st, lap: clampLap(st.lap, raceLaps) }))
          .sort((a, b) => a.lap - b.lap),
      }));
      const names = payload.map((p) => p.name);
      if (new Set(names).size !== names.length) {
        throw new Error("Strategy names must be unique (they key the results).");
      }
      const res = await postSimulate({ race_id: raceId, strategies: payload, n_runs: N_RUNS });
      onResult(res, payload);
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
          <div
            key={si}
            className={`${styles.card} ${si === focusIndex ? styles.cardFocused : ""}`}
            onPointerDown={() => onFocus(si)}
          >
            <div className={styles.cardHead}>
              <input
                className={styles.nameInput}
                value={s.name}
                aria-label={`Strategy ${si + 1} name`}
                onChange={(e) => mutate((d) => void (d[si].name = e.target.value))}
                onFocus={() => onFocus(si)}
              />
              {strategies.length > 2 && (
                <button
                  className={styles.iconBtn}
                  aria-label="Remove strategy"
                  onClick={() =>
                    mutate((d) => {
                      d.splice(si, 1);
                      onFocus(Math.min(si, d.length - 1));
                    })
                  }
                >
                  ✕
                </button>
              )}
            </div>

            <div className={styles.row}>
              <span className={styles.label}>Start on</span>
              <CompoundSelect
                value={s.start_compound}
                options={availableCompounds}
                label={`Strategy ${si + 1} start compound`}
                onChange={(c) => mutate((d) => void (d[si].start_compound = c))}
              />
            </div>

            <div className={styles.stops}>
              {s.stops.map((st, ti) => (
                <div key={ti} className={styles.stopBlock}>
                  <div className={styles.stopHead}>
                    <span className={styles.stopIdx}>Pit {ti + 1}</span>
                    <button
                      className={styles.iconBtn}
                      aria-label="Remove stop"
                      onClick={() => mutate((d) => void d[si].stops.splice(ti, 1))}
                    >
                      ✕
                    </button>
                  </div>
                  <div className={styles.sliderRow}>
                    <input
                      type="range"
                      className={styles.slider}
                      min={1}
                      max={maxLap}
                      step={1}
                      value={clampLap(st.lap, raceLaps)}
                      aria-label={`Pit ${ti + 1} lap`}
                      aria-valuemin={1}
                      aria-valuemax={maxLap}
                      aria-valuenow={clampLap(st.lap, raceLaps)}
                      aria-valuetext={`Lap ${clampLap(st.lap, raceLaps)}`}
                      onChange={(e) =>
                        mutate((d) => void (d[si].stops[ti].lap = Number(e.target.value)))
                      }
                    />
                    <span className={styles.lapReadout} aria-hidden>
                      {clampLap(st.lap, raceLaps)}
                    </span>
                  </div>
                  <div className={styles.stopCompound}>
                    <span className={styles.arrow}>→</span>
                    <CompoundSelect
                      value={st.compound}
                      options={availableCompounds}
                      label={`Pit ${ti + 1} compound`}
                      onChange={(c) => mutate((d) => void (d[si].stops[ti].compound = c))}
                    />
                  </div>
                </div>
              ))}
              {s.stops.length < MAX_STOPS && (
                <button
                  className={styles.addStop}
                  onClick={() =>
                    mutate((d) =>
                      void d[si].stops.push({
                        lap: clampLap((s.stops.at(-1)?.lap ?? 0) + 10, raceLaps),
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
          Available compounds:{" "}
          {availableCompounds.map((c) => (
            <span key={c} className={styles.availItem}>
              <CompoundSwatch compound={c} />
              {c}
            </span>
          ))}
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
