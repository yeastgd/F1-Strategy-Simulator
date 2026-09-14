"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRaces, type RaceSummary } from "@/lib/api";
import { ErrorBox, Loading } from "@/components/ui";
import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const [races, setRaces] = useState<RaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    getRaces()
      .then((data) => {
        setRaces(data);
        if (data.length) setSelected(data[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className={styles.wrap}>
      <div className="panel">
        <h2>Pick a race</h2>
        <p className="hint">
          Choose one of the processed 2023 races to open its degradation model and strategy
          simulator.
        </p>

        {error && <ErrorBox message={error} />}
        {!error && !races && <Loading label="Loading races…" />}

        {races && (
          <>
            <div className={styles.controls}>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                aria-label="Select a race"
              >
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.year} {r.gp} — {r.laps} laps
                  </option>
                ))}
              </select>
              <button
                className="primary"
                disabled={!selected}
                onClick={() => router.push(`/race/${selected}`)}
              >
                Open dashboard →
              </button>
            </div>

            <div className={styles.cards}>
              {races.map((r) => (
                <button
                  key={r.id}
                  className={styles.card}
                  onClick={() => router.push(`/race/${r.id}`)}
                >
                  <span className={styles.cardGp}>{r.gp}</span>
                  <span className={styles.cardMeta}>
                    {r.year} · {r.laps} laps
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
