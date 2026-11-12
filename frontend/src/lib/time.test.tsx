/**
 * Tests for day-aware time labels: a time shown outside a single-day view names its day unless it
 * is today.
 *
 * @module
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vite-plus/test";

import { formatClockWithDay, formatDateSpan, formatDayPrefix } from "./time";

/** Thursday. */
const TODAY = Temporal.PlainDate.from("2026-11-12");

describe("day-aware labels", () => {
  test("given dates around today when prefixing then today is bare, the next two days are named and others show the date", () => {
    expect(formatDayPrefix("2026-11-12", TODAY)).toBe("");
    expect(formatDayPrefix("2026-11-13", TODAY)).toBe("明天");
    expect(formatDayPrefix("2026-11-14", TODAY)).toBe("后天");
    expect(formatDayPrefix("2026-11-16", TODAY)).toBe("11月16日 周一");
    expect(formatDayPrefix("2026-11-11", TODAY)).toBe("11月11日 周三");
  });

  test("given a timestamp when labeling the clock then it names the day only when it is not today", () => {
    expect(formatClockWithDay("2026-11-12T16:00:00+08:00", TODAY)).toBe("16:00");
    expect(formatClockWithDay("2026-11-13T08:00:00+08:00", TODAY)).toBe("明天 08:00");
    expect(formatClockWithDay("2026-11-20T09:30:00+08:00", TODAY)).toBe("11月20日 周五 09:30");
  });

  test("given a timestamp just after midnight in UTC when labeling then the Shanghai day decides", () => {
    expect(formatClockWithDay("2026-11-12T16:30:00Z", TODAY)).toBe("明天 00:30");
  });

  test("given a week when spanning dates then the month is repeated only when it changes", () => {
    expect(formatDateSpan(Temporal.PlainDate.from("2026-11-09"), Temporal.PlainDate.from("2026-11-15"))).toBe(
      "11月9日–15日",
    );
    expect(formatDateSpan(Temporal.PlainDate.from("2026-10-26"), Temporal.PlainDate.from("2026-11-01"))).toBe(
      "10月26日–11月1日",
    );
  });
});
