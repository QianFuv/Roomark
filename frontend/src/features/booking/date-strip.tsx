/**
 * Horizontal strip of selectable dates.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";
import { Radio } from "@animate-ui/react/primitives/base-ui/radio";
import { RadioGroup } from "@animate-ui/react/primitives/base-ui/radio-group";
import * as stylex from "@stylexjs/stylex";

import { isString } from "../../lib/guards";
import { formatDateLabel, formatRelativeDate, weekdayLabel } from "../../lib/time";
import { colors, fonts, radii } from "../../styles/tokens.stylex";

const styles = stylex.create({
  label: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  root: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  strip: {
    display: "flex",
    gap: 8,
    marginInline: -4,
    overflowX: "auto",
    paddingBlock: 4,
    paddingInline: 4,
    scrollbarWidth: "thin",
  },
  item: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, "[data-checked]": colors.primary },
    borderColor: { default: colors.border, "[data-checked]": colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: { default: colors.text, "[data-checked]": colors.onPrimary },
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontFamily: fonts.sans,
    gap: 2,
    justifyContent: "center",
    minHeight: 60,
    minWidth: 58,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 8,
  },
  top: { fontSize: fonts.sizeXs, fontWeight: 600, opacity: 0.8 },
  day: { fontSize: fonts.sizeLg, fontVariantNumeric: "tabular-nums", fontWeight: 700 },
});

/** Props of {@link DateStrip}. */
export interface DateStripProps {
  label: string;
  dates: readonly Temporal.PlainDate[];
  value: string;
  onValueChange: (value: string) => void;
  today: Temporal.PlainDate;
}

/**
 * Single-choice date strip (radio group).
 *
 * @param props - Strip props.
 * @returns The strip.
 */
export function DateStrip({ label, dates, value, onValueChange, today }: DateStripProps) {
  return (
    <div {...stylex.props(styles.root)}>
      <span id="date-strip-label" {...stylex.props(styles.label)}>
        {label}
      </span>
      <RadioGroup
        aria-labelledby="date-strip-label"
        value={value}
        onValueChange={(next) => {
          if (isString(next)) onValueChange(next);
        }}
        {...stylex.props(styles.strip)}
      >
        {dates.map((date) => {
          const relative = formatRelativeDate(date, today);
          const isNamed = relative !== formatDateLabel(date);

          return (
            <Radio.Root
              key={date.toString()}
              value={date.toString()}
              aria-label={`${formatDateLabel(date)}${isNamed ? `（${relative}）` : ""}`}
              {...stylex.props(styles.item)}
            >
              <span {...stylex.props(styles.top)}>{isNamed ? relative : weekdayLabel(date.dayOfWeek)}</span>
              <span {...stylex.props(styles.day)}>
                {date.month}/{date.day}
              </span>
            </Radio.Root>
          );
        })}
      </RadioGroup>
    </div>
  );
}
