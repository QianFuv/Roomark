/**
 * Conflict suggestions: one calm conflict line, then the alternative windows as compact one-line
 * chips (same day first, other days named). The same chip is used by the recurring preview.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";
import * as stylex from "@stylexjs/stylex";
import { Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { Conflict, Suggestion } from "../../api/client";
import { suggestionLabel } from "../../lib/recurring";
import {
  formatBookingWhen,
  formatClockRange,
  formatDuration,
  formatRelativeDate,
  minutesBetween,
  parseZoned,
} from "../../lib/time";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";

const styles = stylex.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderInlineStartColor: colors.warningSolid,
    borderInlineStartWidth: 3,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingBlock: 12,
    paddingInline: { default: 12, [media.narrow]: 14 },
  },
  conflictLine: {
    alignItems: "flex-start",
    color: colors.text,
    display: "flex",
    fontSize: fonts.sizeMd,
    gap: 8,
    lineHeight: 1.5,
  },
  conflictIcon: { color: colors.warning, display: "inline-flex", flexShrink: 0, marginTop: 2 },
  conflictWhen: { fontVariantNumeric: "tabular-nums", fontWeight: 600 },
  conflictWho: { color: colors.textMuted },
  options: {
    display: "grid",
    gap: 6,
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 148px), 1fr))",
  },
  option: {
    alignItems: "center",
    backgroundColor: {
      default: colors.surfaceRaised,
      ":hover:not(:disabled)": colors.surfaceHover,
      '[aria-pressed="true"]': colors.primarySoft,
    },
    borderColor: { default: colors.borderStrong, '[aria-pressed="true"]': colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: { default: "none", '[aria-pressed="true"]': `inset 0 0 0 1px ${colors.primary}` },
    color: colors.text,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "flex",
    fontFamily: fonts.sans,
    gap: 8,
    minHeight: 44,
    minWidth: 0,
    opacity: { default: 1, ":disabled": 0.55 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 4,
    paddingInline: 10,
    textAlign: "start",
    transitionDuration: { default: "120ms", [media.reducedMotion]: "0ms" },
    transitionProperty: "background-color, border-color",
  },
  indicator: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 2,
    boxSizing: "border-box",
    color: colors.onPrimary,
    display: "inline-flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  indicatorOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: {
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  day: { color: colors.textMuted, fontWeight: 500, marginInlineEnd: 4 },
  daySelected: { color: colors.text },
  empty: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.5 },
});

/** Holder name the server reports for blocked time. */
const BLOCK_HOLDER = "不可预约";

/** Props of {@link SuggestionOption}. */
export interface SuggestionOptionProps {
  /** Muted prefix such as `明天`. */
  day?: string | undefined;
  time: string;
  ariaLabel: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
}

/**
 * One selectable alternative on a single line: indicator, optional day, time.
 *
 * @param props - Option props.
 * @returns The option button.
 */
export function SuggestionOption({
  day,
  time,
  ariaLabel,
  isSelected,
  isDisabled = false,
  onSelect,
}: SuggestionOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={ariaLabel}
      disabled={isDisabled}
      onClick={onSelect}
      {...stylex.props(styles.option)}
    >
      <span aria-hidden {...stylex.props(styles.indicator, isSelected && styles.indicatorOn)}>
        {isSelected ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span {...stylex.props(styles.text)}>
        {day === undefined ? null : (
          <span {...stylex.props(styles.day, isSelected && styles.daySelected)}>{day}</span>
        )}
        {time}
      </span>
    </button>
  );
}

/**
 * Accessible name of a suggestion: `明天 11:00–12:00，1 小时`.
 *
 * @param suggestion - The suggestion.
 * @returns The label.
 */
function suggestionAriaLabel(suggestion: Suggestion): string {
  return `${suggestionLabel(suggestion.start, suggestion.end, suggestion.kind)}，${formatDuration(
    minutesBetween(suggestion.start, suggestion.end),
  )}`;
}

/**
 * Chip for one suggestion; other days are named (`明天`, `11月19日 周三`).
 *
 * @param props - Chip props.
 * @param props.suggestion - The suggested window.
 * @param props.today - Today.
 * @param props.isSelected - Whether it is the applied one.
 * @param props.isDisabled - Whether a request is in flight.
 * @param props.onSelect - Called on tap.
 * @returns The chip.
 */
export function SuggestionCard({
  suggestion,
  today,
  isSelected,
  isDisabled = false,
  onSelect,
}: {
  suggestion: Suggestion;
  today: Temporal.PlainDate;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
}) {
  const date = parseZoned(suggestion.start).toPlainDate();

  return (
    <SuggestionOption
      day={date.equals(today) && suggestion.kind === "same_day" ? undefined : formatRelativeDate(date, today)}
      time={formatClockRange(suggestion.start, suggestion.end)}
      ariaLabel={suggestionAriaLabel(suggestion)}
      isSelected={isSelected}
      isDisabled={isDisabled}
      onSelect={onSelect}
    />
  );
}

/**
 * What holds a conflicting slot: `已被李四约了（组会）`, or `不可预约（消杀）` for blocked time.
 *
 * @param conflict - The conflict.
 * @returns The text after the time.
 */
function holderText(conflict: Conflict): string {
  const { name, title } = conflict.conflictWith;
  const purpose = title === "" ? "" : `（${title}）`;

  return name === "" || name === BLOCK_HOLDER ? `不可预约${purpose}` : `已被${name}约了${purpose}`;
}

/**
 * The one-line conflict message: `明天 10:00–11:00 已被李四约了（组会）`.
 *
 * @param props - Line props.
 * @param props.conflict - The conflict.
 * @param props.today - Today.
 * @returns The line.
 */
function ConflictLine({ conflict, today }: { conflict: Conflict; today: Temporal.PlainDate }) {
  const holder = holderText(conflict);

  return (
    <p {...stylex.props(styles.conflictLine)}>
      <span {...stylex.props(styles.conflictIcon)}>
        <CircleAlert size={18} aria-hidden />
      </span>
      <span>
        <span {...stylex.props(styles.conflictWhen)}>
          {formatBookingWhen(conflict.conflictWith.start, conflict.conflictWith.end, today)}
        </span>{" "}
        <span {...stylex.props(styles.conflictWho)}>{holder}</span>
      </span>
    </p>
  );
}

/** Props of {@link ConflictSuggestions}. */
export interface ConflictSuggestionsProps {
  conflict: Conflict;
  today: Temporal.PlainDate;
  selectedIndex: number | undefined;
  isBusy: boolean;
  onTake: (index: number) => void;
  footer?: ReactNode;
}

/**
 * Conflict panel of the single booking form.
 *
 * @param props - Panel props.
 * @returns The panel.
 */
export function ConflictSuggestions({
  conflict,
  today,
  selectedIndex,
  isBusy,
  onTake,
  footer,
}: ConflictSuggestionsProps) {
  const indexed = (conflict.suggestions ?? [])
    .map((suggestion, index) => ({ suggestion, index }))
    .sort(
      (left, right) =>
        Number(left.suggestion.kind !== "same_day") - Number(right.suggestion.kind !== "same_day"),
    );

  return (
    <section aria-label="时段冲突" {...stylex.props(styles.panel)}>
      <ConflictLine conflict={conflict} today={today} />
      {indexed.length === 0 ? (
        <p {...stylex.props(styles.empty)}>附近没有同样长的空档，换一天或缩短时长试试</p>
      ) : (
        <div role="group" aria-label="换个时间" {...stylex.props(styles.options)}>
          {indexed.map(({ suggestion, index }) => (
            <SuggestionCard
              key={`${suggestion.start}-${suggestion.end}`}
              suggestion={suggestion}
              today={today}
              isSelected={selectedIndex === index}
              isDisabled={isBusy}
              onSelect={() => onTake(index)}
            />
          ))}
        </div>
      )}
      {footer}
    </section>
  );
}

/**
 * Labeled grid of suggestion cards, laid out like {@link ConflictSuggestions}.
 *
 * @param props - Grid props.
 * @param props.ariaLabel - Group name.
 * @param props.children - The cards.
 * @returns The grid.
 */
export function SuggestionGrid({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={ariaLabel} {...stylex.props(styles.options)}>
      {children}
    </div>
  );
}
