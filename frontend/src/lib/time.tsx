/**
 * Date and time helpers. Every business time is interpreted in Asia/Shanghai.
 *
 * @module
 */
import { Temporal } from "@js-temporal/polyfill";

/** The only time zone the product uses. */
export const TIME_ZONE = "Asia/Shanghai";

/** Booking grid step in minutes. */
export const GRID_MINUTES = 15;

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

/**
 * Current moment in the product time zone.
 *
 * @returns The current zoned date time.
 */
export function nowZoned(): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO(TIME_ZONE);
}

/**
 * Today's date in the product time zone.
 *
 * @returns Today's plain date.
 */
export function todayDate(): Temporal.PlainDate {
  return nowZoned().toPlainDate();
}

/**
 * Parse an RFC 3339 timestamp into the product time zone.
 *
 * @param value - An RFC 3339 timestamp such as `2026-11-19T14:00:00+08:00`.
 * @returns The zoned date time.
 */
export function parseZoned(value: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(value).toZonedDateTimeISO(TIME_ZONE);
}

/**
 * Parse a `YYYY-MM-DD` date.
 *
 * @param value - The ISO date string.
 * @returns The plain date.
 */
export function parseDate(value: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(value);
}

/**
 * Convert an `HH:MM` clock string to minutes since midnight.
 *
 * @param clock - The clock string.
 * @returns Minutes since midnight.
 */
export function clockToMinutes(clock: string): number {
  const [hours = "0", minutes = "0"] = clock.split(":");

  return Number(hours) * 60 + Number(minutes);
}

/**
 * Convert minutes since midnight to an `HH:MM` clock string.
 *
 * @param totalMinutes - Minutes since midnight.
 * @returns The zero-padded clock string.
 */
export function minutesToClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Minutes since midnight of a zoned date time.
 *
 * @param value - The zoned date time.
 * @returns Minutes since midnight.
 */
export function minutesOfDay(value: Temporal.ZonedDateTime): number {
  return value.hour * 60 + value.minute;
}

/**
 * Build an RFC 3339 timestamp with the `+08:00` offset from a date and a clock time.
 *
 * @param date - The calendar date.
 * @param clock - The `HH:MM` clock time.
 * @returns The timestamp string.
 */
export function toTimestamp(date: Temporal.PlainDate | string, clock: string): string {
  const plainDate = date instanceof Temporal.PlainDate ? date : parseDate(date);

  const zoned = plainDate.toZonedDateTime({
    timeZone: TIME_ZONE,
    plainTime: Temporal.PlainTime.from(clock),
  });

  return formatTimestamp(zoned);
}

/**
 * Format a zoned date time as RFC 3339 with offset and without the bracketed zone name.
 *
 * @param value - The zoned date time.
 * @returns The timestamp string.
 */
export function formatTimestamp(value: Temporal.ZonedDateTime): string {
  return value.toString({ timeZoneName: "never", smallestUnit: "second" });
}

/**
 * Format the clock part of a timestamp.
 *
 * @param value - A timestamp string or zoned date time.
 * @returns `HH:MM`.
 */
export function formatClock(value: string | Temporal.ZonedDateTime): string {
  const zoned = value instanceof Temporal.ZonedDateTime ? value : parseZoned(value);

  return minutesToClock(minutesOfDay(zoned));
}

/**
 * Format a time range such as `14:00–16:00`.
 *
 * @param start - Start timestamp.
 * @param end - End timestamp.
 * @returns The range label.
 */
export function formatClockRange(start: string, end: string): string {
  return `${formatClock(start)}–${formatClock(end)}`;
}

/**
 * Chinese weekday label for an ISO weekday (Monday = 1).
 *
 * @param isoWeekday - ISO weekday number 1..7.
 * @returns A label such as `周三`.
 */
export function weekdayLabel(isoWeekday: number): string {
  return WEEKDAY_LABELS[(isoWeekday - 1 + 7) % 7] ?? "";
}

/**
 * Format a date as `11月19日`.
 *
 * @param date - The date.
 * @returns The month-day label.
 */
export function formatMonthDay(date: Temporal.PlainDate | string): string {
  const plainDate = date instanceof Temporal.PlainDate ? date : parseDate(date);

  return `${plainDate.month}月${plainDate.day}日`;
}

/**
 * Format a date as `11月19日 周三`.
 *
 * @param date - The date.
 * @returns The date label.
 */
export function formatDateLabel(date: Temporal.PlainDate | string): string {
  const plainDate = date instanceof Temporal.PlainDate ? date : parseDate(date);

  return `${formatMonthDay(plainDate)} ${weekdayLabel(plainDate.dayOfWeek)}`;
}

/**
 * Format a date relative to today: `今天`, `明天`, `后天`, otherwise `11月19日 周三`.
 *
 * @param date - The date.
 * @param today - Today's date.
 * @returns The friendly label.
 */
export function formatRelativeDate(
  date: Temporal.PlainDate | string,
  today: Temporal.PlainDate = todayDate(),
): string {
  const plainDate = date instanceof Temporal.PlainDate ? date : parseDate(date);
  const days = today.until(plainDate, { largestUnit: "day" }).days;

  if (days === 0) return "今天";

  if (days === 1) return "明天";

  if (days === 2) return "后天";

  if (days === -1) return "昨天";

  return formatDateLabel(plainDate);
}

/**
 * Format a booking time for lists: `今天 14:00–16:00` or `11月19日 周三 14:00–16:00`.
 *
 * @param start - Start timestamp.
 * @param end - End timestamp.
 * @param today - Today's date.
 * @returns The label.
 */
export function formatBookingWhen(
  start: string,
  end: string,
  today: Temporal.PlainDate = todayDate(),
): string {
  return `${formatRelativeDate(parseZoned(start).toPlainDate(), today)} ${formatClockRange(start, end)}`;
}

/**
 * Human-readable Chinese duration.
 *
 * @param totalMinutes - Duration in minutes.
 * @returns A label such as `1 小时 30 分钟`.
 */
export function formatDuration(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours === 0) return `${minutes} 分钟`;

  if (minutes === 0) return `${hours} 小时`;

  return `${hours} 小时 ${minutes} 分钟`;
}

/**
 * Compact duration for buttons and chips: `30 分钟`, `1 小时`, `1.5 小时`.
 *
 * @param totalMinutes - Duration in minutes.
 * @returns The label.
 */
export function formatShortDuration(totalMinutes: number): string {
  return totalMinutes < 60 ? `${totalMinutes} 分钟` : `${Math.round((totalMinutes / 60) * 100) / 100} 小时`;
}

/**
 * Whole minutes between two timestamps.
 *
 * @param start - Start timestamp.
 * @param end - End timestamp.
 * @returns Minutes from start to end (negative if end is earlier).
 */
export function minutesBetween(
  start: string | Temporal.ZonedDateTime,
  end: string | Temporal.ZonedDateTime,
): number {
  const startZoned = start instanceof Temporal.ZonedDateTime ? start : parseZoned(start);
  const endZoned = end instanceof Temporal.ZonedDateTime ? end : parseZoned(end);

  return Math.round((endZoned.epochMilliseconds - startZoned.epochMilliseconds) / 60_000);
}

/**
 * Round minutes up to the next grid line.
 *
 * @param totalMinutes - Minutes since midnight.
 * @param step - Grid step.
 * @returns The aligned minutes.
 */
export function ceilToGrid(totalMinutes: number, step: number = GRID_MINUTES): number {
  return Math.ceil(totalMinutes / step) * step;
}

/**
 * Round minutes down to the previous grid line.
 *
 * @param totalMinutes - Minutes since midnight.
 * @param step - Grid step.
 * @returns The aligned minutes.
 */
export function floorToGrid(totalMinutes: number, step: number = GRID_MINUTES): number {
  return Math.floor(totalMinutes / step) * step;
}

/**
 * Monday of the week containing a date.
 *
 * @param date - Any date.
 * @returns The Monday.
 */
export function startOfWeek(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.subtract({ days: date.dayOfWeek - 1 });
}

/**
 * Consecutive dates.
 *
 * @param first - The first date.
 * @param count - Number of dates.
 * @returns The dates.
 */
export function dateRange(first: Temporal.PlainDate, count: number): Temporal.PlainDate[] {
  return Array.from({ length: count }, (_unused, index) => first.add({ days: index }));
}
