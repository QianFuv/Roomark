/**
 * Statistics charts built on TanStack Charts (SVG). Colors come from the design tokens, so the
 * charts follow light and dark mode.
 *
 * @module
 */
import { barX, barY, colorLegend, defineChart, lineY, stack } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import * as stylex from "@stylexjs/stylex";

import { formatPercent, type TrendRow } from "../../lib/stats";
import { colors, fonts } from "../../styles/tokens.stylex";

const styles = stylex.create({
  frame: { color: colors.textMuted, fontFamily: fonts.sans, fontSize: fonts.sizeXs, minWidth: 0 },
});

/**
 * Utilization trend, current period solid and previous period dashed.
 *
 * @param props - Chart props.
 * @param props.rows - Rows for both series.
 * @returns The chart.
 */
export function TrendChart({ rows }: { rows: readonly TrendRow[] }) {
  const current = rows.filter((row) => row.series === "本期");
  const previous = rows.filter((row) => row.series === "上期");
  const maxValue = Math.max(0.1, ...rows.map((row) => row.value));

  const definition = defineChart({
    marks: [
      lineY(previous, { x: "label", y: "value", color: "series", strokeDasharray: "5 4" }),
      lineY(current, { x: "label", y: "value", color: "series", points: current.length <= 16 }),
    ],
    scales: {
      x: { scale: () => scalePoint<string>().padding(0.3) },
      y: {
        scale: scaleLinear().domain([0, Math.min(1, Math.ceil(maxValue * 10) / 10)]),
        grid: true,
        axis: { ticks: { format: (value: number) => formatPercent(value) } },
      },
    },
    color: {
      domain: ["本期", "上期"],
      range: [colors.chart1, colors.chart2],
      legend: colorLegend({ label: "" }),
    },
    focus: "group-x",
    tooltip: {
      use: tooltip,
      items: ["x", { channel: "y", label: "利用率", text: (point) => formatPercent(point.yValue, true) }],
    },
  });

  return (
    <div {...stylex.props(styles.frame)}>
      <Chart
        definition={definition}
        height={260}
        ariaLabel="利用率趋势，本期与上期对比"
        ariaDescription={`本期平均利用率 ${formatPercent(average(current), true)}，上期 ${formatPercent(average(previous), true)}`}
      />
    </div>
  );
}

/**
 * Whole-number tick values from 0 up to at least the largest value (about five ticks).
 *
 * @param values - Data values.
 * @returns Tick values.
 */
function integerTicks(values: readonly number[]): number[] {
  const max = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks: number[] = [];

  for (let tick = 0; tick < max + step; tick += step) ticks.push(tick);

  return ticks;
}

/**
 * Mean of row values.
 *
 * @param rows - Rows.
 * @returns The mean, or 0.
 */
function average(rows: readonly TrendRow[]): number {
  return rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
}

/**
 * Vertical histogram of counts per bucket.
 *
 * @param props - Chart props.
 * @param props.rows - Bucket rows.
 * @param props.label - Accessible name.
 * @returns The chart.
 */
export function HistogramChart({
  rows,
  label,
}: {
  rows: readonly { label: string; count: number }[];
  label: string;
}) {
  const ticks = integerTicks(rows.map((row) => row.count));

  const definition = defineChart({
    marks: [barY(rows, { x: "label", y: "count", fill: colors.chart1, radius: { end: 4 } })],
    scales: {
      x: { scale: () => scaleBand<string>().padding(0.25) },
      y: {
        scale: scaleLinear().domain([0, ticks.at(-1) ?? 1]),
        grid: true,
        axis: { ticks: { values: ticks, format: (value: number) => String(value) } },
      },
    },
    tooltip: {
      use: tooltip,
      items: ["x", { channel: "y", label: "次数", text: (point) => `${point.yValue} 次` }],
    },
  });

  return (
    <div {...stylex.props(styles.frame)}>
      <Chart
        definition={definition}
        height={220}
        ariaLabel={label}
        ariaDescription={rows.map((row) => `${row.label} ${row.count} 次`).join("，")}
      />
    </div>
  );
}

/**
 * 100 % stacked bar of single vs recurring bookings.
 *
 * @param props - Chart props.
 * @param props.single - Single booking count.
 * @param props.recurring - Recurring booking count.
 * @returns The chart.
 */
export function ShareChart({ single, recurring }: { single: number; recurring: number }) {
  const rows = [
    { kind: "单次", count: single },
    { kind: "重复", count: recurring },
  ];

  const definition = defineChart({
    marks: [
      barX(rows, { x: "count", y: () => "全部", color: "kind", layout: stack({ offset: "normalize" }) }),
    ],
    scales: {
      x: { scale: scaleLinear, axis: { ticks: { format: (value: number) => formatPercent(value) } } },
      y: { scale: () => scaleBand<string>().padding(0.2), axis: false },
    },
    color: {
      domain: ["单次", "重复"],
      range: [colors.chart1, colors.chart3],
      legend: colorLegend({ label: "" }),
    },
    tooltip: {
      use: tooltip,
      items: ["group", { channel: "x", label: "次数", text: (point) => `${point.datum.count} 次` }],
    },
  });

  return (
    <div {...stylex.props(styles.frame)}>
      <Chart
        definition={definition}
        height={96}
        ariaLabel="单次与重复预约占比"
        ariaDescription={`单次 ${single} 次，重复 ${recurring} 次`}
      />
    </div>
  );
}

/**
 * Horizontal ranking bars.
 *
 * @param props - Chart props.
 * @param props.rows - Ranked rows (already sorted, largest first).
 * @param props.unit - Value unit for tooltips and ticks.
 * @param props.label - Accessible name.
 * @returns The chart.
 */
export function RankingChart({
  rows,
  unit,
  label,
}: {
  rows: readonly { name: string; value: number }[];
  unit: string;
  label: string;
}) {
  const definition = defineChart({
    marks: [barX(rows, { x: "value", y: "name", fill: colors.chart1, radius: { end: 4 } })],
    scales: {
      x: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: {
          ticks: { format: (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1)) },
        },
      },
      y: { scale: () => scaleBand<string>().padding(0.25) },
    },
    tooltip: {
      use: tooltip,
      items: ["y", { channel: "x", label, text: (point) => `${point.xValue} ${unit}` }],
    },
  });

  return (
    <div {...stylex.props(styles.frame)}>
      <Chart
        definition={definition}
        height={Math.max(140, rows.length * 34 + 40)}
        ariaLabel={label}
        ariaDescription={rows.map((row) => `${row.name} ${row.value} ${unit}`).join("，")}
      />
    </div>
  );
}
