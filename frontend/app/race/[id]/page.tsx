"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getDegradation,
  getLaps,
  type DegradationResponse,
  type LapPoint,
  type SimulateResponse,
} from "@/lib/api";
import DegradationChart from "@/components/DegradationChart";
import StrategyBuilder from "@/components/StrategyBuilder";
import ResultsHistogram from "@/components/ResultsHistogram";
import StrategyComparisonTable from "@/components/StrategyComparisonTable";
import { ErrorBox, Loading } from "@/components/ui";
import styles from "./dashboard.module.css";

export default function RaceDashboard() {
  const params = useParams<{ id: string }>();
  const raceId = params.id;

  const [degradation, setDegradation] = useState<DegradationResponse | null>(null);
  const [laps, setLaps] = useState<LapPoint[] | null>(null);
  const [raceLaps, setRaceLaps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<SimulateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // /laps now carries race_laps directly, so no separate /races round-trip.
    Promise.all([getDegradation(raceId), getLaps(raceId)])
      .then(([deg, lapsResp]) => {
        if (cancelled) return;
        setDegradation(deg);
        setLaps(lapsResp.laps);
        setRaceLaps(lapsResp.race_laps);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [raceId]);

  const availableCompounds = useMemo(
    () =>
      degradation
        ? Object.entries(degradation)
            .filter(([, m]) => m !== null)
            .map(([c]) => c)
        : [],
    [degradation]
  );

  const loading = !error && (!degradation || !laps || raceLaps === null);

  return (
    <div className={styles.page}>
      <div className={styles.crumbs}>
        <Link href="/">← races</Link>
        <span className={styles.raceId}>{raceId.replace("_", " ")}</span>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && <Loading label="Loading degradation model and laps…" />}

      {!loading && !error && degradation && laps && (
        <>
          <section className="panel">
            <h2>Tyre degradation</h2>
            <p className="hint">Lap time vs tyre age per compound, with the fitted degradation line.</p>
            <DegradationChart laps={laps} degradation={degradation} />
          </section>

          <section className="panel">
            <h2>Build strategies</h2>
            <p className="hint">
              Define 2–3 strategies (a starting compound + pit stops), then simulate to compare them.
            </p>
            <StrategyBuilder
              raceId={raceId}
              raceLaps={raceLaps ?? 60}
              availableCompounds={availableCompounds}
              onResult={setSim}
            />
          </section>

          {sim && (
            <>
              <section className="panel">
                <h2>Finishing-time distributions</h2>
                <p className="hint">Overlapping outcomes across the simulated races.</p>
                <ResultsHistogram result={sim} />
              </section>

              <section className="panel">
                <h2>Strategy comparison</h2>
                <p className="hint">Mean, spread, and head-to-head win probability.</p>
                <StrategyComparisonTable result={sim} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
