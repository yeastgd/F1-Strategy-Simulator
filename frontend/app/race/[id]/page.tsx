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
  type StrategyIn,
} from "@/lib/api";
import DegradationChart from "@/components/DegradationChart";
import StrategyBuilder, {
  defaultStrategies,
  type DraftStrategy,
} from "@/components/StrategyBuilder";
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
  const [submitted, setSubmitted] = useState<StrategyIn[] | null>(null);
  const [drafts, setDrafts] = useState<DraftStrategy[] | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [focusedResult, setFocusedResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSim(null);
    setSubmitted(null);
    setDrafts(null);
    setFocusIdx(0);
    setFocusedResult(null);
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

  useEffect(() => {
    if (drafts === null && availableCompounds.length > 0 && raceLaps != null) {
      setDrafts(defaultStrategies(availableCompounds, raceLaps));
    }
  }, [drafts, availableCompounds, raceLaps]);

  const loading = !error && (!degradation || !laps || raceLaps === null || !drafts);
  const raceName = raceId.replace("_", " ");
  const markers = drafts?.[focusIdx]?.stops ?? [];

  const stintsByName = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of submitted ?? []) {
      map[s.name] = [s.start_compound, ...s.stops.map((st) => st.compound)];
    }
    return map;
  }, [submitted]);

  return (
    <div className={styles.page}>
      <div className={styles.masthead}>
        <Link href="/" className={styles.back}>
          ← races
        </Link>
        <h1 className={styles.raceName}>{raceName}</h1>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && <Loading label="Loading degradation model and laps…" />}

      {!loading && !error && degradation && laps && drafts && raceLaps != null && (
        <>
          <section className="section">
            <h2>Tyre degradation</h2>
            <p className="hint">
              Lap time vs tyre age per compound. Vertical markers are pit laps on the focused
              strategy — they move as you drag the sliders.
            </p>
            <DegradationChart
              laps={laps}
              degradation={degradation}
              raceLaps={raceLaps}
              markers={markers}
            />
          </section>

          <section className="section">
            <h2>Build strategies</h2>
            <p className="hint">
              Define 2–3 strategies (a starting compound + pit stops), then simulate to compare them.
            </p>
            <StrategyBuilder
              raceId={raceId}
              raceLaps={raceLaps}
              availableCompounds={availableCompounds}
              strategies={drafts}
              onChange={setDrafts}
              focusIndex={focusIdx}
              onFocus={setFocusIdx}
              onResult={(r, payload) => {
                setSim(r);
                setSubmitted(payload);
                const names = Object.keys(r.strategies);
                const fastest = names.reduce((best, n) =>
                  r.strategies[n].mean_time < r.strategies[best].mean_time ? n : best
                );
                setFocusedResult(fastest);
              }}
            />
          </section>

          {sim && (
            <>
              <section className="section">
                <h2>Finishing-time distributions</h2>
                <p className="hint">Overlapping outcomes across the simulated races.</p>
                <ResultsHistogram
                  result={sim}
                  stintsByName={stintsByName}
                  focusedName={focusedResult}
                />
              </section>

              <section className="section">
                <h2>Strategy comparison</h2>
                <p className="hint">Mean, spread, and head-to-head win probability.</p>
                <StrategyComparisonTable
                  result={sim}
                  stintsByName={stintsByName}
                  focusedName={focusedResult}
                  onFocus={setFocusedResult}
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
