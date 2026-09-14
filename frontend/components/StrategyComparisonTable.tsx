"use client";

import { memo } from "react";
import type { SimulateResponse } from "@/lib/api";
import { CompoundStints, ConfidenceBadge } from "@/components/ui";
import styles from "./table.module.css";

function StrategyComparisonTable({
  result,
  stintsByName = {},
  focusedName,
  onFocus,
}: {
  result: SimulateResponse;
  stintsByName?: Record<string, string[]>;
  focusedName?: string | null;
  onFocus?: (name: string) => void;
}) {
  const names = Object.keys(result.strategies);
  const fastest = Math.min(...names.map((n) => result.strategies[n].mean_time));

  const avgWin = (name: string): number => {
    const row = result.win_probability[name] ?? {};
    const opps = Object.values(row);
    if (opps.length === 0) return 0;
    return opps.reduce((a, b) => a + b, 0) / opps.length;
  };

  const ranked = [...names].sort(
    (a, b) => result.strategies[a].mean_time - result.strategies[b].mean_time
  );

  return (
    <div>
      <p className={styles.meta}>
        {result.meta.race_laps} laps · pit loss {result.meta.pit_loss.toFixed(1)}s · SC probability{" "}
        {(result.meta.sc_probability * 100).toFixed(1)}% · {result.meta.n_runs.toLocaleString()} runs
      </p>
      <div className={styles.scrollerWrap}>
        <div className={styles.scroller}>
          <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.pin}>Strategy</th>
            <th>Tyres</th>
            <th>Stops</th>
            <th>Mean (rel s)</th>
            <th>Δ to best</th>
            <th>Std</th>
            <th>Avg win %</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((name) => {
            const s = result.strategies[name];
            const delta = s.mean_time - fastest;
            const focused = name === focusedName;
            return (
              <tr
                key={name}
                className={focused ? styles.focused : undefined}
                onClick={() => onFocus?.(name)}
              >
                <td className={`${styles.name} ${styles.pin}`}>
                  {name}
                  {delta === 0 && <span className={styles.tag}>fastest</span>}
                </td>
                <td>
                  {stintsByName[name] ? <CompoundStints compounds={stintsByName[name]} /> : "—"}
                </td>
                <td className={styles.num}>{s.n_stops}</td>
                <td className={styles.num}>{s.mean_time.toFixed(1)}</td>
                <td className={styles.num}>{delta === 0 ? "—" : `+${delta.toFixed(1)}`}</td>
                <td className={styles.num}>{s.std.toFixed(2)}</td>
                <td className={styles.num}>{(avgWin(name) * 100).toFixed(1)}%</td>
                <td>
                  <ConfidenceBadge confidence={s.confidence} />
                </td>
              </tr>
            );
          })}
        </tbody>
          </table>
        </div>
      </div>
      <p className={styles.note}>
        &ldquo;Avg win %&rdquo; = share of paired simulated races this strategy finishes ahead of the
        others (common random numbers). Confidence reflects the lowest-confidence compound the
        strategy relies on. Click a row to focus it.
      </p>
    </div>
  );
}

export default memo(StrategyComparisonTable);
