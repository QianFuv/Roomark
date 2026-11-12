/**
 * Room calendar: 3-day view on phones (swipe to page), week view from 768 px. Tapping free space
 * opens a prefilled booking sheet; tapping a booking opens its details.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type PointerEvent } from "react";

import type { Booking, Room } from "../../api/client";
import { layoutDay, minutesAtRatio, proposeSlot } from "../../lib/schedule";
import {
  clockToMinutes,
  dateRange,
  formatClock,
  formatDateLabel,
  formatMonthDay,
  minutesOfDay,
  parseDate,
  startOfWeek,
  weekdayLabel,
} from "../../lib/time";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Skeleton, Stack } from "../../ui/layout";
import { Sheet } from "../../ui/sheet";
import { notify } from "../../ui/toast";
import { BookingDetailSheet, bookingHeading } from "../booking/booking-detail";
import { BookingForm, type BookingDraft } from "../booking/booking-form";
import { useNow, useRoomBookings, useRoomDetail } from "./room-data";

/** Pixel height of one hour row. */
const HOUR_HEIGHT = 56;

const WIDE_QUERY = "(min-width: 768px)";

const styles = stylex.create({
  toolbar: { alignItems: "center", display: "flex", gap: 8 },
  rangeLabel: {
    flexGrow: 1,
    fontSize: fonts.sizeLg,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    textAlign: "center",
  },
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
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "grid",
    position: "sticky",
    top: 0,
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
  },
  dayNumberToday: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    color: colors.onPrimary,
    minWidth: 32,
    paddingInline: 6,
    textAlign: "center",
  },
  body: { display: "grid", position: "relative" },
  axis: { position: "relative" },
  hourLabel: {
    color: colors.textSubtle,
    fontSize: fonts.sizeXs,
    fontVariantNumeric: "tabular-nums",
    insetInlineEnd: 6,
    position: "absolute",
    translate: "0 -50%",
  },
  column: {
    borderInlineStartColor: colors.border,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    cursor: "copy",
    position: "relative",
  },
  hourLine: {
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
  },
  halfLine: { borderTopStyle: "dashed", opacity: 0.5 },
  pastShade: {
    backgroundColor: colors.canvas,
    insetInline: 0,
    opacity: 0.65,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
  },
  nowLine: {
    backgroundColor: colors.busy,
    height: 2,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
    zIndex: 3,
  },
  block: {
    backgroundColor: { default: colors.surfaceMuted, ":hover": colors.surfaceHover },
    borderColor: colors.borderStrong,
    borderInlineStartColor: colors.textMuted,
    borderInlineStartWidth: 3,
    borderRadius: radii.small,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeXs,
    gap: 1,
    insetInline: 3,
    lineHeight: 1.3,
    minHeight: 20,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    overflow: "hidden",
    paddingBlock: 3,
    paddingInline: 5,
    position: "absolute",
    textAlign: "start",
    zIndex: 2,
  },
  blockMine: {
    backgroundColor: { default: colors.primarySoft, ":hover": colors.primarySoft },
    borderColor: colors.primary,
    borderInlineStartColor: colors.primary,
  },
  blockUnavailable: {
    backgroundColor: colors.warningSoft,
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, ${colors.warning} 14%, transparent) 6px 12px)`,
    borderColor: colors.warning,
    borderInlineStartColor: colors.warning,
  },
  blockName: {
    alignItems: "center",
    display: "flex",
    fontWeight: 700,
    gap: 3,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  blockMeta: { color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  blockTime: { color: colors.textMuted, fontVariantNumeric: "tabular-nums" },
  hint: { color: colors.textMuted, fontSize: fonts.sizeSm, textAlign: "center" },
  wideOnly: { display: { default: "none", [media.tablet]: "inline" } },
  size: (height: number) => ({ height }),
  position: (top: string, height: string) => ({ height, top }),
  columns: (count: number) => ({ gridTemplateColumns: `44px repeat(${count}, minmax(0, 1fr))` }),
});

/**
 * Subscribe to a media query.
 *
 * @param query - Media query text.
 * @returns Whether it matches.
 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);

      list.addEventListener("change", onChange);

      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Props of {@link RoomCalendar}. */
export interface RoomCalendarProps {
  slug: string;
  anchorDate: string | undefined;
}

/**
 * The calendar page body.
 *
 * @param props - Calendar props.
 * @returns The calendar.
 */
export function RoomCalendar({ slug, anchorDate }: RoomCalendarProps) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const now = useNow(30_000);
  const today = now.toPlainDate();
  const navigate = useNavigate();
  const anchor = anchorDate === undefined ? today : parseDate(anchorDate);
  const first = isWide ? startOfWeek(anchor) : anchor;
  const days = dateRange(first, isWide ? 7 : 3);
  const last = days[days.length - 1] ?? first;
  const detail = useRoomDetail(slug);
  const bookings = useRoomBookings(slug, first.toString(), last.toString());
  const [selected, setSelected] = useState<Booking>();
  const [draft, setDraft] = useState<BookingDraft>();
  const swipeStart = useRef<{ x: number; y: number }>(undefined);
  const room = detail.data?.room;

  /**
   * Move the view by a number of pages.
   *
   * @param pages - Negative for earlier.
   */
  function page(pages: number): void {
    const step = isWide ? 7 : 3;

    void navigate({
      to: "/r/$slug/calendar",
      params: { slug },
      search: { date: first.add({ days: pages * step }).toString() },
      replace: true,
    });
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
   * Page on a horizontal swipe.
   *
   * @param event - Pointer event.
   */
  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    const start = swipeStart.current;

    swipeStart.current = undefined;

    if (start === undefined) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) page(deltaX < 0 ? 1 : -1);
  }

  if (room === undefined) return <Skeleton height={520} />;

  const openMinutes = clockToMinutes(room.rules.openTime);
  const closeMinutes = clockToMinutes(room.rules.closeTime);
  const hours = (closeMinutes - openMinutes) / 60;
  const bodyHeight = Math.max(hours, 1) * HOUR_HEIGHT;
  const items = bookings.data ?? [];

  const rangeLabel =
    first.month === last.month
      ? `${first.month}月${first.day}日–${last.day}日`
      : `${formatMonthDay(first)}–${formatMonthDay(last)}`;

  /**
   * Open the booking sheet for a tap on a day column.
   *
   * @param date - The day.
   * @param ratio - Vertical tap position (0..1).
   */
  function tapDay(date: Temporal.PlainDate, ratio: number): void {
    if (room === undefined) return;

    const minutes = minutesAtRatio(ratio, room.rules.openTime, room.rules.closeTime);
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
        <Button
          variant="ghost"
          aria-label={isWide ? "上一周" : "前三天"}
          onClick={() => page(-1)}
          icon={<ChevronLeft size={20} aria-hidden />}
        />
        <span aria-live="polite" {...stylex.props(styles.rangeLabel)}>
          {rangeLabel}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void navigate({ to: "/r/$slug/calendar", params: { slug }, search: {}, replace: true })
          }
        >
          今天
        </Button>
        <Button
          variant="ghost"
          aria-label={isWide ? "下一周" : "后三天"}
          onClick={() => page(1)}
          icon={<ChevronRight size={20} aria-hidden />}
        />
      </div>
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
        <div {...stylex.props(styles.head, styles.columns(days.length))}>
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
                <span {...stylex.props(styles.dayNumber, isToday && styles.dayNumberToday)}>{date.day}</span>
              </span>
            );
          })}
        </div>
        <div {...stylex.props(styles.body, styles.columns(days.length), styles.size(bodyHeight))}>
          <div aria-hidden {...stylex.props(styles.axis)}>
            {Array.from({ length: Math.floor(hours) + 1 }, (_unused, index) => (
              <span
                key={index}
                {...stylex.props(styles.hourLabel, styles.position(`${index * HOUR_HEIGHT}px`, "auto"))}
              >
                {index === 0 || index >= hours ? "" : `${Math.floor(openMinutes / 60) + index}:00`}
              </span>
            ))}
          </div>
          {days.map((date) => (
            <DayColumn
              key={date.toString()}
              date={date}
              room={room}
              items={items}
              now={now}
              hours={hours}
              onTap={(ratio) => tapDay(date, ratio)}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.hint)}>
        点空白处预约
        <span {...stylex.props(styles.wideOnly)}>，点预约查看详情</span>
        {isWide ? "" : "，左右滑动翻页"}
      </p>
      <BookingDetailSheet booking={selected} onClose={() => setSelected(undefined)} />
      <Sheet
        isOpen={draft !== undefined}
        onOpenChange={(open) => {
          if (!open) setDraft(undefined);
        }}
        title={draft === undefined ? "预约" : `预约 · ${formatDateLabel(draft.date)}`}
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
 * One day column with its bookings.
 *
 * @param props - Column props.
 * @param props.date - The day.
 * @param props.room - The room.
 * @param props.items - Bookings in the visible range.
 * @param props.now - Current time.
 * @param props.hours - Visible hours.
 * @param props.onTap - Tap on free space (ratio 0..1).
 * @param props.onSelect - Open a booking.
 * @returns The column.
 */
function DayColumn({
  date,
  room,
  items,
  now,
  hours,
  onTap,
  onSelect,
}: {
  date: Temporal.PlainDate;
  room: Room;
  items: readonly Booking[];
  now: Temporal.ZonedDateTime;
  hours: number;
  onTap: (ratio: number) => void;
  onSelect: (booking: Booking) => void;
}) {
  const positioned = layoutDay(items, date, room.rules.openTime, room.rules.closeTime);
  const openMinutes = clockToMinutes(room.rules.openTime);
  const span = clockToMinutes(room.rules.closeTime) - openMinutes;
  const isToday = date.equals(now.toPlainDate());
  const isPastDay = date.until(now.toPlainDate()).days > 0;
  const nowRatio = isToday ? Math.min(Math.max((minutesOfDay(now) - openMinutes) / span, 0), 1) : 0;
  const pastRatio = isPastDay ? 1 : nowRatio;

  return (
    <div
      role="group"
      aria-label={`${formatDateLabel(date)}，${positioned.length} 个预约`}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;

        const rect = event.currentTarget.getBoundingClientRect();

        onTap((event.clientY - rect.top) / rect.height);
      }}
      {...stylex.props(styles.column)}
    >
      {pastRatio > 0 ? (
        <div aria-hidden {...stylex.props(styles.pastShade, styles.position("0", `${pastRatio * 100}%`))} />
      ) : null}
      {Array.from({ length: Math.floor(hours) * 2 }, (_unused, index) =>
        index === 0 ? null : (
          <div
            key={index}
            aria-hidden
            {...stylex.props(
              styles.hourLine,
              index % 2 === 1 && styles.halfLine,
              styles.position(`${(index / (hours * 2)) * 100}%`, "0"),
            )}
          />
        ),
      )}
      {isToday && nowRatio > 0 && nowRatio < 1 ? (
        <div aria-hidden {...stylex.props(styles.nowLine, styles.position(`${nowRatio * 100}%`, "2px"))} />
      ) : null}
      {positioned.map((entry) => {
        const booking = entry.item;
        const who = booking.kind === "block" ? bookingHeading(booking) : (booking.person?.name ?? "");

        return (
          <button
            key={booking.id}
            type="button"
            aria-label={`${formatClock(booking.start)}–${formatClock(booking.end)} ${who}${booking.title === "" || booking.kind === "block" ? "" : ` · ${booking.title}`}${booking.series === undefined ? "" : " · 周期预约"}`}
            onClick={() => onSelect(booking)}
            {...stylex.props(
              styles.block,
              booking.isMine && styles.blockMine,
              booking.kind === "block" && styles.blockUnavailable,
              styles.position(`${entry.topPercent}%`, `${entry.heightPercent}%`),
            )}
          >
            <span {...stylex.props(styles.blockName)}>
              {booking.series === undefined ? null : <Repeat size={11} aria-hidden />}
              {who}
            </span>
            {entry.endMinutes - entry.startMinutes >= 45 ? (
              <span {...stylex.props(styles.blockTime)}>
                {formatClock(booking.start)}–{formatClock(booking.end)}
              </span>
            ) : null}
            {booking.title === "" ||
            booking.kind === "block" ||
            entry.endMinutes - entry.startMinutes < 60 ? null : (
              <span {...stylex.props(styles.blockMeta)}>{booking.title}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
