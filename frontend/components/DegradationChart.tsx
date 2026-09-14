"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compoundColor, type DegradationResponse, type LapPoint } from "@/lib/api";
import styles from "./charts.module.css";

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[base + 1];
  return next !== undefined ? sortedAsc[base] + rest * (next - sortedAsc[base]) : sortedAsc[base];
}

export default function DegradationChart({
  laps,
  degradation,
}: {
  laps: LapPoint[];
  degradation: DegradationResponse;
}) {
  if (laps.length === 0) return <p className={styles.caption}>No lap data for this race.</p>;

  const compounds = Array.from(new Set(laps.map((l) => l.compound.toUpperCase()))).sort();
  const lifeMax = Math.max(...laps.map((l) => l.tyre_life), 1);
  const sortedTimes = [...laps.map((l) => l.lap_time)].sort((a, b) => a - b);
  const yLo = Math.floor(quantile(sortedTimes, 0.02)) - 0.5;
  const yHi = Math.ceil(quantile(sortedTimes, 0.97)) + 0.5;

  const series = compounds.map((c) => {
    const model = degradation[c];
    return {
      compound: c,
      color: compoundColor(c),
      points: laps
        .filter((l) => l.compound.toUpperCase() === c)
        .map((l) => ({ x: l.tyre_life, y: l.lap_time })),
      fit: model
        ? [
            { x: 1, y: model.base_pace + model.deg_rate * 1 },
            { x: lifeMax, y: model.base_pace + model.deg_rate * lifeMax },
          ]
        : null,
      floored: model?.was_floored ?? false,
    };
  });
  const anyFloored = series.some((s) => s.floored);

  return (
    <div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart margin={{ top: 10, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid stroke="#2c333f" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, Math.ceil(lifeMax)]}
            tick={{ fill: "#9aa3b2", fontSize: 12 }}
            label={{ value: "Tyre age (laps)", position: "insideBottom", offset: -10, fill: "#9aa3b2", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[yLo, yHi]}
            allowDataOverflow
            tick={{ fill: "#9aa3b2", fontSize: 12 }}
            width={64}
            label={{ value: "Lap time (s)", angle: -90, position: "insideLeft", fill: "#9aa3b2", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1d24", border: "1px solid #2c333f", borderRadius: 8 }}
            formatter={(v: number) => [`${Number(v).toFixed(2)} s`, "lap time"]}
            labelFormatter={(l) => `Tyre age ${l}`}
          />
          {series.map((s) => (
            <Scatter key={`sc-${s.compound}`} data={s.points} fill={s.color} fillOpacity={0.2} isAnimationActive={false} />
          ))}
          {series.map((s) =>
            s.fit ? (
              <Line
                key={`ln-${s.compound}`}
                data={s.fit}
                dataKey="y"
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                type="linear"
                strokeDasharray={s.floored ? "7 4" : undefined}
                isAnimationActive={false}
              />
            ) : null
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.compound} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: s.color }} />
            {s.compound}
            {s.floored && <em className={styles.floored}>&nbsp;(deg floored → dashed)</em>}
          </span>
        ))}
      </div>
      {anyFloored && (
        <p className={styles.caption}>
          Faint dots are individual laps; the line is the fitted degradation. A{" "}
          <strong>dashed</strong> line means the fitted slope was negative and floored to 0 — flat
          here means &ldquo;no modelled wear&rdquo;, not real zero-deg tyres.
        </p>
      )}
    </div>
  );
}
