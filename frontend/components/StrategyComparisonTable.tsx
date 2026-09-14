"use client";

import type { SimulateResponse } from "@/lib/api";
import { ConfidenceBadge } from "@/components/ui";
import styles from "./table.module.css";

export default function StrategyComparisonTable({ result }: { result: SimulateResponse }) {
  const names = Object.keys(result.strategies);
  const fastest = Math.min(...names.map((n) => result.strategies[n].mean_time));

  // Average win probability against all other strategies.
  const avgWin = (name: string): number => {
    const row = result.win_probability[name] ?? {};
    const opps = Object.values(row);
    if (opps.length === 0) return 0;
    return opps.reduce((a, b) => a + b, 0) / opps.length;
  };

  const ranked = [...names].sort((a, b) => result.strategies[a].mean_time - result.strategies[b].mean_time);

  return (
    <div>
      <p className={styles.meta}>
        {result.meta.race_laps} laps · pit loss {result.meta.pit_loss.toFixed(1)}s · SC probability{" "}
        {(result.meta.sc_probability * 100).toFixed(1)}% · {result.meta.n_runs.toLocaleString()} runs
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Strategy</th>
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
            return (
              <tr key={name} className={delta === 0 ? styles.best : undefined}>
                <td className={styles.name}>
                  {name}
                  {delta === 0 && <span className={styles.tag}>fastest</span>}
                </td>
                <td>{s.n_stops}</td>
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
      <p className={styles.note}>
        &ldquo;Avg win %&rdquo; = share of paired simulated races this strategy finishes ahead of the
        others (common random numbers). Confidence reflects the lowest-confidence compound the
        strategy relies on.
      </p>
    </div>
  );
}
