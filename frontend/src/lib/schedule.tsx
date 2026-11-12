/**
 * Pure scheduling math: day timeline layout, tap-to-slot snapping and quick-use options.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";

import {
  GRID_MINUTES,
  ceilToGrid,
  clockToMinutes,
  floorToGrid,
  minutesOfDay,
  minutesToClock,
  parseZoned,
} from "./time";

/** Minimal booking shape needed for layout. */
export interface TimedItem {
  start: string;
  end: string;
}

/** A booking positioned on a vertical day timeline. */
export interface PositionedItem<Item extends TimedItem> {
  item: Item;
  topPercent: number;
  heightPercent: number;
  startMinutes: number;
  endMinutes: number;
}

/** One quick-use duration choice. */
export interface QuickUseOption {
  minutes: 30 | 60 | 90 | 120;
  isEnabled: boolean;
  endClock: string;
}

/** Quick-use durations offered by the API. */
const QUICK_USE_MINUTES = [30, 60, 90, 120] as const;

/** Default length of a booking proposed from a tap on the calendar. */
export const DEFAULT_SLOT_MINUTES = 60;

/**
 * Clip and position the items that fall on one date within open hours.
 *
 * @param items - Bookings (any date).
 * @param date - The day to lay out.
 * @param openClock - Opening time `HH:MM`.
 * @param closeClock - Closing time `HH:MM`.
 * @returns Items on that day with percentage offsets, sorted by start.
 */
export function layoutDay<Item extends TimedItem>(
  items: readonly Item[],
  date: Temporal.PlainDate,
  openClock: string,
  closeClock: string,
): PositionedItem<Item>[] {
  const openMinutes = clockToMinutes(openClock);
  const closeMinutes = clockToMinutes(closeClock);
  const span = Math.max(closeMinutes - openMinutes, 1);
  const positioned: PositionedItem<Item>[] = [];

  for (const item of items) {
    const start = parseZoned(item.start);

    if (!start.toPlainDate().equals(date)) continue;
    const startMinutes = Math.max(minutesOfDay(start), openMinutes);
    const endMinutes = Math.min(minutesOfDay(parseZoned(item.end)), closeMinutes);

    if (endMinutes <= startMinutes) continue;
    positioned.push({
      item,
      startMinutes,
      endMinutes,
      topPercent: ((startMinutes - openMinutes) / span) * 100,
      heightPercent: ((endMinutes - startMinutes) / span) * 100,
    });
  }

  return positioned.sort((left, right) => left.startMinutes - right.startMinutes);
}

/**
 * Convert a vertical tap position into a grid-aligned clock time.
 *
 * @param ratio - Tap offset divided by the column height (0..1).
 * @param openClock - Opening time.
 * @param closeClock - Closing time.
 * @returns Minutes since midnight, floored to the grid and clamped to open hours.
 */
export function minutesAtRatio(ratio: number, openClock: string, closeClock: string): number {
  const openMinutes = clockToMinutes(openClock);
  const closeMinutes = clockToMinutes(closeClock);
  const raw = openMinutes + Math.min(Math.max(ratio, 0), 1) * (closeMinutes - openMinutes);

  return Math.min(floorToGrid(raw), closeMinutes - GRID_MINUTES);
}

/**
 * Propose a free slot starting at a tapped time, shortened to fit before the next booking
 * and closing time. Returns `undefined` if the tapped time is inside a booking or in the past.
 *
 * @param date - The day tapped.
 * @param startMinutes - Tapped grid-aligned minutes since midnight.
 * @param items - Bookings on any date.
 * @param closeClock - Closing time.
 * @param now - Current time.
 * @returns Clock times of the proposal, or `undefined`.
 */
export function proposeSlot(
  date: Temporal.PlainDate,
  startMinutes: number,
  items: readonly TimedItem[],
  closeClock: string,
  now: Temporal.ZonedDateTime,
): { startClock: string; endClock: string } | undefined {
  let start = startMinutes;

  if (date.equals(now.toPlainDate())) {
    start = Math.max(start, ceilToGrid(minutesOfDay(now)));
  } else if (date.until(now.toPlainDate()).days > 0) {
    return undefined;
  }

  const dayItems = layoutDay(items, date, "00:00", "24:00");

  if (dayItems.some((entry) => entry.startMinutes <= start && start < entry.endMinutes)) {
    return undefined;
  }

  const nextStart = dayItems.find((entry) => entry.startMinutes > start)?.startMinutes;
  const limit = Math.min(nextStart ?? Number.POSITIVE_INFINITY, clockToMinutes(closeClock));
  const end = Math.min(start + DEFAULT_SLOT_MINUTES, limit);

  if (end - start < GRID_MINUTES) return undefined;

  return { startClock: minutesToClock(start), endClock: minutesToClock(end) };
}

/**
 * Quick-use options for a free room. An option is enabled when it fits in the free window;
 * the shortest option stays enabled when at least one grid step is free, because the server
 * caps the end at the next booking or closing time.
 *
 * @param now - Current time.
 * @param freeUntil - End of the free window (timestamp) if the server reported one.
 * @param closeClock - Closing time of the room.
 * @returns One option per offered duration.
 */
export function quickUseOptions(
  now: Temporal.ZonedDateTime,
  freeUntil: string | undefined,
  closeClock: string,
): QuickUseOption[] {
  const nowMinutes = minutesOfDay(now);
  const closeMinutes = clockToMinutes(closeClock);
  let limit = closeMinutes;

  if (freeUntil !== undefined) {
    const freeEnd = parseZoned(freeUntil);

    if (freeEnd.toPlainDate().equals(now.toPlainDate())) {
      limit = Math.min(limit, minutesOfDay(freeEnd));
    }
  }

  const remaining = limit - nowMinutes;

  return QUICK_USE_MINUTES.map((minutes, index) => {
    const fits = minutes <= remaining;
    const isEnabled = fits || (index === 0 && remaining >= GRID_MINUTES);

    return {
      minutes,
      isEnabled,
      endClock: minutesToClock(Math.min(nowMinutes + minutes, limit)),
    };
  });
}

/**
 * Whether a booking is ongoing at a moment.
 *
 * @param item - The booking.
 * @param now - The moment.
 * @returns `true` while `start <= now < end`.
 */
export function isOngoing(item: TimedItem, now: Temporal.ZonedDateTime): boolean {
  const nowMs = now.epochMilliseconds;

  return parseZoned(item.start).epochMilliseconds <= nowMs && nowMs < parseZoned(item.end).epochMilliseconds;
}

/**
 * Whether a booking has ended at a moment.
 *
 * @param item - The booking.
 * @param now - The moment.
 * @returns `true` when `end <= now`.
 */
export function isFinished(item: TimedItem, now: Temporal.ZonedDateTime): boolean {
  return parseZoned(item.end).epochMilliseconds <= now.epochMilliseconds;
}

/** One row of a day agenda. */
export type AgendaEntry<Item extends TimedItem> =
  | { kind: "booking"; item: Item; startMinutes: number; endMinutes: number }
  | { kind: "free"; startMinutes: number; endMinutes: number };

/**
 * Bookings of a day interleaved with the free windows between them (within open hours).
 * Free windows shorter than one grid step are dropped; on today, free time before now is dropped.
 *
 * @param items - Bookings on any date.
 * @param date - The day.
 * @param openClock - Opening time.
 * @param closeClock - Closing time.
 * @param now - Current time.
 * @returns Agenda rows in time order.
 */
export function dayAgenda<Item extends TimedItem>(
  items: readonly Item[],
  date: Temporal.PlainDate,
  openClock: string,
  closeClock: string,
  now: Temporal.ZonedDateTime,
): AgendaEntry<Item>[] {
  const positioned = layoutDay(items, date, openClock, closeClock);
  const isToday = date.equals(now.toPlainDate());
  const nowMinutes = isToday ? minutesOfDay(now) : Number.NEGATIVE_INFINITY;
  const entries: AgendaEntry<Item>[] = [];
  let cursor = clockToMinutes(openClock);

  const pushFree = (until: number) => {
    const start = Math.max(cursor, isToday ? ceilToGrid(nowMinutes) : cursor);

    if (until - start >= GRID_MINUTES) entries.push({ kind: "free", startMinutes: start, endMinutes: until });
  };

  for (const entry of positioned) {
    pushFree(entry.startMinutes);
    entries.push({
      kind: "booking",
      item: entry.item,
      startMinutes: entry.startMinutes,
      endMinutes: entry.endMinutes,
    });
    cursor = Math.max(cursor, entry.endMinutes);
  }

  pushFree(clockToMinutes(closeClock));

  return entries;
}

/** State of one grid step when picking a start time. */
export type SlotState = "free" | "busy" | "past" | "closed";

/** Open hours, the earliest bookable minute and the busy intervals of one day. */
export interface DayAvailability<Item extends TimedItem> {
  openMinutes: number;
  closeMinutes: number;
  earliestMinutes: number;
  busy: PositionedItem<Item>[];
}

/**
 * Collect what limits booking on one day.
 *
 * @param items - Bookings on any date (exclude the one being edited).
 * @param date - The day.
 * @param openClock - Opening time.
 * @param closeClock - Closing time.
 * @param now - Current time.
 * @returns The availability.
 */
export function dayAvailability<Item extends TimedItem>(
  items: readonly Item[],
  date: Temporal.PlainDate,
  openClock: string,
  closeClock: string,
  now: Temporal.ZonedDateTime,
): DayAvailability<Item> {
  const today = now.toPlainDate();
  const isPastDay = date.until(today).days > 0;
  const isToday = date.equals(today);

  return {
    openMinutes: clockToMinutes(openClock),
    closeMinutes: clockToMinutes(closeClock),
    earliestMinutes: isPastDay ? Number.POSITIVE_INFINITY : isToday ? ceilToGrid(minutesOfDay(now)) : 0,
    busy: layoutDay(items, date, "00:00", "24:00"),
  };
}

/**
 * State of the grid step starting at a minute.
 *
 * @param availability - The day's availability.
 * @param startMinutes - Minutes since midnight.
 * @returns `closed` outside open hours, `past` before now, `busy` when a booking overlaps.
 */
export function slotState<Item extends TimedItem>(
  availability: DayAvailability<Item>,
  startMinutes: number,
): SlotState {
  const endMinutes = startMinutes + GRID_MINUTES;

  if (startMinutes < availability.openMinutes || endMinutes > availability.closeMinutes) return "closed";

  if (startMinutes < availability.earliestMinutes) return "past";

  const isBusy = availability.busy.some(
    (entry) => entry.startMinutes < endMinutes && startMinutes < entry.endMinutes,
  );

  return isBusy ? "busy" : "free";
}

/**
 * The booking that first limits how long a slot starting at a minute can last.
 *
 * @param availability - The day's availability.
 * @param startMinutes - Start minutes since midnight.
 * @returns The first booking ending after the start, if any.
 */
export function nextBusy<Item extends TimedItem>(
  availability: DayAvailability<Item>,
  startMinutes: number,
): PositionedItem<Item> | undefined {
  return availability.busy.find((entry) => entry.endMinutes > startMinutes);
}

/**
 * Latest end for a booking that starts at a minute: closing time, maximum duration and the next
 * booking, whichever comes first. Equals the start when the start itself is taken.
 *
 * @param availability - The day's availability.
 * @param startMinutes - Start minutes since midnight.
 * @param maxDurationMinutes - Longest allowed booking.
 * @returns Minutes since midnight.
 */
export function latestEnd<Item extends TimedItem>(
  availability: DayAvailability<Item>,
  startMinutes: number,
  maxDurationMinutes: number,
): number {
  const limit = Math.min(availability.closeMinutes, startMinutes + maxDurationMinutes);
  const blocker = nextBusy(availability, startMinutes);

  if (blocker === undefined) return limit;

  return Math.min(limit, Math.max(blocker.startMinutes, startMinutes));
}
