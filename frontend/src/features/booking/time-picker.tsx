/**
 * Scroll-free time picker: an hour grid whose cells show which quarters are free, quarter buttons
 * for the exact start, duration chips and a ±15 minute end stepper. The end is computed from the
 * start and duration; choices that would run into another booking, past closing time or beyond the
 * maximum duration are disabled.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Minus, Plus } from "lucide-react";
import { useId } from "react";

import type { Booking } from "../../api/client";
import { latestEnd, nextBusy, slotState, type DayAvailability, type SlotState } from "../../lib/schedule";
import {
  GRID_MINUTES,
  clockToMinutes,
  formatDuration,
  formatShortDuration,
  minutesToClock,
} from "../../lib/time";
import { colors, fonts, radii } from "../../styles/tokens.stylex";

const DURATIONS = [30, 60, 90, 120, 180, 240] as const;

const QUARTERS = [0, 15, 30, 45] as const;

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 },
  block: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  head: { alignItems: "baseline", display: "flex", gap: 8, justifyContent: "space-between" },
  label: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  summary: {
    color: colors.text,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
  },
  summaryMuted: { color: colors.textMuted, fontWeight: 500 },
  hours: {
    display: "grid",
    gap: 6,
    gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
  },
  hour: {
    alignItems: "center",
    backgroundColor: {
      default: colors.surface,
      ":hover:not(:disabled)": colors.surfaceHover,
      '[aria-pressed="true"]': colors.primarySoft,
    },
    borderColor: { default: colors.border, '[aria-pressed="true"]': colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: { default: colors.text, '[aria-pressed="true"]': colors.primaryText },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    gap: 5,
    justifyContent: "center",
    minHeight: 46,
    opacity: { default: 1, ":disabled": 0.45 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 6,
    paddingInline: 4,
  },
  bars: { display: "flex", gap: 2, width: 28 },
  bar: { borderRadius: 2, flexGrow: 1, height: 3 },
  barFree: { backgroundColor: colors.free },
  barBusy: { backgroundColor: colors.busySolid },
  barOff: { backgroundColor: colors.borderStrong },
  quarters: { display: "grid", gap: 6, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  choice: {
    alignItems: "center",
    backgroundColor: {
      default: colors.surface,
      ":hover:not(:disabled)": colors.surfaceHover,
      '[aria-pressed="true"]': colors.primary,
    },
    borderColor: { default: colors.borderStrong, '[aria-pressed="true"]': colors.primary },
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    color: { default: colors.text, '[aria-pressed="true"]': colors.onPrimary },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    justifyContent: "center",
    minHeight: 40,
    opacity: { default: 1, ":disabled": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 14,
    whiteSpace: "nowrap",
  },
  choiceTaken: {
    backgroundColor: { default: colors.busySoft, '[aria-pressed="true"]': colors.busy },
    borderColor: { default: colors.busySoft, '[aria-pressed="true"]': colors.busy },
    color: { default: colors.busy, '[aria-pressed="true"]': colors.canvas },
  },
  endRow: { alignItems: "center", display: "flex", gap: 8 },
  endValue: {
    color: colors.text,
    flexGrow: 1,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
  },
  stepper: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover:not(:disabled)": colors.surfaceHover },
    borderColor: colors.borderStrong,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    height: 40,
    justifyContent: "center",
    opacity: { default: 1, ":disabled": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: 44,
  },
  hint: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.5 },
  legend: { alignItems: "center", color: colors.textMuted, display: "flex", fontSize: fonts.sizeXs, gap: 12 },
  legendItem: { alignItems: "center", display: "inline-flex", gap: 5 },
  legendSwatch: { borderRadius: 2, height: 3, width: 12 },
});

const BAR_STYLES: Record<SlotState, stylex.StyleXStyles> = {
  free: styles.barFree,
  busy: styles.barBusy,
  past: styles.barOff,
  closed: styles.barOff,
};

/** Props of {@link TimePicker}. */
export interface TimePickerProps {
  availability: DayAvailability<Booking>;
  start: string;
  end: string;
  maxDurationMinutes: number;
  onChange: (start: string, end: string) => void;
}

/**
 * Start / duration picker for one day.
 *
 * @param props - Picker props.
 * @returns The picker.
 */
export function TimePicker({ availability, start, end, maxDurationMinutes, onChange }: TimePickerProps) {
  const ids = useId();
  const startMinutes = clockToMinutes(start);
  const endMinutes = clockToMinutes(end);
  const duration = endMinutes - startMinutes;
  const firstHour = Math.floor(availability.openMinutes / 60);
  const lastHour = Math.ceil(availability.closeMinutes / 60) - 1;

  const hours = Array.from(
    { length: Math.max(lastHour - firstHour + 1, 0) },
    (_unused, index) => firstHour + index,
  );

  const selectedHour = Math.floor(startMinutes / 60);
  const latest = latestEnd(availability, startMinutes, maxDurationMinutes);
  const cap = Math.min(availability.closeMinutes, startMinutes + maxDurationMinutes);
  const blocker = latest < cap ? nextBusy(availability, startMinutes) : undefined;

  /**
   * Move the start, keeping the duration where it still fits.
   *
   * @param nextStart - New start minutes.
   */
  function chooseStart(nextStart: number): void {
    const fit = latestEnd(availability, nextStart, maxDurationMinutes);
    const keep = Math.max(duration, GRID_MINUTES);
    const nextEnd = Math.max(Math.min(nextStart + keep, fit), nextStart + GRID_MINUTES);

    onChange(minutesToClock(nextStart), minutesToClock(nextEnd));
  }

  /**
   * Pick an hour: keep the current quarter when it is free there, otherwise take the first free one.
   *
   * @param hour - The hour.
   */
  function chooseHour(hour: number): void {
    const sameQuarter = hour * 60 + (startMinutes % 60);

    if (slotState(availability, sameQuarter) === "free") {
      chooseStart(sameQuarter);

      return;
    }

    const firstFree = QUARTERS.map((quarter) => hour * 60 + quarter).find(
      (minutes) => slotState(availability, minutes) === "free",
    );

    chooseStart(firstFree ?? hour * 60);
  }

  const durations = DURATIONS.filter(
    (minutes) => minutes <= maxDurationMinutes && startMinutes + minutes <= availability.closeMinutes,
  );

  const blockerName =
    blocker === undefined
      ? ""
      : blocker.item.kind === "block"
        ? "不可预约时段"
        : `${blocker.item.person?.name ?? "其他人"}的预约`;

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.block)}>
        <div {...stylex.props(styles.head)}>
          <span id={`${ids}-start`} {...stylex.props(styles.label)}>
            开始时间
          </span>
          <span aria-live="polite" {...stylex.props(styles.summary)}>
            {start}–{end}
            <span {...stylex.props(styles.summaryMuted)}>
              {duration > 0 ? ` · ${formatDuration(duration)}` : ""}
            </span>
          </span>
        </div>
        <div role="group" aria-labelledby={`${ids}-start`} {...stylex.props(styles.hours)}>
          {hours.map((hour) => {
            const states = QUARTERS.map((quarter) => slotState(availability, hour * 60 + quarter));
            const freeCount = states.filter((state) => state === "free").length;
            const isSelected = hour === selectedHour;

            return (
              <button
                key={hour}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${hour} 点，${freeCount === 0 ? "不可选" : `${freeCount} 个可选时段`}`}
                disabled={freeCount === 0 && !isSelected}
                onClick={() => chooseHour(hour)}
                {...stylex.props(styles.hour)}
              >
                {String(hour).padStart(2, "0")}:00
                <span aria-hidden {...stylex.props(styles.bars)}>
                  {states.map((state, index) => (
                    <span key={QUARTERS[index]} {...stylex.props(styles.bar, BAR_STYLES[state])} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="精确到 15 分钟" {...stylex.props(styles.quarters)}>
          {QUARTERS.map((quarter) => {
            const minutes = selectedHour * 60 + quarter;
            const state = slotState(availability, minutes);
            const isSelected = minutes === startMinutes;

            return (
              <button
                key={quarter}
                type="button"
                aria-pressed={isSelected}
                aria-label={`从 ${minutesToClock(minutes)} 开始${state === "busy" ? "（已被预约）" : ""}`}
                disabled={state !== "free" && !isSelected}
                onClick={() => chooseStart(minutes)}
                {...stylex.props(styles.choice, state === "busy" && styles.choiceTaken)}
              >
                {minutesToClock(minutes)}
              </button>
            );
          })}
        </div>
        <div aria-hidden {...stylex.props(styles.legend)}>
          <span {...stylex.props(styles.legendItem)}>
            <span {...stylex.props(styles.legendSwatch, styles.barFree)} />
            空闲
          </span>
          <span {...stylex.props(styles.legendItem)}>
            <span {...stylex.props(styles.legendSwatch, styles.barBusy)} />
            已预约
          </span>
          <span {...stylex.props(styles.legendItem)}>
            <span {...stylex.props(styles.legendSwatch, styles.barOff)} />
            已过去
          </span>
        </div>
      </div>

      <div {...stylex.props(styles.block)}>
        <span id={`${ids}-duration`} {...stylex.props(styles.label)}>
          时长
        </span>
        <div role="group" aria-labelledby={`${ids}-duration`} {...stylex.props(styles.chips)}>
          {durations.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={duration === minutes}
              disabled={startMinutes + minutes > latest && duration !== minutes}
              onClick={() => onChange(start, minutesToClock(startMinutes + minutes))}
              {...stylex.props(
                styles.choice,
                startMinutes + minutes > latest && latest > startMinutes && styles.choiceTaken,
              )}
            >
              {formatShortDuration(minutes)}
            </button>
          ))}
        </div>
        <div {...stylex.props(styles.endRow)}>
          <span {...stylex.props(styles.endValue)}>
            结束于 <strong>{end}</strong>
          </span>
          <button
            type="button"
            aria-label="提前 15 分钟结束"
            disabled={endMinutes - GRID_MINUTES <= startMinutes}
            onClick={() => onChange(start, minutesToClock(endMinutes - GRID_MINUTES))}
            {...stylex.props(styles.stepper)}
          >
            <Minus size={18} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="延后 15 分钟结束"
            disabled={endMinutes + GRID_MINUTES > latest}
            onClick={() => onChange(start, minutesToClock(endMinutes + GRID_MINUTES))}
            {...stylex.props(styles.stepper)}
          >
            <Plus size={18} aria-hidden />
          </button>
        </div>
        {blocker === undefined ? null : (
          <p {...stylex.props(styles.hint)}>
            {latest <= startMinutes
              ? `这个开始时间已是${blockerName}，请换一个时间`
              : `${minutesToClock(blocker.startMinutes)} 起是${blockerName}，最晚可约到 ${minutesToClock(latest)}`}
          </p>
        )}
      </div>
    </div>
  );
}
