/**
 * Tests for statistics transforms: presets, comparison, heatmap levels and trend rows.
 *
 * @module
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vite-plus/test";

import {
  compareMetric,
  conflictSlotLabel,
  deltaText,
  heatCells,
  labelBuckets,
  presetRange,
  previousRange,
  trendRows,
  usuallyFreeRanges,
} from "./stats";

describe("stats filters", () => {
  test("given a Thursday when choosing presets then week starts Monday and month starts on the 1st", () => {
    const today = Temporal.PlainDate.from("2026-11-12");

    expect(presetRange("week", today)).toEqual({ from: "2026-11-09", to: "2026-11-12" });
    expect(presetRange("month", today)).toEqual({ from: "2026-11-01", to: "2026-11-12" });
  });

  test("given autumn, January and spring dates when choosing the semester then the right start is used", () => {
    expect(presetRange("semester", Temporal.PlainDate.from("2026-11-12")).from).toBe("2026-09-01");
    expect(presetRange("semester", Temporal.PlainDate.from("2027-01-10")).from).toBe("2026-09-01");
    expect(presetRange("semester", Temporal.PlainDate.from("2027-04-02")).from).toBe("2027-02-01");
  });

  test("given a range when computing the previous period then it has the same length right before", () => {
    expect(previousRange({ from: "2026-11-09", to: "2026-11-15" })).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
  });
});

describe("stats display", () => {
  test("given current and previous values when comparing then the delta text is signed or flat", () => {
    expect(deltaText(compareMetric(15, 10))).toBe("+50%");
    expect(deltaText(compareMetric(9, 12))).toBe("−25%");
    expect(deltaText(compareMetric(3, 3))).toBe("持平");
    expect(deltaText(compareMetric(3, 0))).toBe("上期无数据");
  });

  test("given a heatmap matrix when flattening then levels follow the ratio and free hours merge", () => {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: 14 }, (_unused, column) => (column < 2 ? 0 : 0.9)),
    );

    const cells = heatCells(matrix);

    expect(cells).toHaveLength(98);
    expect(cells[0]).toEqual({ weekday: 1, hour: 8, ratio: 0, level: 0 });
    expect(cells[2]?.level).toBe(4);
    expect(usuallyFreeRanges(cells, 1)).toEqual(["08:00–10:00"]);
  });

  test("given API buckets and trend points when labeling then rows carry Chinese labels and both series", () => {
    expect(labelBuckets([{ label: "x", count: 2 }], ["≤30 分钟"])).toEqual([{ label: "≤30 分钟", count: 2 }]);
    expect(trendRows([{ date: "2026-11-09", utilization: 0.5, previousUtilization: 0.25 }], "week")).toEqual([
      { label: "11月9日起", value: 0.5, series: "本期" },
      { label: "11月9日起", value: 0.25, series: "上期" },
    ]);
    expect(conflictSlotLabel({ weekday: 3, hour: 9, count: 4 })).toBe("周三 09:00");
  });
});
