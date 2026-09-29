"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRaces, type RaceSummary } from "@/lib/api";
import TrackOutline from "@/components/TrackOutline";
import { ErrorBox, Loading } from "@/components/ui";
import styles from "./page.module.css";

export default function HomePage() {
  const router = useRouter();
  const [races, setRaces] = useState<RaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRaces()
      .then(setRaces)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Select race</h1>

      {error && <ErrorBox message={error} />}
      {!error && !races && <Loading label="Loading races…" />}

      {races && (
        <ul className={styles.list}>
          {races.map((r) => (
            <li key={r.id}>
              <button className={styles.race} onClick={() => router.push(`/race/${r.id}`)}>
                <span className={styles.copy}>
                  <span className={styles.gp}>{r.gp}</span>
                  <span className={styles.rule} />
                  <span className={styles.meta}>
                    <span className={styles.year}>{r.year}</span>
                    <span className={styles.laps}>{r.laps} laps</span>
                  </span>
                </span>
                <TrackOutline raceId={r.id} className={styles.track} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
