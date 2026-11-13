/**
 * Tests for the day timeline math, tap-to-slot snapping and quick-use options.
 *
 * @module
 */
import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, test } from "vite-plus/test";

import {
  dayAgenda,
  dayAvailability,
  latestEnd,
  layoutDay,
  minutesAtRatio,
  nextFreeSlot,
  proposeSlot,
  quickUseOptions,
  slotState,
  type TimedItem,
} from "./schedule";
import { TIME_ZONE, toTimestamp } from "./time";

const DAY = Temporal.PlainDate.from("2026-11-19");

/**
 * A zoned time on the test day.
 *
 * @param clock - `HH:MM`.
 * @param date - Day.
 * @returns The time.
 */
function at(clock: string, date: Temporal.PlainDate = DAY): Temporal.ZonedDateTime {
  return date.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from(clock) });
}

/**
 * A booking-like item on the test day.
 *
 * @param start - Start clock.
 * @param end - End clock.
 * @returns The item.
 */
function item(start: string, end: string): TimedItem {
  return { start: toTimestamp(DAY, start), end: toTimestamp(DAY, end) };
}

describe("layoutDay", () => {
  test("given a booking within open hours when laid out then offsets are proportional to the day", () => {
    const [entry] = layoutDay([item("15:00", "18:30")], DAY, "08:00", "22:00");

    expect(entry?.topPercent).toBeCloseTo(50);
    expect(entry?.heightPercent).toBeCloseTo(25);
  });

  test("given a booking on another day or outside open hours when laid out then it is dropped or clipped", () => {
    const other = {
      start: toTimestamp(DAY.add({ days: 1 }), "09:00"),
      end: toTimestamp(DAY.add({ days: 1 }), "10:00"),
    };

    const entries = layoutDay([other, item("07:00", "09:00")], DAY, "08:00", "22:00");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.startMinutes).toBe(8 * 60);
  });
});

describe("minutesAtRatio and proposeSlot", () => {
  test("given a tap at 10:10 when snapped then it floors to the 15-minute grid", () => {
    expect(minutesAtRatio((2 * 60 + 10) / (14 * 60), "08:00", "22:00")).toBe(10 * 60);
  });

  test("given a tap before the next booking when proposing then the slot ends at that booking", () => {
    const slot = proposeSlot(DAY, 9 * 60 + 30, [item("10:00", "11:00")], "22:00", at("08:00"));

    expect(slot).toEqual({ startClock: "09:30", endClock: "10:00" });
  });

  test("given a tap inside a booking or on a past day when proposing then nothing is offered", () => {
    expect(proposeSlot(DAY, 10 * 60 + 15, [item("10:00", "11:00")], "22:00", at("08:00"))).toBeUndefined();
    expect(proposeSlot(DAY, 10 * 60, [], "22:00", at("08:00", DAY.add({ days: 1 })))).toBeUndefined();
  });

  test("given a tap earlier today when proposing then the start moves to the next grid line after now", () => {
    expect(proposeSlot(DAY, 9 * 60, [], "22:00", at("13:07"))).toEqual({
      startClock: "13:15",
      endClock: "14:15",
    });
  });
});

describe("quickUseOptions", () => {
  test("given 50 free minutes when listing quick use then only options that fit are enabled", () => {
    const options = quickUseOptions(at("14:10"), toTimestamp(DAY, "15:00"), "22:00");

    expect(options.map((option) => option.isEnabled)).toEqual([true, false, false, false]);
    expect(options[0]?.endClock).toBe("14:40");
    expect(options[1]?.endClock).toBe("15:00");
  });

  test("given 20 free minutes when listing quick use then the shortest stays enabled and is capped", () => {
    const options = quickUseOptions(at("14:40"), toTimestamp(DAY, "15:00"), "22:00");

    expect(options[0]).toEqual({ minutes: 30, isEnabled: true, endClock: "15:00" });
  });

  test("given no free-until when listing quick use then closing time limits the options", () => {
    const options = quickUseOptions(at("21:00"), undefined, "22:00");

    expect(options.map((option) => option.isEnabled)).toEqual([true, true, false, false]);
  });
});

describe("dayAgenda", () => {
  test("given bookings today when building the agenda then free gaps start after now on the grid", () => {
    const entries = dayAgenda(
      [item("10:00", "11:00"), item("15:00", "16:00")],
      DAY,
      "08:00",
      "22:00",
      at("10:20"),
    );

    expect(entries.map((entry) => [entry.kind, entry.startMinutes / 60, entry.endMinutes / 60])).toEqual([
      ["booking", 10, 11],
      ["free", 11, 15],
      ["booking", 15, 16],
      ["free", 16, 22],
    ]);
  });
});

describe("day availability", () => {
  const items = [item("10:00", "11:00"), item("14:00", "15:30")];

  test("given today at 09:07 when steps are classified then past, free, busy and closed are told apart", () => {
    const availability = dayAvailability(items, DAY, "08:00", "22:00", at("09:07"));

    expect(slotState(availability, 7 * 60 + 45)).toBe("closed");
    expect(slotState(availability, 9 * 60)).toBe("past");
    expect(slotState(availability, 9 * 60 + 15)).toBe("free");
    expect(slotState(availability, 9 * 60 + 45)).toBe("free");
    expect(slotState(availability, 10 * 60 + 45)).toBe("busy");
    expect(slotState(availability, 21 * 60 + 45)).toBe("free");
    expect(slotState(availability, 22 * 60)).toBe("closed");
  });

  test("given a later day when the latest end is asked then the next booking, max duration and closing cap it", () => {
    const availability = dayAvailability(
      items,
      DAY,
      "08:00",
      "22:00",
      at("09:00", DAY.subtract({ days: 1 })),
    );

    expect(latestEnd(availability, 8 * 60, 240)).toBe(10 * 60);
    expect(latestEnd(availability, 11 * 60, 120)).toBe(13 * 60);
    expect(latestEnd(availability, 20 * 60, 240)).toBe(22 * 60);
    expect(latestEnd(availability, 10 * 60 + 30, 240)).toBe(10 * 60 + 30);
  });

  test("given a past day when steps are classified then every open step is past", () => {
    const availability = dayAvailability([], DAY, "08:00", "22:00", at("09:00", DAY.add({ days: 1 })));

    expect(slotState(availability, 12 * 60)).toBe("past");
  });
});

describe("nextFreeSlot", () => {
  test("given a booking right after now when looking for the next free slot then it starts when that booking ends", () => {
    const slot = nextFreeSlot([item("09:15", "10:00")], at("09:07"), "08:00", "22:00", 240, DAY, DAY);

    expect(slot).toEqual({ date: DAY, startClock: "10:00", endClock: "11:00" });
  });

  test("given a short free window before a booking when looking then the default duration shrinks to fit", () => {
    const slot = nextFreeSlot([item("09:30", "12:00")], at("09:00"), "08:00", "22:00", 240, DAY, DAY);

    expect(slot).toEqual({ date: DAY, startClock: "09:00", endClock: "09:30" });
  });

  test("given no time left today when looking then the next day's first free slot is used", () => {
    const tomorrow = DAY.add({ days: 1 });

    const early = {
      start: toTimestamp(tomorrow, "08:00"),
      end: toTimestamp(tomorrow, "08:30"),
    };

    const slot = nextFreeSlot([early], at("21:50"), "08:00", "22:00", 240, DAY, tomorrow);

    expect(slot).toEqual({ date: tomorrow, startClock: "08:30", endClock: "09:30" });
  });

  test("given a fully booked range when looking then there is no slot", () => {
    expect(
      nextFreeSlot([item("08:00", "22:00")], at("07:00"), "08:00", "22:00", 240, DAY, DAY),
    ).toBeUndefined();
  });
});
