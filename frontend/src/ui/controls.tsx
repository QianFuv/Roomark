/**
 * Switch row, tabs and collapsible disclosure (Animate UI primitives on Base UI).
 *
 * @module
 */
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible";
import { Switch } from "@animate-ui/react/primitives/base-ui/switch";
import { Tabs } from "@animate-ui/react/primitives/base-ui/tabs";
import { Field } from "@base-ui/react/field";
import { NumberField } from "@base-ui/react/number-field";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { colors, fonts, media, radii } from "../styles/tokens.stylex";

const styles = stylex.create({
  stepperRoot: { alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" },
  stepperLabel: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  stepperGroup: { alignItems: "center", display: "flex", gap: 6 },
  stepperButton: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover:not([data-disabled])": colors.surfaceHover },
    borderColor: colors.borderStrong,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: { default: "pointer", "[data-disabled]": "not-allowed" },
    display: "inline-flex",
    height: 40,
    justifyContent: "center",
    opacity: { default: 1, "[data-disabled]": 0.4 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: 44,
  },
  stepperInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: fonts.sizeLg,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    textAlign: "center",
    width: 48,
  },
  stepperUnit: { color: colors.textMuted, fontSize: fonts.sizeSm },
  switchRow: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 48,
  },
  switchText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  switchLabel: { color: colors.text, cursor: "pointer", fontSize: fonts.sizeMd, fontWeight: 600 },
  switchHint: { color: colors.textMuted, fontSize: fonts.sizeXs, lineHeight: 1.5 },
  switchRoot: {
    backgroundColor: { default: colors.borderStrong, "[data-checked]": colors.primary },
    borderRadius: radii.pill,
    borderWidth: 0,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: 30,
    justifyContent: { default: "flex-start", "[data-checked]": "flex-end" },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 3,
    transitionDuration: "150ms",
    transitionProperty: "background-color",
    width: 50,
  },
  switchThumb: {
    backgroundColor: "#ffffff",
    borderRadius: radii.pill,
    boxShadow: `0 1px 3px ${colors.shadowStrong}`,
    display: "block",
    height: 24,
    width: 24,
  },
  tabsList: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: "flex",
    gap: 2,
    padding: 3,
    position: "relative",
  },
  tab: {
    backgroundColor: { default: "transparent", "[data-active]": colors.surfaceRaised },
    borderRadius: radii.small,
    borderWidth: 0,
    color: { default: colors.textMuted, "[data-active]": colors.primaryText },
    cursor: "pointer",
    flexGrow: 1,
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    minHeight: 40,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 12,
    position: "relative",
    zIndex: 1,
  },
  panel: { outline: "none", paddingTop: 12 },
  disclosureTrigger: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeLg,
    fontWeight: 700,
    gap: 8,
    justifyContent: "space-between",
    minHeight: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
    textAlign: "start",
    width: "100%",
  },
  disclosureHint: { color: colors.textMuted, fontSize: fonts.sizeSm, fontWeight: 500 },
  chevron: {
    color: colors.textMuted,
    flexShrink: 0,
    transitionDuration: { default: "200ms", [media.reducedMotion]: "0ms" },
    transitionProperty: "transform",
  },
  chevronOpen: { transform: "rotate(180deg)" },
  disclosurePanel: { overflow: "hidden" },
});

/** Props of {@link SwitchRow}. */
export interface SwitchRowProps {
  label: ReactNode;
  hint?: ReactNode;
  isChecked: boolean;
  onCheckedChange: (isChecked: boolean) => void;
  isDisabled?: boolean;
}

/**
 * Labeled switch on a full-width row.
 *
 * @param props - Row props.
 * @returns The row.
 */
export function SwitchRow({ label, hint, isChecked, onCheckedChange, isDisabled = false }: SwitchRowProps) {
  return (
    <Field.Root disabled={isDisabled} {...stylex.props(styles.switchRow)}>
      <div {...stylex.props(styles.switchText)}>
        <Field.Label {...stylex.props(styles.switchLabel)}>{label}</Field.Label>
        {hint === undefined ? null : (
          <Field.Description {...stylex.props(styles.switchHint)}>{hint}</Field.Description>
        )}
      </div>
      <Switch.Root
        checked={isChecked}
        onCheckedChange={(checked) => onCheckedChange(checked)}
        {...stylex.props(styles.switchRoot)}
      >
        <Switch.Thumb {...stylex.props(styles.switchThumb)} />
      </Switch.Root>
    </Field.Root>
  );
}

/** One tab. */
interface TabItem<Value extends string> {
  value: Value;
  label: ReactNode;
  content: ReactNode;
}

/** Props of {@link TabView}. */
export interface TabViewProps<Value extends string> {
  label: string;
  value: Value;
  onValueChange: (value: Value) => void;
  items: readonly TabItem<Value>[];
}

/**
 * Tabs with an animated active pill.
 *
 * @param props - Tab props.
 * @returns The tabs.
 */
export function TabView<Value extends string>({ label, value, onValueChange, items }: TabViewProps<Value>) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next);

        if (match !== undefined) onValueChange(match.value);
      }}
    >
      <Tabs.List aria-label={label} {...stylex.props(styles.tabsList)}>
        {items.map((item) => (
          <Tabs.Tab key={item.value} value={item.value} {...stylex.props(styles.tab)}>
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {items.map((item) => (
        <Tabs.Panel key={item.value} value={item.value} {...stylex.props(styles.panel)}>
          {item.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

/** Props of {@link Disclosure}. */
export interface DisclosureProps {
  title: ReactNode;
  hint?: ReactNode;
  isDefaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible section with an animated height.
 *
 * @param props - Disclosure props.
 * @returns The disclosure.
 */
export function Disclosure({ title, hint, isDefaultOpen = false, children }: DisclosureProps) {
  const [isOpen, setIsOpen] = useState(isDefaultOpen);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      <Collapsible.Trigger {...stylex.props(styles.disclosureTrigger)}>
        <span>
          {title}
          {hint === undefined ? null : (
            <>
              {" "}
              <span {...stylex.props(styles.disclosureHint)}>{hint}</span>
            </>
          )}
        </span>
        <ChevronDown size={20} aria-hidden {...stylex.props(styles.chevron, isOpen && styles.chevronOpen)} />
      </Collapsible.Trigger>
      <Collapsible.Panel {...stylex.props(styles.disclosurePanel)}>{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}

/** Props of {@link Stepper}. */
export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onValueChange: (value: number) => void;
}

/**
 * Compact number input with − / + buttons (Base UI NumberField), used instead of long dropdowns.
 *
 * @param props - Stepper props.
 * @returns The stepper.
 */
export function Stepper({ label, value, min, max, unit, onValueChange }: StepperProps) {
  return (
    <NumberField.Root
      value={value}
      min={min}
      max={max}
      step={1}
      onValueChange={(next) => {
        if (next !== null) onValueChange(Math.min(Math.max(Math.round(next), min), max));
      }}
      {...stylex.props(styles.stepperRoot)}
    >
      <span aria-hidden {...stylex.props(styles.stepperLabel)}>
        {label}
      </span>
      <NumberField.Group {...stylex.props(styles.stepperGroup)}>
        <NumberField.Decrement aria-label={`减少${label}`} {...stylex.props(styles.stepperButton)}>
          <Minus size={18} aria-hidden />
        </NumberField.Decrement>
        <NumberField.Input aria-label={label} {...stylex.props(styles.stepperInput)} />
        <NumberField.Increment aria-label={`增加${label}`} {...stylex.props(styles.stepperButton)}>
          <Plus size={18} aria-hidden />
        </NumberField.Increment>
        {unit === undefined ? null : <span {...stylex.props(styles.stepperUnit)}>{unit}</span>}
      </NumberField.Group>
    </NumberField.Root>
  );
}
