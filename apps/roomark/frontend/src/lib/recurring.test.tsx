/**
 * Tests for recurring preview state: defaults, overrides, counts and reconciliation.
 *
 * @module
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vite-plus/test";

import {
  defaultRule,
  describeRule,
  initialChoices,
  reconcileChoices,
  suggestionLabel,
  summarize,
  summaryLine,
  toOverrides,
  type Occurrence,
} from "./recurring";

const SUGGESTION = {
  kind: "same_day" as const,
  start: "2026-11-26T15:00:00+08:00",
  end: "2026-11-26T17:00:00+08:00",
};

const PREVIEW: Occurrence[] = [
  { date: "2026-11-19", start: "2026-11-19T14:00:00+08:00", end: "2026-11-19T16:00:00+08:00", status: "ok" },
  {
    date: "2026-11-26",
    start: "2026-11-26T14:00:00+08:00",
    end: "2026-11-26T16:00:00+08:00",
    status: "conflict",
    conflict: {
      conflictEventId: 7,
      conflictWith: {
        name: "李四",
        title: "",
        start: "2026-11-26T14:00:00+08:00",
        end: "2026-11-26T15:00:00+08:00",
      },
      suggestions: [SUGGESTION],
    },
  },
  {
    date: "2026-12-03",
    start: "2026-12-03T14:00:00+08:00",
    end: "2026-12-03T16:00:00+08:00",
    status: "violation",
    violations: [{ code: "too_far_ahead", message: "超出可预约范围" }],
  },
];

describe("recurring preview", () => {
  test("given a chosen date when creating the default rule then it repeats weekly on that weekday 8 times", () => {
    expect(defaultRule(Temporal.PlainDate.from("2026-11-19"), "14:00", "16:00")).toEqual({
      freq: "weekly",
      weekdays: [4],
      startDate: "2026-11-19",
      count: 8,
      startTime: "14:00",
      endTime: "16:00",
    });
  });

  test("given a preview when choices start then conflicts and violations default to skip", () => {
    const choices = initialChoices(PREVIEW);
    const summary = summarize(PREVIEW, choices);

    expect(summary).toEqual({ total: 3, bookable: 1, conflicts: 1, violations: 1, willBook: 1 });
    expect(summaryLine(summary)).toBe("共 3 次 · 1 次可约 · 1 次有冲突 · 1 次不可约");
    expect(toOverrides(PREVIEW, choices)).toEqual([
      { date: "2026-11-26", action: "skip" },
      { date: "2026-12-03", action: "skip" },
    ]);
  });

  test("given a tapped suggestion when counting then the submit count rises and the override moves", () => {
    const choices = new Map(initialChoices(PREVIEW)).set("2026-11-26", { action: "move", ...SUGGESTION });

    expect(summarize(PREVIEW, choices).willBook).toBe(2);
    expect(toOverrides(PREVIEW, choices)[0]).toEqual({
      date: "2026-11-26",
      action: "move",
      start: SUGGESTION.start,
      end: SUGGESTION.end,
    });
  });

  test("given a refreshed preview when reconciling then still-valid moves survive and stale ones reset", () => {
    const moved = new Map(initialChoices(PREVIEW)).set("2026-11-26", { action: "move", ...SUGGESTION });
    const kept = reconcileChoices(moved, PREVIEW);

    const refreshed = PREVIEW.map((occurrence) =>
      occurrence.conflict === undefined
        ? occurrence
        : { ...occurrence, conflict: { ...occurrence.conflict, suggestions: [] } },
    );

    expect(kept.get("2026-11-26")?.action).toBe("move");
    expect(reconcileChoices(moved, refreshed).get("2026-11-26")?.action).toBe("skip");
  });

  test("given a rule when describing it then the summary names frequency, weekdays and end", () => {
    expect(
      describeRule({
        freq: "biweekly",
        weekdays: [3, 1],
        startDate: "2026-11-19",
        untilDate: "2027-01-07",
        startTime: "14:00",
        endTime: "16:00",
      }),
    ).toBe("每两周一、三 14:00–16:00 · 至 1月7日");
    expect(suggestionLabel(SUGGESTION.start, SUGGESTION.end, "same_day")).toBe("当天 15:00–17:00");
    expect(suggestionLabel(SUGGESTION.start, SUGGESTION.end, "other_day")).toBe("11月26日 周四 15:00–17:00");
  });
});
