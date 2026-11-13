/**
 * Form fields: text input, text area, select and searchable combobox, built on Base UI Field /
 * Input / Combobox and the Animate UI select.
 *
 * @module
 */
import { Select } from "@animate-ui/react/primitives/base-ui/select";
import { Combobox } from "@base-ui/react/combobox";
import { Field } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import * as stylex from "@stylexjs/stylex";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { colors, fonts, radii, sizes, space } from "../styles/tokens.stylex";
import { text } from "./typography";

/** Shared field styles, also used by other inputs. */
const fieldStyles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.xs, minWidth: 0 },
  label: { color: colors.text },
  description: { color: colors.textMuted },
  error: { color: colors.busy },
  control: {
    backgroundColor: colors.surface,
    borderColor: { default: colors.borderStrong, ":focus": colors.primary, "[data-invalid]": colors.busy },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.sans,
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.md,
    width: "100%",
  },
  textarea: { minHeight: 96, paddingBlock: space.sm, resize: "vertical" },
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
      <Field.Label {...stylex.props(text.label, fieldStyles.label)}>{label}</Field.Label>
      <Input
        {...inputProps}
        onValueChange={(value) => onValueChange?.(value)}
        {...stylex.props(text.input, fieldStyles.control)}
      />
      {description === undefined ? null : (
        <Field.Description {...stylex.props(text.meta, fieldStyles.description)}>
          {description}
        </Field.Description>
      )}
      {error === undefined ? null : (
        <Field.Error match {...stylex.props(text.meta, fieldStyles.error)}>
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
      <Field.Label {...stylex.props(text.label, fieldStyles.label)}>{label}</Field.Label>
      <Field.Control
        render={<textarea rows={rows} />}
        name={name}
        value={value}
        placeholder={placeholder}
        onValueChange={(next) => onValueChange(next)}
        {...stylex.props(text.input, fieldStyles.control, fieldStyles.textarea)}
      />
      {description === undefined ? null : (
        <Field.Description {...stylex.props(text.meta, fieldStyles.description)}>
          {description}
        </Field.Description>
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
    gap: space.sm,
    justifyContent: "space-between",
    textAlign: "start",
  },
  value: {
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
    paddingBlock: space.xs,
    scrollPaddingBlock: space.sm,
  },
  item: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    cursor: "pointer",
    display: "grid",
    gap: space.sm,
    gridTemplateColumns: "16px 1fr",
    minHeight: sizes.control,
    opacity: { default: 1, "[data-disabled]": 0.4 },
    outline: "none",
    paddingInline: space.md,
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
        <Select.Label {...stylex.props(text.label, fieldStyles.label)}>{label}</Select.Label>
        <Select.Trigger {...stylex.props(text.body, fieldStyles.control, selectStyles.trigger)}>
          <Select.Value {...stylex.props(selectStyles.value)}>
            {isValueCompact ? (selected: string) => selected : undefined}
          </Select.Value>
          <Select.Icon {...stylex.props(selectStyles.icon)}>
            <ChevronsUpDown aria-hidden />
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
                    {...stylex.props(text.body, selectStyles.item)}
                  >
                    <Select.ItemIndicator {...stylex.props(selectStyles.indicator)}>
                      <Check aria-hidden />
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
        <Field.Description {...stylex.props(text.meta, fieldStyles.description)}>
          {description}
        </Field.Description>
      )}
    </Field.Root>
  );
}

const comboboxStyles = stylex.create({
  group: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: { default: colors.borderStrong, ":focus-within": colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: space.sm,
    minHeight: sizes.control,
    outline: { default: "none", ":has(input:focus-visible)": `3px solid ${colors.focusRing}` },
    paddingInlineStart: space.md,
  },
  searchIcon: { color: colors.textSubtle, display: "inline-flex", flexShrink: 0 },
  input: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.text,
    flexGrow: 1,
    fontFamily: fonts.sans,
    minHeight: sizes.control,
    minWidth: 0,
    outline: "none",
    padding: 0,
  },
  trigger: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.textSubtle,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: sizes.control,
    justifyContent: "center",
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: sizes.control,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: { default: 0, ":not(:empty)": space.md },
    paddingInline: space.md,
  },
});

/** Props of {@link ComboboxField}. */
export interface ComboboxFieldProps<Value extends string> {
  label: ReactNode;
  value: Value;
  options: readonly SelectOption<Value>[];
  onValueChange: (value: Value) => void;
  placeholder?: string;
  emptyText?: string;
}

/**
 * Labeled searchable select (Base UI Combobox): type to filter, then pick an option.
 *
 * @param props - Field props.
 * @returns The field.
 */
export function ComboboxField<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  placeholder,
  emptyText = "没有匹配的选项",
}: ComboboxFieldProps<Value>) {
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <Field.Root {...stylex.props(fieldStyles.root)}>
      <Field.Label {...stylex.props(text.label, fieldStyles.label)}>{label}</Field.Label>
      <Combobox.Root
        items={options}
        value={selected}
        itemToStringLabel={(option: SelectOption<Value>) => option.label}
        isItemEqualToValue={(option: SelectOption<Value>, current: SelectOption<Value>) =>
          option.value === current.value
        }
        onValueChange={(next: SelectOption<Value> | null) => {
          if (next !== null) onValueChange(next.value);
        }}
      >
        <Combobox.InputGroup {...stylex.props(comboboxStyles.group)}>
          <span aria-hidden {...stylex.props(comboboxStyles.searchIcon)}>
            <Search />
          </span>
          <Combobox.Input placeholder={placeholder} {...stylex.props(text.input, comboboxStyles.input)} />
          <Combobox.Trigger aria-label="展开列表" {...stylex.props(comboboxStyles.trigger)}>
            <ChevronsUpDown aria-hidden />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={6} {...stylex.props(selectStyles.positioner)}>
            <Combobox.Popup {...stylex.props(selectStyles.popup)}>
              <Combobox.Empty {...stylex.props(text.body, comboboxStyles.empty)}>{emptyText}</Combobox.Empty>
              <Combobox.List {...stylex.props(selectStyles.list)}>
                {(option: SelectOption<Value>) => (
                  <Combobox.Item
                    key={option.value}
                    value={option}
                    disabled={option.isDisabled === true}
                    {...stylex.props(text.body, selectStyles.item)}
                  >
                    <Combobox.ItemIndicator {...stylex.props(selectStyles.indicator)}>
                      <Check aria-hidden />
                    </Combobox.ItemIndicator>
                    <span {...stylex.props(selectStyles.itemText)}>{option.label}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </Field.Root>
  );
}
