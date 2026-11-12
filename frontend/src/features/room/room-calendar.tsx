/**
 * Room calendar. Phones get a day view under a week strip (swipe to change day); narrow and wide
 * windows get a week view. Both share a time gutter, a now-line, tappable free gaps that open a
 * prefilled booking sheet, and booking blocks that show 用途 and the booker, with the viewer's
 * own bookings, series and blocked time told apart.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";
import * as stylex from "@stylexjs/stylex";
import { ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

import type { Booking, Room } from "../../api/client";
import { dayAgenda, isFinished, isOngoing, layoutDay, proposeSlot } from "../../lib/schedule";
import {
  GRID_MINUTES,
  clockToMinutes,
  dateRange,
  floorToGrid,
  formatClock,
  formatDateLabel,
  formatDuration,
  formatMonthDay,
  minutesOfDay,
  minutesToClock,
  parseDate,
  startOfWeek,
  weekdayLabel,
} from "../../lib/time";
import { colors, fonts, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Skeleton, Stack } from "../../ui/layout";
import { Sheet } from "../../ui/sheet";
import { useLayoutTier } from "../../ui/tier";
import { notify } from "../../ui/toast";
import { BookingDetailSheet } from "../booking/booking-detail";
import { BookingForm, type BookingDraft } from "../booking/booking-form";
import { useNow, useRoomBookings, useRoomDetail } from "./room-data";

/** Pixel height of one hour in the day view. */
const DAY_HOUR_HEIGHT = 64;

/** Pixel height of one hour in the week view. */
const WEEK_HOUR_HEIGHT = 52;

/** Space above the first hour line so its label is not clipped. */
const BODY_PADDING = 10;

const styles = stylex.create({
  toolbar: { alignItems: "center", display: "flex", gap: 6 },
  rangeLabel: {
    color: colors.text,
    flexGrow: 1,
    fontSize: fonts.sizeLg,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    paddingInline: 4,
  },
  emptyLine: {
    backgroundColor: colors.freeSoft,
    borderRadius: radii.medium,
    color: colors.freeStrong,
    fontSize: fonts.sizeSm,
    lineHeight: 1.5,
    paddingBlock: 8,
    paddingInline: 12,
  },
  strip: { display: "grid", gap: 4, gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
  stripDay: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceHover,
      '[aria-pressed="true"]': colors.primary,
    },
    borderRadius: radii.medium,
    borderWidth: 0,
    color: { default: colors.text, '[aria-pressed="true"]': colors.onPrimary },
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    gap: 2,
    minHeight: 58,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 6,
  },
  stripWeekday: { fontSize: fonts.sizeXs, fontWeight: 500 },
  stripNumber: { fontSize: fonts.sizeLg, fontVariantNumeric: "tabular-nums", fontWeight: 700 },
  stripToday: { color: { default: colors.primaryText, '[aria-pressed="true"]': colors.onPrimary } },
  stripDot: { backgroundColor: "currentColor", borderRadius: radii.pill, height: 4, opacity: 0.8, width: 4 },
  stripDotEmpty: { opacity: 0 },
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    touchAction: "pan-y",
  },
  head: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
  },
  dayHead: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: fonts.sizeXs,
    fontWeight: 600,
    gap: 2,
    paddingBlock: 8,
  },
  dayHeadToday: { color: colors.primaryText },
  dayNumber: {
    color: colors.text,
    fontSize: fonts.sizeLg,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: "28px",
    minWidth: 30,
    textAlign: "center",
  },
  dayNumberToday: { backgroundColor: colors.primary, borderRadius: radii.pill, color: colors.onPrimary },
  body: { display: "grid", paddingBottom: BODY_PADDING, paddingTop: BODY_PADDING },
  gutter: { position: "relative" },
  hourLabel: {
    color: colors.textMuted,
    fontSize: fonts.sizeXs,
    fontVariantNumeric: "tabular-nums",
    insetInlineEnd: 8,
    position: "absolute",
    translate: "0 -50%",
  },
  nowLabel: {
    backgroundColor: colors.busy,
    borderRadius: radii.pill,
    color: colors.canvas,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    insetInlineEnd: 2,
    paddingBlock: 1,
    paddingInline: 5,
    position: "absolute",
    translate: "0 -50%",
    zIndex: 4,
  },
  column: {
    borderInlineStartColor: colors.border,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    position: "relative",
  },
  line: {
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  halfLine: { borderTopStyle: "dashed", opacity: 0.6 },
  pastShade: {
    backgroundColor: colors.surfaceMuted,
    insetInline: 0,
    opacity: 0.55,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
  },
  nowLine: {
    backgroundColor: colors.busySolid,
    height: 2,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
    translate: "0 -1px",
    zIndex: 4,
  },
  nowDot: {
    backgroundColor: colors.busySolid,
    borderRadius: radii.pill,
    height: 8,
    insetInlineStart: -4,
    position: "absolute",
    top: -3,
    width: 8,
  },
  free: {
    alignItems: "flex-start",
    backgroundColor: { default: "transparent", ":hover": colors.freeSoft, ":focus-visible": colors.freeSoft },
    borderColor: { default: "transparent", ":hover": colors.free, ":focus-visible": colors.free },
    borderRadius: radii.small,
    borderStyle: "dashed",
    borderWidth: 1,
    color: colors.freeStrong,
    cursor: "pointer",
    display: "flex",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeXs,
    fontWeight: 600,
    gap: 4,
    insetInline: 2,
    outline: "none",
    padding: 0,
    paddingInline: 6,
    paddingTop: 4,
    position: "absolute",
    zIndex: 1,
  },
  freeLabel: { alignItems: "center", display: "inline-flex", gap: 3, whiteSpace: "nowrap" },
  freeLabelHoverOnly: {
    opacity: { default: 0, [stylex.when.ancestor(":hover")]: 1, [stylex.when.ancestor(":focus-visible")]: 1 },
  },
  block: {
    backgroundColor: { default: colors.surfaceMuted, ":hover": colors.surfaceHover },
    borderColor: colors.borderStrong,
    borderInlineStartWidth: 3,
    borderRadius: radii.small,
    borderStyle: "solid",
    borderWidth: 0,
    boxSizing: "border-box",
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeXs,
    gap: 1,
    insetInline: 2,
    lineHeight: 1.35,
    minHeight: 18,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    overflow: "hidden",
    paddingBlock: 3,
    paddingInline: 5,
    position: "absolute",
    textAlign: "start",
    zIndex: 2,
  },
  blockDay: { fontSize: fonts.sizeSm, insetInline: 6, paddingInline: 10 },
  blockMine: {
    backgroundColor: { default: colors.primary, ":hover": colors.primaryHover },
    borderColor: colors.primaryHover,
    color: colors.onPrimary,
  },
  blockUnavailable: {
    backgroundColor: colors.warningSoft,
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, ${colors.warningSolid} 16%, transparent) 6px 12px)`,
    borderColor: colors.warningSolid,
    color: colors.warning,
  },
  blockMinePast: {
    backgroundColor: { default: colors.primarySoft, ":hover": colors.surfaceHover },
    borderColor: colors.primary,
    color: colors.primaryText,
  },
  blockOngoing: { boxShadow: `inset 0 0 0 1.5px ${colors.busySolid}` },
  blockTitle: {
    alignItems: "center",
    display: "flex",
    fontWeight: 700,
    gap: 4,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  blockTitleText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  blockMeta: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: 400,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  legend: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: fonts.sizeXs,
    gap: 14,
    justifyContent: "center",
  },
  legendItem: { alignItems: "center", display: "inline-flex", gap: 6 },
  swatch: { borderRadius: 3, height: 10, width: 14 },
  swatchMine: { backgroundColor: colors.primary },
  swatchOther: { backgroundColor: colors.surfaceMuted, boxShadow: `inset 3px 0 0 ${colors.borderStrong}` },
  swatchBlock: { backgroundColor: colors.warningSoft, boxShadow: `inset 3px 0 0 ${colors.warningSolid}` },
  swatchFree: { borderColor: colors.free, borderStyle: "dashed", borderWidth: 1 },
  height: (height: number) => ({ height }),
  position: (top: string, height: string) => ({ height, top }),
  columns: (count: number, gutter: number) => ({
    gridTemplateColumns: `${gutter}px repeat(${count}, minmax(0, 1fr))`,
  }),
});

/** Props of {@link RoomCalendar}. */
export interface RoomCalendarProps {
  slug: string;
  anchorDate: string | undefined;
  onAnchorChange: (date: string | undefined) => void;
}

/**
 * The calendar.
 *
 * @param props - Calendar props.
 * @returns The calendar.
 */
export function RoomCalendar({ slug, anchorDate, onAnchorChange }: RoomCalendarProps) {
  const tier = useLayoutTier();
  const isDayView = tier === "mobile";
  const now = useNow(30_000);
  const today = now.toPlainDate();
  const anchor = anchorDate === undefined ? today : parseDate(anchorDate);
  const weekStart = startOfWeek(anchor);
  const week = dateRange(weekStart, 7);
  const weekEnd = week[6] ?? weekStart;
  const days = isDayView ? [anchor] : week;
  const detail = useRoomDetail(slug);
  const bookings = useRoomBookings(slug, weekStart.toString(), weekEnd.toString());
  const [selected, setSelected] = useState<Booking>();
  const [draft, setDraft] = useState<BookingDraft>();
  const swipeStart = useRef<{ x: number; y: number }>(undefined);
  const room = detail.data?.room;

  /**
   * Move the view by days.
   *
   * @param delta - Days to move (negative for earlier).
   */
  function move(delta: number): void {
    onAnchorChange(anchor.add({ days: delta }).toString());
  }

  /**
   * Remember where a touch swipe starts.
   *
   * @param event - Pointer event.
   */
  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "touch") swipeStart.current = { x: event.clientX, y: event.clientY };
  }

  /**
   * Change day (day view) or week on a horizontal swipe.
   *
   * @param event - Pointer event.
   */
  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const start = swipeStart.current;

    swipeStart.current = undefined;

    if (start === undefined) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      move((deltaX < 0 ? 1 : -1) * (isDayView ? 1 : 7));
    }
  }

  if (room === undefined) return <Skeleton height={560} />;

  const items = bookings.data ?? [];
  const openMinutes = clockToMinutes(room.rules.openTime);
  const closeMinutes = clockToMinutes(room.rules.closeTime);
  const span = Math.max(closeMinutes - openMinutes, GRID_MINUTES);
  const hourHeight = isDayView ? DAY_HOUR_HEIGHT : WEEK_HOUR_HEIGHT;
  const bodyHeight = (span / 60) * hourHeight;
  const gutter = isDayView ? 52 : 56;
  const firstLine = Math.ceil(openMinutes / 30) * 30;

  const lines = Array.from(
    { length: Math.max(0, Math.floor((closeMinutes - firstLine) / 30) + 1) },
    (_unused, index) => firstLine + index * 30,
  );

  const isTodayVisible = days.some((date) => date.equals(today));
  const nowMinutes = minutesOfDay(now);
  const isNowInside = isTodayVisible && nowMinutes > openMinutes && nowMinutes < closeMinutes;

  const visibleCount = days.reduce(
    (count, date) => count + layoutDay(items, date, room.rules.openTime, room.rules.closeTime).length,
    0,
  );

  const hasFutureDay = days.some((date) => date.until(today).days <= 0);

  const rangeLabel = isDayView
    ? `${anchor.month}月${anchor.day}日 ${weekdayLabel(anchor.dayOfWeek)}`
    : weekStart.month === weekEnd.month
      ? `${weekStart.month}月${weekStart.day}日–${weekEnd.day}日`
      : `${formatMonthDay(weekStart)}–${formatMonthDay(weekEnd)}`;

  /**
   * Open the booking sheet for a tap on free time.
   *
   * @param date - The day.
   * @param minutes - Tapped minutes since midnight.
   */
  function tapFree(date: Temporal.PlainDate, minutes: number): void {
    if (room === undefined) return;

    const slot = proposeSlot(date, minutes, items, room.rules.closeTime, now);

    if (slot === undefined) {
      notify("info", "这个时间不能预约", "已经过去或已被占用");

      return;
    }

    setDraft({
      date: date.toString(),
      start: slot.startClock,
      end: slot.endClock,
      title: "",
      isRepeat: false,
    });
  }

  return (
    <Stack gap="md">
      <div {...stylex.props(styles.toolbar)}>
        <span aria-live="polite" {...stylex.props(styles.rangeLabel)}>
          {rangeLabel}
        </span>
        <Button variant="secondary" size="sm" onClick={() => onAnchorChange(undefined)}>
          今天
        </Button>
        <Button
          variant="ghost"
          aria-label="上一周"
          onClick={() => move(-7)}
          icon={<ChevronLeft size={20} aria-hidden />}
        />
        <Button
          variant="ghost"
          aria-label="下一周"
          onClick={() => move(7)}
          icon={<ChevronRight size={20} aria-hidden />}
        />
      </div>

      {isDayView ? (
        <div role="group" aria-label="选择日期" {...stylex.props(styles.strip)}>
          {week.map((date) => {
            const count = layoutDay(items, date, room.rules.openTime, room.rules.closeTime).length;
            const isToday = date.equals(today);

            return (
              <button
                key={date.toString()}
                type="button"
                aria-pressed={date.equals(anchor)}
                aria-label={`${formatDateLabel(date)}${isToday ? "（今天）" : ""}，${count} 个预约`}
                onClick={() => onAnchorChange(date.toString())}
                {...stylex.props(styles.stripDay, isToday && styles.stripToday)}
              >
                <span {...stylex.props(styles.stripWeekday)}>
                  {isToday ? "今天" : weekdayLabel(date.dayOfWeek).replace("周", "")}
                </span>
                <span {...stylex.props(styles.stripNumber)}>{date.day}</span>
                <span aria-hidden {...stylex.props(styles.stripDot, count === 0 && styles.stripDotEmpty)} />
              </button>
            );
          })}
        </div>
      ) : null}

      {visibleCount === 0 && hasFutureDay && bookings.data !== undefined ? (
        <p {...stylex.props(styles.emptyLine)}>
          {isDayView ? "这天还没有预约" : "这周还没有预约"}，点任意空闲时间即可预约。
        </p>
      ) : null}

      <div
        role="region"
        aria-label={`${room.name} ${rangeLabel} 的预约`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeStart.current = undefined;
        }}
        {...stylex.props(styles.frame)}
      >
        {isDayView ? null : (
          <div {...stylex.props(styles.head, styles.columns(days.length, gutter))}>
            <span />
            {days.map((date) => {
              const isToday = date.equals(today);

              return (
                <span
                  key={date.toString()}
                  aria-label={formatDateLabel(date)}
                  {...stylex.props(styles.dayHead, isToday && styles.dayHeadToday)}
                >
                  {isToday ? "今天" : weekdayLabel(date.dayOfWeek)}
                  <span {...stylex.props(styles.dayNumber, isToday && styles.dayNumberToday)}>
                    {date.day}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        <div {...stylex.props(styles.body, styles.columns(days.length, gutter))}>
          <div aria-hidden {...stylex.props(styles.gutter, styles.height(bodyHeight))}>
            {lines
              .filter((minutes) => minutes % 60 === 0)
              .map((minutes) => (
                <span
                  key={minutes}
                  {...stylex.props(
                    styles.hourLabel,
                    styles.position(`${((minutes - openMinutes) / span) * 100}%`, "auto"),
                  )}
                >
                  {minutesToClock(minutes)}
                </span>
              ))}
            {isNowInside ? (
              <span
                {...stylex.props(
                  styles.nowLabel,
                  styles.position(`${((nowMinutes - openMinutes) / span) * 100}%`, "auto"),
                )}
              >
                {formatClock(now)}
              </span>
            ) : null}
          </div>
          {days.map((date) => (
            <DayColumn
              key={date.toString()}
              date={date}
              room={room}
              items={items}
              now={now}
              lines={lines}
              hourHeight={hourHeight}
              bodyHeight={bodyHeight}
              isDayView={isDayView}
              onTapFree={(minutes) => tapFree(date, minutes)}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      <div aria-hidden {...stylex.props(styles.legend)}>
        <span {...stylex.props(styles.legendItem)}>
          <span {...stylex.props(styles.swatch, styles.swatchMine)} />
          我的预约
        </span>
        <span {...stylex.props(styles.legendItem)}>
          <span {...stylex.props(styles.swatch, styles.swatchOther)} />
          他人预约
        </span>
        <span {...stylex.props(styles.legendItem)}>
          <span {...stylex.props(styles.swatch, styles.swatchBlock)} />
          不可预约
        </span>
        <span {...stylex.props(styles.legendItem)}>
          <span {...stylex.props(styles.swatch, styles.swatchFree)} />
          空闲，点按预约
        </span>
      </div>

      <BookingDetailSheet booking={selected} onClose={() => setSelected(undefined)} />
      <Sheet
        isOpen={draft !== undefined}
        onOpenChange={(open) => {
          if (!open) setDraft(undefined);
        }}
        title={draft === undefined ? "预约" : `预约 · ${formatDateLabel(draft.date)}`}
        isWide
      >
        {draft === undefined ? null : (
          <BookingForm
            key={`${draft.date}-${draft.start}`}
            room={room}
            draft={draft}
            onDone={() => setDraft(undefined)}
          />
        )}
      </Sheet>
    </Stack>
  );
}

/**
 * One day column: grid lines, past shading, free gaps, bookings and the now-line.
 *
 * @param props - Column props.
 * @param props.date - The day.
 * @param props.room - The room.
 * @param props.items - Bookings in the visible range.
 * @param props.now - Current time.
 * @param props.lines - Half-hour line positions in minutes since midnight.
 * @param props.hourHeight - Pixel height of one hour.
 * @param props.bodyHeight - Pixel height of the column.
 * @param props.isDayView - Single-day layout with roomier blocks.
 * @param props.onTapFree - Tap on free time (minutes since midnight).
 * @param props.onSelect - Open a booking.
 * @returns The column.
 */
function DayColumn({
  date,
  room,
  items,
  now,
  lines,
  hourHeight,
  bodyHeight,
  isDayView,
  onTapFree,
  onSelect,
}: {
  date: Temporal.PlainDate;
  room: Room;
  items: readonly Booking[];
  now: Temporal.ZonedDateTime;
  lines: readonly number[];
  hourHeight: number;
  bodyHeight: number;
  isDayView: boolean;
  onTapFree: (minutes: number) => void;
  onSelect: (booking: Booking) => void;
}) {
  const openMinutes = clockToMinutes(room.rules.openTime);
  const closeMinutes = clockToMinutes(room.rules.closeTime);
  const span = Math.max(closeMinutes - openMinutes, GRID_MINUTES);
  const today = now.toPlainDate();
  const isToday = date.equals(today);
  const isPastDay = date.until(today).days > 0;
  const nowMinutes = minutesOfDay(now);
  const positioned = layoutDay(items, date, room.rules.openTime, room.rules.closeTime);

  const freeGaps = isPastDay
    ? []
    : dayAgenda(items, date, room.rules.openTime, room.rules.closeTime, now).filter(
        (entry) => entry.kind === "free",
      );

  const pastRatio = isPastDay ? 1 : isToday ? Math.min(Math.max((nowMinutes - openMinutes) / span, 0), 1) : 0;

  /**
   * Percentage offset of a minute on this column.
   *
   * @param minutes - Minutes since midnight.
   * @returns CSS percentage.
   */
  const at = (minutes: number) => `${((minutes - openMinutes) / span) * 100}%`;

  /**
   * Book the grid step under the pointer inside a free gap (or the gap start from the keyboard).
   *
   * @param event - Click event.
   * @param startMinutes - Gap start.
   * @param endMinutes - Gap end.
   */
  function onFreeClick(event: MouseEvent<HTMLButtonElement>, startMinutes: number, endMinutes: number): void {
    if (event.detail === 0) {
      onTapFree(startMinutes);

      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    const minutes = floorToGrid(startMinutes + ratio * (endMinutes - startMinutes));

    onTapFree(Math.max(startMinutes, Math.min(minutes, endMinutes - GRID_MINUTES)));
  }

  return (
    <div
      role="group"
      aria-label={`${formatDateLabel(date)}，${positioned.length} 个预约`}
      {...stylex.props(styles.column, styles.height(bodyHeight))}
    >
      {pastRatio > 0 ? (
        <div aria-hidden {...stylex.props(styles.pastShade, styles.position("0", `${pastRatio * 100}%`))} />
      ) : null}
      {lines.map((minutes) =>
        minutes <= openMinutes || minutes >= closeMinutes ? null : (
          <div
            key={minutes}
            aria-hidden
            {...stylex.props(
              styles.line,
              minutes % 60 !== 0 && styles.halfLine,
              styles.position(at(minutes), "0"),
            )}
          />
        ),
      )}
      {freeGaps.map((gap) => {
        const minutesLong = gap.endMinutes - gap.startMinutes;
        const pixels = (minutesLong / 60) * hourHeight;
        const isWholeDay = positioned.length === 0 && !isToday;

        return (
          <button
            key={gap.startMinutes}
            type="button"
            aria-label={`${formatDateLabel(date)} ${minutesToClock(gap.startMinutes)}–${minutesToClock(gap.endMinutes)} 空闲，点按预约`}
            onClick={(event) => onFreeClick(event, gap.startMinutes, gap.endMinutes)}
            {...stylex.props(
              stylex.defaultMarker(),
              styles.free,
              styles.position(at(gap.startMinutes), at(openMinutes + minutesLong)),
            )}
          >
            {pixels >= 22 ? (
              <span
                {...stylex.props(styles.freeLabel, !isDayView && !isWholeDay && styles.freeLabelHoverOnly)}
              >
                <Plus size={12} aria-hidden />
                {isWholeDay ? "全天空闲" : isDayView ? `空闲 ${formatDuration(minutesLong)}` : "预约"}
              </span>
            ) : null}
          </button>
        );
      })}
      {positioned.map((entry) => (
        <BookingBlock
          key={entry.item.id}
          booking={entry.item}
          top={at(entry.startMinutes)}
          height={at(openMinutes + (entry.endMinutes - entry.startMinutes))}
          pixels={((entry.endMinutes - entry.startMinutes) / 60) * hourHeight}
          now={now}
          isDayView={isDayView}
          onSelect={onSelect}
        />
      ))}
      {isToday && nowMinutes > openMinutes && nowMinutes < closeMinutes ? (
        <div aria-hidden {...stylex.props(styles.nowLine, styles.position(at(nowMinutes), "2px"))}>
          <span {...stylex.props(styles.nowDot)} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One booking on the timeline: 用途 first, then booker and time as space allows.
 *
 * @param props - Block props.
 * @param props.booking - The booking.
 * @param props.top - CSS top.
 * @param props.height - CSS height.
 * @param props.pixels - Rendered height in pixels, to decide how many lines fit.
 * @param props.now - Current time.
 * @param props.isDayView - Roomier layout.
 * @param props.onSelect - Open the booking.
 * @returns The block.
 */
function BookingBlock({
  booking,
  top,
  height,
  pixels,
  now,
  isDayView,
  onSelect,
}: {
  booking: Booking;
  top: string;
  height: string;
  pixels: number;
  now: Temporal.ZonedDateTime;
  isDayView: boolean;
  onSelect: (booking: Booking) => void;
}) {
  const isBlock = booking.kind === "block";
  const who = isBlock ? "不可预约" : `${booking.person?.name ?? ""}${booking.isMine ? "（我）" : ""}`;
  const title = booking.title === "" ? (isBlock ? "不可预约" : "会议室预约") : booking.title;
  const time = `${formatClock(booking.start)}–${formatClock(booking.end)}`;
  const lineHeight = isDayView ? 19 : 17;
  const lineCount = Math.max(1, Math.floor((pixels - 6) / lineHeight));

  return (
    <button
      type="button"
      aria-label={`${time} ${title} · ${who}${booking.series === undefined ? "" : " · 周期预约"}`}
      onClick={() => onSelect(booking)}
      {...stylex.props(
        styles.block,
        isDayView && styles.blockDay,
        booking.isMine && !isBlock && styles.blockMine,
        isBlock && styles.blockUnavailable,
        isFinished(booking, now) && booking.isMine && !isBlock && styles.blockMinePast,
        isOngoing(booking, now) && styles.blockOngoing,
        styles.position(top, height),
      )}
    >
      <span {...stylex.props(styles.blockTitle)}>
        {booking.series === undefined ? null : <Repeat size={11} aria-hidden />}
        <span {...stylex.props(styles.blockTitleText)}>
          {title}
          {lineCount === 1 && !isBlock ? ` · ${who}` : ""}
        </span>
      </span>
      {lineCount >= 2 ? (
        <span {...stylex.props(styles.blockMeta)}>
          {lineCount >= 3 || isBlock ? who : `${who} · ${time}`}
        </span>
      ) : null}
      {lineCount >= 3 ? <span {...stylex.props(styles.blockMeta)}>{time}</span> : null}
    </button>
  );
}
