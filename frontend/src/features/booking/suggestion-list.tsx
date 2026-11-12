/**
 * Conflict suggestions: one calm conflict line, then the alternative windows as selectable cards
 * grouped into 当天 and 其他日期. The same card is used by the recurring preview.
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
  formatDateLabel,
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
    gap: 14,
    paddingBlock: 14,
    paddingInline: { default: 14, [media.narrow]: 16 },
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
  heading: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  headingText: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  headingHint: { color: colors.textMuted, fontSize: fonts.sizeXs },
  group: { display: "flex", flexDirection: "column", gap: 6 },
  groupLabel: { color: colors.textMuted, fontSize: fonts.sizeXs, fontWeight: 600, letterSpacing: "0.04em" },
  options: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))",
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
    display: "grid",
    fontFamily: fonts.sans,
    gap: 10,
    gridTemplateColumns: "18px minmax(0, 1fr) auto",
    minHeight: 52,
    opacity: { default: 1, ":disabled": 0.55 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 8,
    paddingInline: 12,
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
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  indicatorOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { display: "flex", flexDirection: "column", gap: 1, minWidth: 0 },
  time: { fontSize: fonts.sizeMd, fontVariantNumeric: "tabular-nums", fontWeight: 700 },
  detail: {
    color: colors.textMuted,
    fontSize: fonts.sizeXs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: { color: colors.textMuted, fontSize: fonts.sizeSm, fontVariantNumeric: "tabular-nums" },
  selectedText: { color: colors.text },
  empty: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.5 },
});

/** Props of {@link SuggestionOption}. */
export interface SuggestionOptionProps {
  time: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  ariaLabel: string;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
}

/**
 * One selectable alternative: indicator, time with a caption, and a trailing meta (duration).
 *
 * @param props - Option props.
 * @returns The option button.
 */
export function SuggestionOption({
  time,
  detail,
  meta,
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
        {isSelected ? <Check size={12} strokeWidth={3} /> : null}
      </span>
      <span {...stylex.props(styles.text)}>
        <span {...stylex.props(styles.time)}>{time}</span>
        {detail === undefined ? null : (
          <span {...stylex.props(styles.detail, isSelected && styles.selectedText)}>{detail}</span>
        )}
      </span>
      {meta === undefined ? null : (
        <span {...stylex.props(styles.meta, isSelected && styles.selectedText)}>{meta}</span>
      )}
    </button>
  );
}

/**
 * Caption of a date: `明天 · 11月19日 周三`, or just `11月19日 周三` beyond 后天.
 *
 * @param date - The date.
 * @param today - Today.
 * @returns The caption.
 */
function dayCaption(date: Temporal.PlainDate, today: Temporal.PlainDate): string {
  const label = formatDateLabel(date);
  const relative = formatRelativeDate(date, today);

  return relative === label ? label : `${relative} · ${label}`;
}

/**
 * Accessible name of a suggestion: `当天 11:00–12:00，1 小时`.
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
 * Card for one suggestion.
 *
 * @param props - Card props.
 * @param props.suggestion - The suggested window.
 * @param props.today - Today.
 * @param props.isSelected - Whether it is the applied one.
 * @param props.isDisabled - Whether a request is in flight.
 * @param props.onSelect - Called on tap.
 * @returns The card.
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
  return (
    <SuggestionOption
      time={formatClockRange(suggestion.start, suggestion.end)}
      detail={dayCaption(parseZoned(suggestion.start).toPlainDate(), today)}
      meta={formatDuration(minutesBetween(suggestion.start, suggestion.end))}
      ariaLabel={suggestionAriaLabel(suggestion)}
      isSelected={isSelected}
      isDisabled={isDisabled}
      onSelect={onSelect}
    />
  );
}

/**
 * Who holds a conflicting slot: `李四「组会」`, `「消杀」` or an empty string.
 *
 * @param conflict - The conflict.
 * @returns The holder text.
 */
function holderText(conflict: Conflict): string {
  const { name, title } = conflict.conflictWith;

  return `${name}${title === "" ? "" : `「${title}」`}`;
}

/**
 * The one-line conflict message: `明天 10:00–11:00 已被李四「组会」占用`.
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
        已被
        {holder === "" ? "" : <span {...stylex.props(styles.conflictWho)}>{holder}</span>}
        占用
      </span>
    </p>
  );
}

/** Props of {@link ConflictSuggestions}. */
export interface ConflictSuggestionsProps {
  conflict: Conflict;
  today: Temporal.PlainDate;
  selectedIndex: number | undefined;
  hint: string;
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
  hint,
  isBusy,
  onTake,
  footer,
}: ConflictSuggestionsProps) {
  const indexed = (conflict.suggestions ?? []).map((suggestion, index) => ({ suggestion, index }));

  const groups = [
    { label: "当天", items: indexed.filter((entry) => entry.suggestion.kind === "same_day") },
    { label: "其他日期", items: indexed.filter((entry) => entry.suggestion.kind === "other_day") },
  ].filter((group) => group.items.length > 0);

  return (
    <section aria-label="时段冲突" {...stylex.props(styles.panel)}>
      <ConflictLine conflict={conflict} today={today} />
      {groups.length === 0 ? (
        <p {...stylex.props(styles.empty)}>附近没有同样长度的空闲时段，试试换一天或缩短时长。</p>
      ) : (
        <>
          <div {...stylex.props(styles.heading)}>
            <span {...stylex.props(styles.headingText)}>换个时间</span>
            <span {...stylex.props(styles.headingHint)}>{hint}</span>
          </div>
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} {...stylex.props(styles.group)}>
              <span aria-hidden {...stylex.props(styles.groupLabel)}>
                {group.label}
              </span>
              <div {...stylex.props(styles.options)}>
                {group.items.map(({ suggestion, index }) => (
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
            </div>
          ))}
        </>
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
