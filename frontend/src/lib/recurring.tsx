/**
 * Recurring booking helpers: default rule, preview choices, overrides and summary.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";

import type { components } from "../api/schema";
import { formatClockRange, formatDateLabel, formatMonthDay, parseZoned, weekdayLabel } from "./time";

/** An occurrence returned by the series preview. */
export type Occurrence = components["schemas"]["Occurrence"];

/** A series rule as sent to the API. */
export type SeriesRule = components["schemas"]["SeriesRule"];

/** A per-occurrence override sent when creating a series. */
export type SeriesOverride = components["schemas"]["Override"];

/** What the user decided for one occurrence. */
export type OccurrenceChoice =
  | { action: "book" }
  | { action: "skip" }
  | { action: "move"; start: string; end: string };

/** Choices keyed by occurrence date. */
export type ChoiceMap = ReadonlyMap<string, OccurrenceChoice>;

/** Counts shown above the preview list. */
export interface PreviewSummary {
  total: number;
  bookable: number;
  conflicts: number;
  violations: number;
  willBook: number;
}

/** Default number of occurrences in a new series. */
export const DEFAULT_SERIES_COUNT = 8;

/**
 * Default rule for a series that starts on a date: weekly, same weekday, 8 times.
 *
 * @param date - The chosen first date.
 * @param startTime - Start `HH:MM`.
 * @param endTime - End `HH:MM`.
 * @returns The rule.
 */
export function defaultRule(date: Temporal.PlainDate, startTime: string, endTime: string): SeriesRule {
  return {
    freq: "weekly",
    weekdays: [date.dayOfWeek],
    startDate: date.toString(),
    count: DEFAULT_SERIES_COUNT,
    startTime,
    endTime,
  };
}

/**
 * Initial choices: free occurrences are booked, conflicting and invalid ones are skipped.
 *
 * @param occurrences - The preview.
 * @returns Choice per date.
 */
export function initialChoices(occurrences: readonly Occurrence[]): ChoiceMap {
  const choices = new Map<string, OccurrenceChoice>();

  for (const occurrence of occurrences) {
    choices.set(occurrence.date, occurrence.status === "ok" ? { action: "book" } : { action: "skip" });
  }

  return choices;
}

/**
 * Keep choices that are still valid for a refreshed preview; reset the rest to defaults.
 * A `move` survives only if the occurrence is still a conflict; `book` only if it is still ok.
 *
 * @param previous - Earlier choices.
 * @param occurrences - The refreshed preview.
 * @returns Reconciled choices.
 */
export function reconcileChoices(previous: ChoiceMap, occurrences: readonly Occurrence[]): ChoiceMap {
  const defaults = initialChoices(occurrences);
  const choices = new Map(defaults);

  for (const occurrence of occurrences) {
    const earlier = previous.get(occurrence.date);

    if (earlier === undefined) continue;

    if (occurrence.status === "ok" && earlier.action !== "move") choices.set(occurrence.date, earlier);

    if (occurrence.status === "conflict" && earlier.action === "move") {
      const stillSuggested = (occurrence.conflict?.suggestions ?? []).some(
        (suggestion) => suggestion.start === earlier.start && suggestion.end === earlier.end,
      );

      if (stillSuggested) choices.set(occurrence.date, earlier);
    }
  }

  return choices;
}

/**
 * Overrides to send with the create request. Every non-booked occurrence is an explicit skip,
 * so the server never books something the user did not see as booked.
 *
 * @param occurrences - The preview.
 * @param choices - The user's choices.
 * @returns Overrides list.
 */
export function toOverrides(occurrences: readonly Occurrence[], choices: ChoiceMap): SeriesOverride[] {
  const overrides: SeriesOverride[] = [];

  for (const occurrence of occurrences) {
    const choice = choices.get(occurrence.date) ?? { action: "skip" };

    if (choice.action === "move") {
      overrides.push({ date: occurrence.date, action: "move", start: choice.start, end: choice.end });
    } else if (choice.action === "skip" || occurrence.status !== "ok") {
      overrides.push({ date: occurrence.date, action: "skip" });
    }
  }

  return overrides;
}

/**
 * Summary counts for the preview header and submit button.
 *
 * @param occurrences - The preview.
 * @param choices - The user's choices.
 * @returns Counts.
 */
export function summarize(occurrences: readonly Occurrence[], choices: ChoiceMap): PreviewSummary {
  let bookable = 0;
  let conflicts = 0;
  let violations = 0;
  let willBook = 0;

  for (const occurrence of occurrences) {
    if (occurrence.status === "ok") bookable += 1;

    if (occurrence.status === "conflict") conflicts += 1;

    if (occurrence.status === "violation") violations += 1;
    const choice = choices.get(occurrence.date);

    if (choice?.action === "move" || (choice?.action === "book" && occurrence.status === "ok")) {
      willBook += 1;
    }
  }

  return { total: occurrences.length, bookable, conflicts, violations, willBook };
}

/**
 * Header line such as `共 8 次 · 7 次可约 · 1 次有冲突`.
 *
 * @param summary - The counts.
 * @returns The header text.
 */
export function summaryLine(summary: PreviewSummary): string {
  const parts = [`共 ${summary.total} 次`, `${summary.bookable} 次可约`];

  if (summary.conflicts > 0) parts.push(`${summary.conflicts} 次有冲突`);

  if (summary.violations > 0) parts.push(`${summary.violations} 次不可约`);

  return parts.join(" · ");
}

/**
 * Human summary of a rule such as `每周三 14:00–16:00 · 共 8 次`.
 *
 * @param rule - The rule.
 * @returns The label.
 */
export function describeRule(rule: SeriesRule): string {
  const prefix = rule.freq === "biweekly" ? "每两周" : "每周";

  const days = [...(rule.weekdays ?? [])]
    .sort((left, right) => left - right)
    .map((weekday) => weekdayLabel(weekday).replace("周", ""))
    .join("、");

  const ending =
    rule.untilDate !== undefined && rule.untilDate !== ""
      ? `至 ${formatMonthDay(rule.untilDate)}`
      : `共 ${rule.count ?? DEFAULT_SERIES_COUNT} 次`;

  return `${prefix}${days} ${rule.startTime}–${rule.endTime} · ${ending}`;
}

/**
 * Label of a suggestion chip: `当天 15:00–17:00` or `11月27日 周四 14:00–16:00`.
 *
 * @param start - Start timestamp.
 * @param end - End timestamp.
 * @param kind - Suggestion kind.
 * @returns The label.
 */
export function suggestionLabel(start: string, end: string, kind: "same_day" | "other_day"): string {
  if (kind === "same_day") return `当天 ${formatClockRange(start, end)}`;

  return `${formatDateLabel(parseZoned(start).toPlainDate())} ${formatClockRange(start, end)}`;
}
