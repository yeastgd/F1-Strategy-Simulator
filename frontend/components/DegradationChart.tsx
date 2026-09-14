"use client";

import { memo, useMemo } from "react";
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
import type { DegradationResponse, LapPoint } from "@/lib/api";
import { tyreColor, tyreNeedsOutline } from "@/lib/tyreColors";
import { useChartReady, useNarrow } from "@/lib/useNarrow";
import styles from "./charts.module.css";

const SILVER = "#C9CDD3";
const WHITE = "#F5F6F7";
const BG = "#0A0A0A";

export interface PitMarker {
  lap: number;
  compound: string;
}

interface Series {
  compound: string;
  color: string;
  points: { x: number; y: number }[];
  fit: { x: number; y: number }[] | null;
  floored: boolean;
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[base + 1];
  return next !== undefined ? sortedAsc[base] + rest * (next - sortedAsc[base]) : sortedAsc[base];
}

const InnerChart = memo(function InnerChart({
  series,
  xMax,
  yLo,
  yHi,
  narrow,
  height,
}: {
  series: Series[];
  xMax: number;
  yLo: number;
  yHi: number;
  narrow: boolean;
  height: number;
}) {
  const tick = {
    fill: SILVER,
    fontSize: narrow ? 9 : 11,
    fontFamily: "var(--font-data), ui-monospace, monospace",
  };
  const yWidth = narrow ? 36 : 68;

  return (
    <ResponsiveContainer width="100%" height={height} debounce={50}>
      <ComposedChart
        margin={narrow ? { top: 8, right: 8, bottom: 22, left: 4 } : { top: 8, right: 16, bottom: 28, left: 4 }}
      >
        <CartesianGrid stroke={SILVER} strokeOpacity={0.12} vertical={false} />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, xMax]}
          tick={tick}
          interval={narrow ? "preserveStartEnd" : undefined}
          axisLine={{ stroke: SILVER, strokeOpacity: 0.35 }}
          tickLine={false}
          label={{
            value: narrow ? "Lap" : "Tyre age / race lap",
            position: "insideBottom",
            offset: -12,
            fill: SILVER,
            fontSize: narrow ? 10 : 12,
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[yLo, yHi]}
          allowDataOverflow
          tick={tick}
          width={yWidth}
          axisLine={{ stroke: SILVER, strokeOpacity: 0.35 }}
          tickLine={false}
          label={
            narrow
              ? undefined
              : {
                  value: "Lap time (s)",
                  angle: -90,
                  position: "insideLeft",
                  fill: SILVER,
                  fontSize: 12,
                }
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
          formatter={(v: number) => [`${Number(v).toFixed(2)} s`, "lap time"]}
          labelFormatter={(l) => `Lap ${l}`}
        />
        {series.map((s) => (
          <Scatter
            key={`sc-${s.compound}`}
            data={s.points}
            fill={s.color}
            fillOpacity={tyreNeedsOutline(s.compound) ? 0.35 : 0.22}
            stroke={tyreNeedsOutline(s.compound) ? "#1a1a1a" : undefined}
            isAnimationActive={false}
          />
        ))}
        {series.map((s) =>
          s.fit ? (
            <Line
              key={`ln-${s.compound}`}
              data={s.fit}
              dataKey="y"
              stroke={s.color}
              strokeWidth={s.floored ? 2 : 2.4}
              dot={false}
              type="linear"
              strokeDasharray={s.floored ? "6 4" : undefined}
              isAnimationActive={false}
            />
          ) : null
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

export default function DegradationChart({
  laps,
  degradation,
  raceLaps,
  markers = [],
}: {
  laps: LapPoint[];
  degradation: DegradationResponse;
  raceLaps: number;
  markers?: PitMarker[];
}) {
  const narrow = useNarrow();
  const ready = useChartReady();
  const height = narrow ? 280 : 380;
  const model = useMemo(() => {
    if (laps.length === 0) return null;
    const compounds = Array.from(new Set(laps.map((l) => l.compound.toUpperCase()))).sort();
    const lifeMax = Math.max(...laps.map((l) => l.tyre_life), 1);
    const sortedTimes = [...laps.map((l) => l.lap_time)].sort((a, b) => a - b);
    const yLo = Math.floor(quantile(sortedTimes, 0.02)) - 0.5;
    const yHi = Math.ceil(quantile(sortedTimes, 0.97)) + 0.5;
    const xMax = Math.max(Math.ceil(lifeMax), raceLaps, 1);

    const series: Series[] = compounds.map((c) => {
      const fitModel = degradation[c];
      const floored = fitModel?.was_floored ?? false;
      const color = tyreColor(c);
      return {
        compound: c,
        color,
        points: laps
          .filter((l) => l.compound.toUpperCase() === c)
          .map((l) => ({ x: l.tyre_life, y: l.lap_time })),
        fit: fitModel
          ? [
              { x: 1, y: fitModel.base_pace + fitModel.deg_rate * 1 },
              { x: lifeMax, y: fitModel.base_pace + fitModel.deg_rate * lifeMax },
            ]
          : null,
        floored,
      };
    });

    return { series, xMax, yLo, yHi };
  }, [laps, degradation, raceLaps]);

  if (!model) return <p className={styles.caption}>No lap data for this race.</p>;

  const { series, xMax, yLo, yHi } = model;

  return (
    <div>
      <div className={styles.chartFrame} style={{ height }}>
        {ready && (
          <InnerChart
            key={narrow ? "narrow" : "wide"}
            series={series}
            xMax={xMax}
            yLo={yLo}
            yHi={yHi}
            narrow={narrow}
            height={height}
          />
        )}
        <div className={styles.markerLayer} aria-hidden>
          {markers.map((m, i) => (
            <div
              key={`${i}-${m.compound}`}
              className={styles.marker}
              style={{
                left: `${(m.lap / xMax) * 100}%`,
                borderColor: tyreColor(m.compound),
                color: tyreColor(m.compound),
              }}
            >
              <span className={styles.markerLabel}>{m.lap}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.compound} className={styles.legendItem}>
            <span
              className={s.floored ? styles.swatchDash : styles.swatch}
              style={
                s.floored
                  ? { borderColor: s.color }
                  : {
                      background: s.color,
                      boxShadow: tyreNeedsOutline(s.compound) ? "0 0 0 1px #3a3a3a" : undefined,
                    }
              }
            />
            {s.compound}
            {s.floored && <span className={styles.floored}>floored</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
