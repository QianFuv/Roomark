/**
 * Statistics helpers: filter presets, period comparison and display transforms.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";

import type { components } from "../api/schema";
import { formatMonthDay, parseDate, startOfWeek, weekdayLabel } from "./time";

/** Full statistics response. */
export type Stats = components["schemas"]["Stats"];

/** Date range preset of the statistics filter. */
export type RangePreset = "week" | "month" | "semester" | "custom";

/** Inclusive date range as ISO dates. */
export interface DateRange {
  from: string;
  to: string;
}

/** Comparison of one overview metric with the previous period. */
export interface MetricDelta {
  /** Relative change, e.g. `0.25` for +25 %; `undefined` when the previous value is 0. */
  ratio: number | undefined;
  direction: "up" | "down" | "flat";
}

/** One heatmap cell ready to render. */
export interface HeatCell {
  hour: number;
  ratio: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** Hourly columns of the statistics heatmap (08–21, matching the API's `[7][14]` matrix). */
export const STATS_HEATMAP_HOURS: readonly number[] = Array.from(
  { length: 14 },
  (_unused, index) => 8 + index,
);

/** Totals of a weekly heatmap. */
export interface HeatSummary {
  /** Booked minutes over the whole week. */
  totalMinutes: number;
  /** Row with the most booked time, or `undefined` when nothing is booked. */
  busiestRow: number | undefined;
}

/** Display labels of the duration histogram, in API order. */
export const DURATION_LABELS = ["≤30 分钟", "≤1 小时", "≤2 小时", "≤3 小时", "≤4 小时", ">4 小时"] as const;

/** Display labels of the lead time buckets, in API order. */
export const LEAD_TIME_LABELS = ["当天", "1–3 天", "4–7 天", ">7 天"] as const;

/**
 * Date range for a preset ending today. Semesters: autumn runs from September 1 to January 31,
 * spring from February 1 to August 31.
 *
 * @param preset - The preset (not `custom`).
 * @param today - Today's date.
 * @returns The inclusive range.
 */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: Temporal.PlainDate): DateRange {
  const to = today.toString();

  if (preset === "week") return { from: startOfWeek(today).toString(), to };

  if (preset === "month") return { from: today.with({ day: 1 }).toString(), to };

  if (today.month >= 9) return { from: today.with({ month: 9, day: 1 }).toString(), to };

  if (today.month === 1) {
    return { from: today.subtract({ years: 1 }).with({ month: 9, day: 1 }).toString(), to };
  }

  return { from: today.with({ month: 2, day: 1 }).toString(), to };
}

/**
 * Label of a date range such as `11月10日 – 11月16日`.
 *
 * @param range - The range.
 * @returns The label.
 */
export function rangeLabel(range: DateRange): string {
  return `${formatMonthDay(range.from)} – ${formatMonthDay(range.to)}`;
}

/**
 * The equally long period right before a range (used for the comparison caption).
 *
 * @param range - The current range.
 * @returns The previous range.
 */
export function previousRange(range: DateRange): DateRange {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  const days = from.until(to).days + 1;

  return {
    from: from.subtract({ days }).toString(),
    to: from.subtract({ days: 1 }).toString(),
  };
}

/**
 * Relative change against the previous period.
 *
 * @param current - Current value.
 * @param previous - Previous value.
 * @returns The delta.
 */
export function compareMetric(current: number, previous: number): MetricDelta {
  const epsilon = 1e-9;
  const direction = Math.abs(current - previous) < epsilon ? "flat" : current > previous ? "up" : "down";

  if (Math.abs(previous) < epsilon) return { ratio: undefined, direction };

  return { ratio: (current - previous) / previous, direction };
}

const percentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 0,
});

const precisePercentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 1,
});

/**
 * Format a ratio as a percentage.
 *
 * @param ratio - Ratio 0..1.
 * @param isPrecise - Keep one decimal.
 * @returns E.g. `63%`.
 */
export function formatPercent(ratio: number, isPrecise = false): string {
  return (isPrecise ? precisePercentFormatter : percentFormatter).format(Number.isFinite(ratio) ? ratio : 0);
}

/**
 * Format hours with at most one decimal.
 *
 * @param hours - Hours.
 * @returns E.g. `12.5`.
 */
export function formatHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toLocaleString("zh-CN");
}

/**
 * Text for a delta badge such as `+25%`, `−10%`, `持平` or `新增`.
 *
 * @param delta - The delta.
 * @returns The badge text.
 */
export function deltaText(delta: MetricDelta): string {
  if (delta.direction === "flat") return "持平";

  if (delta.ratio === undefined) return "上期无数据";
  const sign = delta.ratio > 0 ? "+" : "−";

  return `${sign}${formatPercent(Math.abs(delta.ratio))}`;
}

/**
 * Clamp an occupancy matrix into rows of cells with a 0–4 intensity level; missing values count
 * as 0.
 *
 * @param matrix - Ratios per row and hour column.
 * @param rowCount - Number of rows to produce.
 * @param hours - Hour of each column.
 * @returns One array of cells per row.
 */
export function heatRows(
  matrix: readonly (readonly number[] | null)[] | null | undefined,
  rowCount: number,
  hours: readonly number[],
): HeatCell[][] {
  return Array.from({ length: rowCount }, (_row, row) =>
    hours.map((hour, column) => {
      const ratio = Math.min(Math.max(matrix?.[row]?.[column] ?? 0, 0), 1);

      return { hour, ratio, level: heatLevel(ratio) };
    }),
  );
}

/**
 * Bucket a ratio into five display levels.
 *
 * @param ratio - Occupancy 0..1.
 * @returns Level 0 (empty) to 4 (almost always busy).
 */
function heatLevel(ratio: number): HeatCell["level"] {
  if (ratio <= 0.02) return 0;

  if (ratio < 0.25) return 1;

  if (ratio < 0.5) return 2;

  if (ratio < 0.75) return 3;

  return 4;
}

/**
 * Booked time of a week heatmap and its busiest day.
 *
 * @param rows - Cells per day.
 * @returns The summary.
 */
export function heatSummary(rows: readonly (readonly HeatCell[])[]): HeatSummary {
  let totalMinutes = 0;
  let busiestRow: number | undefined;
  let busiestMinutes = 0;

  rows.forEach((cells, row) => {
    const minutes = Math.round(cells.reduce((sum, cell) => sum + cell.ratio, 0) * 60);

    totalMinutes += minutes;

    if (minutes > busiestMinutes) {
      busiestMinutes = minutes;
      busiestRow = row;
    }
  });

  return { totalMinutes, busiestRow };
}

/**
 * Label of a top conflicting slot such as `周三 14:00`.
 *
 * @param slot - The slot.
 * @returns The label.
 */
export function conflictSlotLabel(slot: components["schemas"]["ConflictSlot"]): string {
  return `${weekdayLabel(slot.weekday)} ${pad(slot.hour)}:00`;
}

/**
 * Attach display labels to histogram buckets by position, falling back to the server label.
 *
 * @param buckets - Buckets from the API.
 * @param labels - Display labels in API order.
 * @returns Rows for a bar chart.
 */
export function labelBuckets(
  buckets: readonly components["schemas"]["Bucket"][] | null | undefined,
  labels: readonly string[],
): { label: string; count: number }[] {
  return (buckets ?? []).map((bucket, index) => ({
    label: labels[index] ?? bucket.label,
    count: bucket.count,
  }));
}

/** One point of the trend chart. */
export interface TrendRow {
  label: string;
  value: number;
  series: "本期" | "上期";
}

/**
 * Trend rows for a two-series line chart.
 *
 * @param trend - Trend points from the API.
 * @param granularity - Day or week buckets.
 * @returns Rows for the current and previous series.
 */
export function trendRows(
  trend: readonly components["schemas"]["TrendPoint"][] | null | undefined,
  granularity: Stats["granularity"],
): TrendRow[] {
  const rows: TrendRow[] = [];

  for (const point of trend ?? []) {
    const label = granularity === "week" ? `${formatMonthDay(point.date)}起` : formatMonthDay(point.date);
    rows.push({ label, value: point.utilization, series: "本期" });
    rows.push({ label, value: point.previousUtilization, series: "上期" });
  }

  return rows;
}

/**
 * Share of single bookings among all bookings.
 *
 * @param single - Single booking count.
 * @param recurring - Recurring booking count.
 * @returns Ratio 0..1 (0 when there are none).
 */
export function singleShare(single: number, recurring: number): number {
  const total = single + recurring;

  return total === 0 ? 0 : single / total;
}

/**
 * Zero-pad an hour.
 *
 * @param value - The number.
 * @returns Two-digit string.
 */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}
