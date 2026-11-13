/**
 * Scroll-free time picker in four short rows: the chosen range with a ±15 minute end stepper, an
 * hour grid whose cells show which quarters are free, the quarter of the start, and the duration
 * chips (wrapping when a chip label would not fit). Choices that would run into another booking, past closing time or beyond the
 * maximum duration are disabled.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Minus, Plus } from "lucide-react";
import { useId } from "react";

import type { Booking } from "../../api/client";
import { latestEnd, nextBusy, slotState, type DayAvailability, type SlotState } from "../../lib/schedule";
import { GRID_MINUTES, clockToMinutes, formatDuration, minutesToClock } from "../../lib/time";
import { colors, fonts, fontWeights, radii, sizes, space } from "../../styles/tokens.stylex";
import { HelpHint } from "../../ui/help-hint";
import { text } from "../../ui/typography";

const DURATIONS = [30, 60, 90, 120, 180, 240] as const;

const QUARTERS = [0, 15, 30, 45] as const;

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  head: { alignItems: "center", display: "flex", gap: space.xs, minHeight: sizes.control },
  label: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    gap: space.xs,
  },
  summary: {
    color: colors.text,
    flexGrow: 1,
    minWidth: 0,
    textAlign: "end",
  },
  summaryMuted: { color: colors.textMuted, fontWeight: fontWeights.regular },
  hours: {
    display: "grid",
    gap: space.sm,
    gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))",
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
    gap: space.xs,
    justifyContent: "center",
    minHeight: sizes.control,
    opacity: { default: 1, ":disabled": 0.45 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: space.xs,
    paddingInline: space.xxs,
  },
  bars: { display: "flex", gap: space.xxs, width: 24 },
  bar: { borderRadius: 2, flexGrow: 1, height: 3 },
  barFree: { backgroundColor: colors.free },
  barBusy: { backgroundColor: colors.busySolid },
  barOff: { backgroundColor: colors.borderStrong },
  quarters: { display: "grid", gap: space.sm, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
  chips: {
    display: "grid",
    gap: space.sm,
    gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
  },
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
    justifyContent: "center",
    minHeight: sizes.control,
    minWidth: 0,
    opacity: { default: 1, ":disabled": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.xxs,
    whiteSpace: "nowrap",
  },
  choiceTaken: {
    backgroundColor: { default: colors.busySoft, '[aria-pressed="true"]': colors.busy },
    borderColor: { default: colors.busySoft, '[aria-pressed="true"]': colors.busy },
    color: { default: colors.busy, '[aria-pressed="true"]': colors.canvas },
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
    flexShrink: 0,
    height: sizes.control,
    justifyContent: "center",
    opacity: { default: 1, ":disabled": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: sizes.control,
  },
  hint: { color: colors.warning },
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
        ? "不可预约"
        : `${blocker.item.person?.name ?? "别人"}已约`;

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(text.label, styles.label)}>
          <span id={`${ids}-start`}>时间</span>
          <HelpHint topic="时间格子">
            每个整点下的四段小条代表四个一刻钟：蓝色可约，红色已被预约，灰色已过去。
          </HelpHint>
        </span>
        <span aria-live="polite" {...stylex.props(text.label, styles.summary)}>
          {start}–{end}
          <span {...stylex.props(styles.summaryMuted)}>
            {duration > 0 ? ` · ${formatDuration(duration)}` : ""}
          </span>
        </span>
        <button
          type="button"
          aria-label="结束时间提前 15 分钟"
          disabled={endMinutes - GRID_MINUTES <= startMinutes}
          onClick={() => onChange(start, minutesToClock(endMinutes - GRID_MINUTES))}
          {...stylex.props(styles.stepper)}
        >
          <Minus aria-hidden />
        </button>
        <button
          type="button"
          aria-label="结束时间推后 15 分钟"
          disabled={endMinutes + GRID_MINUTES > latest}
          onClick={() => onChange(start, minutesToClock(endMinutes + GRID_MINUTES))}
          {...stylex.props(styles.stepper)}
        >
          <Plus aria-hidden />
        </button>
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
              aria-label={`${hour} 点，${freeCount === 0 ? "约满了" : `${freeCount} 个一刻钟可约`}`}
              disabled={freeCount === 0 && !isSelected}
              onClick={() => chooseHour(hour)}
              {...stylex.props(text.label, styles.hour)}
            >
              {String(hour).padStart(2, "0")}
              <span aria-hidden {...stylex.props(styles.bars)}>
                {states.map((state, index) => (
                  <span key={QUARTERS[index]} {...stylex.props(styles.bar, BAR_STYLES[state])} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div role="group" aria-label="开始的一刻钟" {...stylex.props(styles.quarters)}>
        {QUARTERS.map((quarter) => {
          const minutes = selectedHour * 60 + quarter;
          const state = slotState(availability, minutes);
          const isSelected = minutes === startMinutes;

          return (
            <button
              key={quarter}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${minutesToClock(minutes)} 开始${state === "busy" ? "（已被预约）" : ""}`}
              disabled={state !== "free" && !isSelected}
              onClick={() => chooseStart(minutes)}
              {...stylex.props(text.label, styles.choice, state === "busy" && styles.choiceTaken)}
            >
              {minutesToClock(minutes)}
            </button>
          );
        })}
      </div>
      <div role="group" aria-label="时长" {...stylex.props(styles.chips)}>
        {durations.map((minutes) => (
          <button
            key={minutes}
            type="button"
            aria-pressed={duration === minutes}
            aria-label={formatDuration(minutes)}
            disabled={startMinutes + minutes > latest && duration !== minutes}
            onClick={() => onChange(start, minutesToClock(startMinutes + minutes))}
            {...stylex.props(
              text.label,
              styles.choice,
              startMinutes + minutes > latest && latest > startMinutes && styles.choiceTaken,
            )}
          >
            {formatChipDuration(minutes)}
          </button>
        ))}
      </div>
      {blocker === undefined ? null : (
        <p {...stylex.props(text.meta, styles.hint)}>
          {latest <= startMinutes
            ? `这个时间${blockerName}，换个开始时间`
            : `${minutesToClock(blocker.startMinutes)} 起${blockerName}，最晚约到 ${minutesToClock(latest)}`}
        </p>
      )}
    </div>
  );
}

/**
 * Short duration for a narrow chip: `30分`, `1小时`, `1.5小时`.
 *
 * @param minutes - Duration.
 * @returns The label.
 */
function formatChipDuration(minutes: number): string {
  return minutes < 60 ? `${minutes}分` : `${Math.round((minutes / 60) * 10) / 10}小时`;
}
