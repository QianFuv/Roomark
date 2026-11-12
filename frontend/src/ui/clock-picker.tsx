/**
 * Scroll-free clock field: a field-style button that opens a popover with a 24-hour grid and the
 * minutes of the chosen hour. Replaces long time dropdowns and native time inputs in admin forms.
 *
 * @module
 */
import { Popover } from "@animate-ui/react/primitives/base-ui/popover";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Clock } from "lucide-react";
import { useId, useState } from "react";

import { clockToMinutes, minutesToClock } from "../lib/time";
import { useOverlayHistory } from "../app/overlay-history";
import { colors, fonts, radii, sizes, space } from "../styles/tokens.stylex";
import { text } from "./typography";

const HOURS = Array.from({ length: 24 }, (_unused, hour) => hour);

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  label: { color: colors.text },
  trigger: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
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
  },
  icon: { color: colors.textSubtle, display: "inline-flex", flexShrink: 0 },
  value: { flexGrow: 1 },
  positioner: { outline: "none", zIndex: 90 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 16px 40px ${colors.shadowStrong}`,
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    gap: space.sm,
    outline: "none",
    padding: space.md,
    width: `min(300px, calc(100vw - ${space.xl}))`,
  },
  caption: { color: colors.textMuted },
  hours: { display: "grid", gap: space.xs, gridTemplateColumns: "repeat(6, minmax(0, 1fr))" },
  minutes: { display: "grid", gap: space.xs, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
  cell: {
    backgroundColor: {
      default: "transparent",
      ":hover:not(:disabled)": colors.surfaceHover,
      '[aria-pressed="true"]': colors.primary,
    },
    borderRadius: radii.small,
    borderWidth: 0,
    color: { default: colors.text, '[aria-pressed="true"]': colors.onPrimary },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    fontFamily: fonts.sans,
    minHeight: sizes.controlSmall,
    opacity: { default: 1, ":disabled": 0.35 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
  },
});

/** Props of {@link ClockPicker}. */
export interface ClockPickerProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Minute step; 15 or 30. */
  step?: 15 | 30;
}

/**
 * Clock field with an hour grid and minute buttons.
 *
 * @param props - Picker props.
 * @returns The field.
 */
export function ClockPicker({ label, value, onValueChange, step = 15 }: ClockPickerProps) {
  const labelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  useOverlayHistory(isOpen, () => setIsOpen(false));
  const total = value === "" ? undefined : clockToMinutes(value);
  const selectedHour = total === undefined ? undefined : Math.floor(total / 60);
  const selectedMinute = total === undefined ? undefined : total % 60;
  const minutes = Array.from({ length: 60 / step }, (_unused, index) => index * step);

  return (
    <div {...stylex.props(styles.root)}>
      <span id={labelId} {...stylex.props(text.label, styles.label)}>
        {label}
      </span>
      <Popover.Root open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
        <Popover.Trigger
          aria-label={`${label}：${value === "" ? "未选择" : value}，选择时间`}
          {...stylex.props(text.body, styles.trigger)}
        >
          <span aria-hidden {...stylex.props(styles.icon)}>
            <Clock />
          </span>
          <span {...stylex.props(styles.value)}>{value === "" ? "选择时间" : value}</span>
          <span aria-hidden {...stylex.props(styles.icon)}>
            <ChevronDown />
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner sideOffset={6} align="start" {...stylex.props(styles.positioner)}>
            <Popover.Popup aria-labelledby={labelId} {...stylex.props(styles.popup)}>
              <span {...stylex.props(text.meta, styles.caption)}>时</span>
              <div role="group" aria-label={`${label}，小时`} {...stylex.props(styles.hours)}>
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-pressed={hour === selectedHour}
                    aria-label={`${hour} 点`}
                    onClick={() => onValueChange(minutesToClock(hour * 60 + (selectedMinute ?? 0)))}
                    {...stylex.props(text.label, styles.cell)}
                  >
                    {String(hour).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <span {...stylex.props(text.meta, styles.caption)}>分</span>
              <div role="group" aria-label={`${label}，分钟`} {...stylex.props(styles.minutes)}>
                {minutes.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    aria-pressed={minute === selectedMinute}
                    aria-label={`${minute} 分`}
                    onClick={() => {
                      onValueChange(minutesToClock((selectedHour ?? 0) * 60 + minute));
                      setIsOpen(false);
                    }}
                    {...stylex.props(text.label, styles.cell)}
                  >
                    :{String(minute).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
