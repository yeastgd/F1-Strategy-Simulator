"use client";

import { memo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulateResponse } from "@/lib/api";
import { CompoundStints } from "@/components/ui";
import { useChartReady, useNarrow } from "@/lib/useNarrow";
import styles from "./charts.module.css";

const TEAL = "#00A19C";
const SILVER = "#C9CDD3";
const WHITE = "#F5F6F7";
const BG = "#0A0A0A";
const BINS = 28;

function ResultsHistogram({
  result,
  stintsByName = {},
  focusedName,
}: {
  result: SimulateResponse;
  stintsByName?: Record<string, string[]>;
  focusedName?: string | null;
}) {
  const narrow = useNarrow();
  const ready = useChartReady();
  const height = narrow ? 240 : 300;
  const names = Object.keys(result.strategies);
  const all = names.flatMap((n) => result.strategies[n].sample);
  if (all.length === 0) return null;

  const fastest = names.reduce((best, n) =>
    result.strategies[n].mean_time < result.strategies[best].mean_time ? n : best
  );
  const highlighted = focusedName && names.includes(focusedName) ? focusedName : fastest;

  const min = Math.min(...all);
  const max = Math.max(...all);
  const width = (max - min) / BINS || 1;

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

  const tick = {
    fill: SILVER,
    fontSize: narrow ? 9 : 11,
    fontFamily: "var(--font-data), ui-monospace, monospace",
  };

  const legend = (
    <div className={styles.legend}>
      {names.map((name) => {
        const isFocus = name === highlighted;
        const stints = stintsByName[name];
        return (
          <span key={name} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: isFocus ? TEAL : SILVER }} />
            {name}
            {stints && (
              <span className={styles.stint}>
                <CompoundStints compounds={stints} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className={styles.plot} style={{ height }}>
        {ready && (
        <ResponsiveContainer key={narrow ? "narrow" : "wide"} width="100%" height={height} debounce={50}>
          <ComposedChart
            data={rows}
            margin={
              narrow ? { top: 8, right: 8, bottom: 22, left: 4 } : { top: 8, right: 16, bottom: 28, left: 4 }
            }
          >
            <CartesianGrid stroke={SILVER} strokeOpacity={0.12} vertical={false} />
            <XAxis
              dataKey="time"
              tick={tick}
              tickCount={narrow ? 4 : undefined}
              interval={narrow ? "preserveStartEnd" : undefined}
              axisLine={{ stroke: SILVER, strokeOpacity: 0.35 }}
              tickLine={false}
              label={{
                value: narrow ? "Relative time (s)" : "Simulated race time (relative, s)",
                position: "insideBottom",
                offset: -12,
                fill: SILVER,
                fontSize: narrow ? 10 : 12,
              }}
            />
            <YAxis
              tick={tick}
              width={narrow ? 36 : 48}
              axisLine={{ stroke: SILVER, strokeOpacity: 0.35 }}
              tickLine={false}
              label={
                narrow
                  ? undefined
                  : { value: "runs", angle: -90, position: "insideLeft", fill: SILVER, fontSize: 12 }
              }
            />
            <Tooltip
              contentStyle={{
                background: BG,
                border: `1px solid ${SILVER}`,
                borderRadius: 0,
                color: WHITE,
                fontFamily: "var(--font-data), ui-monospace, monospace",
                fontSize: 12,
              }}
              labelFormatter={(l) => `~${l} s`}
            />
            {names.map((n) => {
              const isFocus = n === highlighted;
              const color = isFocus ? TEAL : SILVER;
              return (
                <Area
                  key={n}
                  type="monotone"
                  dataKey={n}
                  stroke={color}
                  fill={color}
                  fillOpacity={isFocus ? 0.28 : 0.08}
                  strokeWidth={isFocus ? 2.2 : 1.4}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>
      {legend}
      <p className={styles.caption}>
        Distributions of {result.meta.n_runs.toLocaleString()} simulated races. The x-axis is a{" "}
        <strong>relative</strong> simulated time (fuel burn is omitted, so it&rsquo;s inflated vs a
        real race) — read it as a comparison <em>between</em> strategies, not a predicted finish
        time.
      </p>
    </div>
  );
}

export default memo(ResultsHistogram);
