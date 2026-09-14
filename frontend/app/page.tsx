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

  useEffect(() => {
    getRaces()
      .then(setRaces)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className={styles.page}>
      <svg className={styles.track} viewBox="0 0 800 400" aria-hidden="true">
        <path
          d="M80 220 C80 140 140 80 280 90 C420 100 460 70 540 90 C680 120 720 180 700 240 C680 300 560 330 420 320 C280 310 200 340 140 300 C90 268 80 250 80 220 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
        />
      </svg>

      <h1 className={styles.heading}>Select race</h1>

      {error && <ErrorBox message={error} />}
      {!error && !races && <Loading label="Loading races…" />}

      {races && (
        <ul className={styles.list}>
          {races.map((r) => (
            <li key={r.id}>
              <button className={styles.race} onClick={() => router.push(`/race/${r.id}`)}>
                <span className={styles.gp}>{r.gp}</span>
                <span className={styles.rule} />
                <span className={styles.meta}>
                  <span className={styles.year}>{r.year}</span>
                  <span className={styles.laps}>{r.laps} laps</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
