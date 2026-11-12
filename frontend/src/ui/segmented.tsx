/**
 * Segmented control (single choice) and multi-choice chips built on the Animate UI toggle group.
 *
 * @module
 */
import { Toggle } from "@animate-ui/react/primitives/base-ui/toggle";
import { ToggleGroup } from "@animate-ui/react/primitives/base-ui/toggle-group";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, fonts, radii } from "../styles/tokens.stylex";

/** One segment. */
interface SegmentOption<Value extends string> {
  value: Value;
  label: ReactNode;
  hint?: ReactNode;
  isDisabled?: boolean;
  ariaLabel?: string;
}

/** Props of {@link Segmented}. */
export interface SegmentedProps<Value extends string> {
  label: string;
  value: Value;
  options: readonly SegmentOption<Value>[];
  onValueChange: (value: Value) => void;
  isFullWidth?: boolean;
  size?: "md" | "lg";
}

const styles = stylex.create({
  group: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: "inline-flex",
    gap: 2,
    padding: 3,
  },
  fullWidth: { display: "flex", width: "100%" },
  item: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-pressed]": colors.surfaceRaised },
    borderRadius: radii.small,
    borderWidth: 0,
    boxShadow: { default: "none", "[data-pressed]": `0 1px 3px ${colors.shadowStrong}` },
    color: { default: colors.textMuted, "[data-pressed]": colors.text },
    cursor: { default: "pointer", "[data-disabled]": "not-allowed" },
    display: "inline-flex",
    flexDirection: "column",
    flexGrow: 1,
    fontFamily: fonts.sans,
    fontSize: fonts.sizeSm,
    fontWeight: 600,
    gap: 1,
    justifyContent: "center",
    minHeight: 36,
    opacity: { default: 1, "[data-disabled]": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 12,
    whiteSpace: "nowrap",
  },
  itemLarge: { fontSize: fonts.sizeMd, minHeight: 48 },
  hint: {
    color: "inherit",
    fontSize: fonts.sizeXs,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
  },
  chips: { display: "flex", gap: 6 },
  chip: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, "[data-pressed]": colors.primary },
    borderColor: { default: colors.borderStrong, "[data-pressed]": colors.primary },
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    color: { default: colors.text, "[data-pressed]": colors.onPrimary },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    justifyContent: "center",
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 44,
    minWidth: 36,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 0,
  },
});

/**
 * Single-choice segmented control.
 *
 * @param props - Control props.
 * @returns The control.
 */
export function Segmented<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  isFullWidth = false,
  size = "md",
}: SegmentedProps<Value>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(values) => {
        const next = options.find((option) => option.value === values[0]);

        if (next !== undefined) onValueChange(next.value);
      }}
      {...stylex.props(styles.group, isFullWidth && styles.fullWidth)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.isDisabled === true}
          aria-label={option.ariaLabel}
          {...stylex.props(styles.item, size === "lg" && styles.itemLarge)}
        >
          {option.label}
          {option.hint === undefined ? null : <span {...stylex.props(styles.hint)}>{option.hint}</span>}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

/** Props of {@link ChipGroup}. */
export interface ChipGroupProps<Value extends string> {
  label: string;
  values: readonly Value[];
  options: readonly SegmentOption<Value>[];
  onValuesChange: (values: Value[]) => void;
}

/**
 * Multi-choice chips (e.g. weekdays).
 *
 * @param props - Chip props.
 * @returns The chips.
 */
export function ChipGroup<Value extends string>({
  label,
  values,
  options,
  onValuesChange,
}: ChipGroupProps<Value>) {
  return (
    <ToggleGroup
      aria-label={label}
      multiple
      value={[...values]}
      onValueChange={(next) =>
        onValuesChange(options.filter((option) => next.includes(option.value)).map((option) => option.value))
      }
      {...stylex.props(styles.chips)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          disabled={option.isDisabled === true}
          {...stylex.props(styles.chip)}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
