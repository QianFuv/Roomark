/**
 * Form fields: text input, text area and select, built on Base UI Field / Input and the
 * Animate UI select.
 *
 * @module
 */
import { Select } from "@animate-ui/react/primitives/base-ui/select";
import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import * as stylex from "@stylexjs/stylex";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { colors, fonts, radii } from "../styles/tokens.stylex";

/** Shared field styles, also used by other inputs. */
const fieldStyles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  label: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  description: { color: colors.textMuted, fontSize: fonts.sizeXs, lineHeight: 1.5 },
  error: { color: colors.busy, fontSize: fonts.sizeXs, lineHeight: 1.5 },
  control: {
    backgroundColor: colors.surface,
    borderColor: { default: colors.borderStrong, ":focus": colors.primary, "[data-invalid]": colors.busy },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 16,
    minHeight: 46,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 12,
    width: "100%",
  },
  textarea: { lineHeight: 1.5, minHeight: 96, paddingBlock: 10, resize: "vertical" },
});

/** Props of {@link TextField}. */
export interface TextFieldProps extends Omit<
  ComponentProps<typeof Input>,
  "className" | "style" | "onChange"
> {
  label: ReactNode;
  description?: ReactNode;
  error?: string | undefined;
  onValueChange?: (value: string) => void;
}

/**
 * Labeled single-line text input.
 *
 * @param props - Field props.
 * @returns The field.
 */
export function TextField({ label, description, error, onValueChange, ...inputProps }: TextFieldProps) {
  return (
    <Field.Root invalid={error !== undefined} {...stylex.props(fieldStyles.root)}>
      <Field.Label {...stylex.props(fieldStyles.label)}>{label}</Field.Label>
      <Input
        {...inputProps}
        onValueChange={(value) => onValueChange?.(value)}
        {...stylex.props(fieldStyles.control)}
      />
      {description === undefined ? null : (
        <Field.Description {...stylex.props(fieldStyles.description)}>{description}</Field.Description>
      )}
      {error === undefined ? null : (
        <Field.Error match {...stylex.props(fieldStyles.error)}>
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}

/** Props of {@link TextAreaField}. */
export interface TextAreaFieldProps {
  label: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  description?: ReactNode;
  rows?: number;
  name?: string;
}

/**
 * Labeled multi-line text input.
 *
 * @param props - Field props.
 * @returns The field.
 */
export function TextAreaField({
  label,
  value,
  onValueChange,
  placeholder,
  description,
  rows = 4,
  name,
}: TextAreaFieldProps) {
  return (
    <Field.Root {...stylex.props(fieldStyles.root)}>
      <Field.Label {...stylex.props(fieldStyles.label)}>{label}</Field.Label>
      <Field.Control
        render={<textarea rows={rows} />}
        name={name}
        value={value}
        placeholder={placeholder}
        onValueChange={(next) => onValueChange(next)}
        {...stylex.props(fieldStyles.control, fieldStyles.textarea)}
      />
      {description === undefined ? null : (
        <Field.Description {...stylex.props(fieldStyles.description)}>{description}</Field.Description>
      )}
    </Field.Root>
  );
}

/** One option of {@link SelectField}. */
export interface SelectOption<Value extends string> {
  value: Value;
  label: string;
  isDisabled?: boolean;
}

/** Props of {@link SelectField}. */
export interface SelectFieldProps<Value extends string> {
  label: ReactNode;
  value: Value;
  options: readonly SelectOption<Value>[];
  onValueChange: (value: Value) => void;
  description?: ReactNode;
  isDisabled?: boolean;
  xstyle?: stylex.StyleXStyles;
  /** Show the raw value in the trigger instead of the option label (for long labels). */
  isValueCompact?: boolean;
}

const selectStyles = stylex.create({
  trigger: {
    alignItems: "center",
    cursor: "pointer",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    textAlign: "start",
  },
  value: {
    fontVariantNumeric: "tabular-nums",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  icon: { color: colors.textSubtle, display: "inline-flex", flexShrink: 0 },
  positioner: { outline: "none", zIndex: 80 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 12px 32px ${colors.shadowStrong}`,
    color: colors.text,
    fontFamily: fonts.sans,
    minWidth: "var(--anchor-width)",
    outline: "none",
  },
  list: {
    maxHeight: "min(320px, var(--available-height))",
    overflowY: "auto",
    paddingBlock: 4,
    scrollPaddingBlock: 8,
  },
  item: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    cursor: "pointer",
    display: "grid",
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    gap: 8,
    gridTemplateColumns: "18px 1fr",
    minHeight: 40,
    opacity: { default: 1, "[data-disabled]": 0.4 },
    outline: "none",
    paddingInline: 10,
  },
  indicator: { color: colors.primary, display: "inline-flex", gridColumnStart: 1 },
  itemText: { gridColumnStart: 2 },
});

/**
 * Labeled select.
 *
 * @param props - Field props.
 * @returns The field.
 */
export function SelectField<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  description,
  isDisabled = false,
  xstyle,
  isValueCompact = false,
}: SelectFieldProps<Value>) {
  return (
    <Field.Root disabled={isDisabled} {...stylex.props(fieldStyles.root, xstyle)}>
      <Select.Root
        items={options.map((option) => ({ value: option.value, label: option.label }))}
        value={value}
        onValueChange={(next) => {
          const match = options.find((option) => option.value === next);

          if (match !== undefined) onValueChange(match.value);
        }}
        disabled={isDisabled}
      >
        <Select.Label {...stylex.props(fieldStyles.label)}>{label}</Select.Label>
        <Select.Trigger {...stylex.props(fieldStyles.control, selectStyles.trigger)}>
          <Select.Value {...stylex.props(selectStyles.value)}>
            {isValueCompact ? (selected: string) => selected : undefined}
          </Select.Value>
          <Select.Icon {...stylex.props(selectStyles.icon)}>
            <ChevronsUpDown size={16} aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            sideOffset={6}
            alignItemWithTrigger={false}
            {...stylex.props(selectStyles.positioner)}
          >
            <Select.Popup {...stylex.props(selectStyles.popup)}>
              <Select.List {...stylex.props(selectStyles.list)}>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.isDisabled === true}
                    {...stylex.props(selectStyles.item)}
                  >
                    <Select.ItemIndicator {...stylex.props(selectStyles.indicator)}>
                      <Check size={16} aria-hidden />
                    </Select.ItemIndicator>
                    <Select.ItemText {...stylex.props(selectStyles.itemText)}>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {description === undefined ? null : (
        <Field.Description {...stylex.props(fieldStyles.description)}>{description}</Field.Description>
      )}
    </Field.Root>
  );
}
