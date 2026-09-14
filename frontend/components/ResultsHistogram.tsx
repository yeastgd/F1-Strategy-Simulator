"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulateResponse } from "@/lib/api";
import styles from "./charts.module.css";

const PALETTE = ["#e10600", "#00a3e0", "#e8b800", "#43b02a", "#b061ff"];
const BINS = 28;

export default function ResultsHistogram({ result }: { result: SimulateResponse }) {
  const names = Object.keys(result.strategies);
  const all = names.flatMap((n) => result.strategies[n].sample);
  if (all.length === 0) return null;

  const min = Math.min(...all);
  const max = Math.max(...all);
  const width = (max - min) / BINS || 1;

  // One row per bin; a column of counts per strategy.
  const rows = Array.from({ length: BINS }, (_, i) => {
    const center = min + width * (i + 0.5);
    const row: Record<string, number> = { time: Number(center.toFixed(1)) };
    for (const n of names) row[n] = 0;
    return row;
  });
  for (const n of names) {
    for (const v of result.strategies[n].sample) {
      const idx = Math.min(BINS - 1, Math.floor((v - min) / width));
      rows[idx][n] += 1;
    }
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="#2c333f" strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#9aa3b2", fontSize: 12 }}
            label={{
              value: "Simulated race time (relative, s)",
              position: "insideBottom",
              offset: -10,
              fill: "#9aa3b2",
              fontSize: 12,
            }}
          />
          <YAxis
            tick={{ fill: "#9aa3b2", fontSize: 12 }}
            width={48}
            label={{ value: "runs", angle: -90, position: "insideLeft", fill: "#9aa3b2", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1d24", border: "1px solid #2c333f", borderRadius: 8 }}
            labelFormatter={(l) => `~${l} s`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {names.map((n, i) => (
            <Area
              key={n}
              type="monotone"
              dataKey={n}
              stroke={PALETTE[i % PALETTE.length]}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.35}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <p className={styles.caption}>
        Distributions of {result.meta.n_runs.toLocaleString()} simulated races. The x-axis is a{" "}
        <strong>relative</strong> simulated time (fuel burn is omitted, so it&rsquo;s inflated vs a
        real race) — read it as a comparison <em>between</em> strategies, not a predicted finish
        time.
      </p>
    </div>
  );
}
