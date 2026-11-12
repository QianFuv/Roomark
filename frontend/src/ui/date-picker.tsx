/**
 * Scroll-free date picker: 今天 / 明天 shortcuts plus a month grid. In a compact container the grid
 * opens in a popover from a button that shows the chosen date; in a container at least 640 px
 * wide the grid is shown inline. With `isPopoverOnly` it is a form field: a field-style button
 * that opens the grid, used for filters and range ends. Days outside `[min, max]` are disabled.
 *
 * @module
 */
import { Popover } from "@animate-ui/react/primitives/base-ui/popover";
import { Radio } from "@animate-ui/react/primitives/base-ui/radio";
import { RadioGroup } from "@animate-ui/react/primitives/base-ui/radio-group";
import { Temporal } from "@js-temporal/polyfill";
import * as stylex from "@stylexjs/stylex";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState } from "react";

import { isString } from "../lib/guards";
import { formatDateLabel, formatRelativeDate, parseDate } from "../lib/time";
import { useOverlayHistory } from "../app/overlay-history";
import { colors, fonts, media, radii, sizes, space } from "../styles/tokens.stylex";
import { text } from "./typography";

const WEEKDAY_HEADS = ["一", "二", "三", "四", "五", "六", "日"] as const;

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  labelRow: { alignItems: "baseline", display: "flex", gap: space.sm, justifyContent: "space-between" },
  label: { color: colors.text },
  chosen: { color: colors.textMuted },
  quickRow: { display: "flex", flexWrap: "wrap", gap: space.controlGap },
  chip: {
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
    gap: space.sm,
    justifyContent: "center",
    minHeight: sizes.control,
    opacity: { default: 1, ":disabled": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.lg,
    whiteSpace: "nowrap",
  },
  trigger: {
    display: { default: "inline-flex", [media.formTwoColumn]: "none" },
    flexGrow: 1,
    justifyContent: "space-between",
  },
  triggerChevron: { color: "inherit", opacity: 0.7 },
  fieldTrigger: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover:not(:disabled)": colors.surfaceHover },
    borderColor: { default: colors.borderStrong, "[data-popup-open]": colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontFamily: fonts.sans,
    gap: space.sm,
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.md,
    textAlign: "start",
    width: "100%",
    containerType: "inline-size",
  },
  fieldIcon: { color: colors.textSubtle, display: "inline-flex", flexShrink: 0 },
  fieldValue: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fieldRelative: { display: { default: "none", "@container (min-width: 230px)": "inline" } },
  fieldPlaceholder: { color: colors.textMuted },
  inline: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    display: { default: "none", [media.formTwoColumn]: "block" },
    padding: space.md,
  },
  positioner: { outline: "none", zIndex: 90 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 16px 40px ${colors.shadowStrong}`,
    color: colors.text,
    fontFamily: fonts.sans,
    outline: "none",
    padding: space.md,
    width: `min(320px, calc(100vw - ${space.xl}))`,
  },
  monthHead: { alignItems: "center", display: "flex", gap: space.xs, marginBottom: space.sm },
  monthTitle: {
    color: colors.text,
    flexGrow: 1,
    paddingInlineStart: space.sm,
  },
  navButton: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover:not(:disabled)": colors.surfaceHover },
    borderRadius: radii.medium,
    borderWidth: 0,
    color: colors.text,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    height: sizes.controlSmall,
    justifyContent: "center",
    opacity: { default: 1, ":disabled": 0.3 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: sizes.controlSmall,
  },
  grid: { display: "grid", gap: space.xxs, gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
  weekday: {
    color: colors.textMuted,
    paddingBlock: space.xs,
    textAlign: "center",
  },
  day: {
    alignItems: "center",
    aspectRatio: "1",
    backgroundColor: {
      default: "transparent",
      ":hover:not([data-disabled])": colors.surfaceHover,
      "[data-checked]": colors.primary,
    },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: { default: colors.text, "[data-checked]": colors.onPrimary, "[data-disabled]": colors.textMuted },
    cursor: { default: "pointer", "[data-disabled]": "default" },
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    justifyContent: "center",
    maxHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
    position: "relative",
  },
  dayToday: { color: { default: colors.primaryText, "[data-checked]": colors.onPrimary } },
  todayDot: {
    backgroundColor: "currentColor",
    borderRadius: radii.pill,
    bottom: 5,
    height: 4,
    position: "absolute",
    width: 4,
  },
});

/** Props of {@link DatePicker}. */
export interface DatePickerProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  min: Temporal.PlainDate;
  max: Temporal.PlainDate;
  today: Temporal.PlainDate;
  hasShortcuts?: boolean;
  isPopoverOnly?: boolean;
}

/**
 * Whether a date lies within an inclusive range.
 *
 * @param date - The date.
 * @param min - First allowed date.
 * @param max - Last allowed date.
 * @returns `true` when allowed.
 */
function isInRange(date: Temporal.PlainDate, min: Temporal.PlainDate, max: Temporal.PlainDate): boolean {
  return Temporal.PlainDate.compare(date, min) >= 0 && Temporal.PlainDate.compare(date, max) <= 0;
}

/**
 * Date picker with shortcuts and a month grid.
 *
 * @param props - Picker props.
 * @returns The picker.
 */
export function DatePicker({
  label,
  value,
  onValueChange,
  min,
  max,
  today,
  hasShortcuts = true,
  isPopoverOnly = false,
}: DatePickerProps) {
  const labelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  useOverlayHistory(isOpen, () => setIsOpen(false));
  const selected = value === "" ? undefined : parseDate(value);
  const tomorrow = today.add({ days: 1 });
  const chosenLabel = selected === undefined ? "选择日期" : formatDateLabel(selected);

  const relative =
    selected === undefined || formatRelativeDate(selected, today) === formatDateLabel(selected)
      ? undefined
      : formatRelativeDate(selected, today);

  const shortcuts = hasShortcuts
    ? [
        { date: today, text: "今天" },
        { date: tomorrow, text: "明天" },
      ]
    : [];

  return (
    <div role="group" aria-labelledby={labelId} {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.labelRow)}>
        <span id={labelId} {...stylex.props(text.label, styles.label)}>
          {label}
        </span>
        {isPopoverOnly ? null : (
          <span aria-live="polite" {...stylex.props(text.meta, styles.chosen)}>
            {chosenLabel}
            {relative === undefined ? "" : ` · ${relative}`}
          </span>
        )}
      </div>
      <div {...stylex.props(styles.quickRow)}>
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.text}
            type="button"
            aria-pressed={selected?.equals(shortcut.date) === true}
            disabled={!isInRange(shortcut.date, min, max)}
            onClick={() => onValueChange(shortcut.date.toString())}
            {...stylex.props(text.label, styles.chip)}
          >
            {shortcut.text}
          </button>
        ))}
        <Popover.Root open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
          {isPopoverOnly ? (
            <Popover.Trigger
              aria-label={`${label}：${chosenLabel}，打开日历`}
              {...stylex.props(text.body, styles.fieldTrigger)}
            >
              <span aria-hidden {...stylex.props(styles.fieldIcon)}>
                <CalendarDays />
              </span>
              <span {...stylex.props(styles.fieldValue, selected === undefined && styles.fieldPlaceholder)}>
                {chosenLabel}
                {relative === undefined ? null : (
                  <span {...stylex.props(styles.fieldRelative)}> · {relative}</span>
                )}
              </span>
              <span aria-hidden {...stylex.props(styles.fieldIcon)}>
                <ChevronDown />
              </span>
            </Popover.Trigger>
          ) : (
            <Popover.Trigger
              aria-label={`${label}：${chosenLabel}，打开日历`}
              {...stylex.props(text.label, styles.chip, styles.trigger)}
            >
              <CalendarDays aria-hidden />
              {chosenLabel}
              <ChevronDown aria-hidden {...stylex.props(styles.triggerChevron)} />
            </Popover.Trigger>
          )}
          <Popover.Portal>
            <Popover.Positioner sideOffset={6} align="start" {...stylex.props(styles.positioner)}>
              <Popover.Popup aria-label={`${label}日历`} {...stylex.props(styles.popup)}>
                <MonthGrid
                  label={label}
                  value={selected}
                  min={min}
                  max={max}
                  today={today}
                  onSelect={(date) => {
                    onValueChange(date.toString());
                    setIsOpen(false);
                  }}
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {isPopoverOnly ? null : (
        <div {...stylex.props(styles.inline)}>
          <MonthGrid
            label={label}
            value={selected}
            min={min}
            max={max}
            today={today}
            onSelect={(date) => onValueChange(date.toString())}
          />
        </div>
      )}
    </div>
  );
}

/**
 * One month of selectable days with previous / next month buttons.
 *
 * @param props - Grid props.
 * @param props.label - Accessible group name.
 * @param props.value - Selected date.
 * @param props.min - First allowed date.
 * @param props.max - Last allowed date.
 * @param props.today - Today.
 * @param props.onSelect - Called with the chosen date.
 * @returns The grid.
 */
function MonthGrid({
  label,
  value,
  min,
  max,
  today,
  onSelect,
}: {
  label: string;
  value: Temporal.PlainDate | undefined;
  min: Temporal.PlainDate;
  max: Temporal.PlainDate;
  today: Temporal.PlainDate;
  onSelect: (date: Temporal.PlainDate) => void;
}) {
  const initial = (value ?? (isInRange(today, min, max) ? today : min)).toPlainYearMonth();
  const [month, setMonth] = useState(initial);
  const [shownValue, setShownValue] = useState(value?.toString());

  if (value?.toString() !== shownValue) {
    setShownValue(value?.toString());

    if (value !== undefined) setMonth(value.toPlainYearMonth());
  }

  const first = month.toPlainDate({ day: 1 });
  const leading = first.dayOfWeek - 1;
  const days = Array.from({ length: month.daysInMonth }, (_unused, index) => first.add({ days: index }));
  const canGoBack = Temporal.PlainYearMonth.compare(month, min.toPlainYearMonth()) > 0;
  const canGoForward = Temporal.PlainYearMonth.compare(month, max.toPlainYearMonth()) < 0;

  return (
    <div>
      <div {...stylex.props(styles.monthHead)}>
        <span aria-live="polite" {...stylex.props(text.label, styles.monthTitle)}>
          {month.year}年{month.month}月
        </span>
        <button
          type="button"
          aria-label="上个月"
          disabled={!canGoBack}
          onClick={() => setMonth(month.subtract({ months: 1 }))}
          {...stylex.props(styles.navButton)}
        >
          <ChevronLeft aria-hidden />
        </button>
        <button
          type="button"
          aria-label="下个月"
          disabled={!canGoForward}
          onClick={() => setMonth(month.add({ months: 1 }))}
          {...stylex.props(styles.navButton)}
        >
          <ChevronRight aria-hidden />
        </button>
      </div>
      <div aria-hidden {...stylex.props(styles.grid)}>
        {WEEKDAY_HEADS.map((head) => (
          <span key={head} {...stylex.props(text.meta, styles.weekday)}>
            {head}
          </span>
        ))}
      </div>
      <RadioGroup
        aria-label={`${label}，${month.year}年${month.month}月`}
        value={value !== undefined && value.toPlainYearMonth().equals(month) ? value.toString() : ""}
        onValueChange={(next) => {
          if (isString(next) && next !== "") onSelect(parseDate(next));
        }}
        {...stylex.props(styles.grid)}
      >
        {Array.from({ length: leading }, (_unused, index) => (
          <span key={`blank-${index}`} aria-hidden />
        ))}
        {days.map((date) => {
          const isToday = date.equals(today);

          return (
            <Radio.Root
              key={date.toString()}
              value={date.toString()}
              disabled={!isInRange(date, min, max)}
              aria-label={`${formatDateLabel(date)}${isToday ? "（今天）" : ""}`}
              {...stylex.props(text.body, styles.day, isToday && styles.dayToday)}
            >
              {date.day}
              {isToday ? <span aria-hidden {...stylex.props(styles.todayDot)} /> : null}
            </Radio.Root>
          );
        })}
      </RadioGroup>
    </div>
  );
}
