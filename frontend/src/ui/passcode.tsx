/**
 * Passcode entry built on Base UI `OTPField` (digits only, masked).
 *
 * @module
 */
import { OTPField } from "@base-ui/react/otp-field";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { colors, fonts, radii } from "../styles/tokens.stylex";

/** Allowed passcode lengths. */
export type PasscodeLength = 4 | 6;

/** Props of {@link PasscodeInput}. */
export interface PasscodeInputProps {
  label: string;
  length: PasscodeLength;
  value: string;
  onValueChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string | undefined;
  isDisabled?: boolean;
  isAutoFocus?: boolean;
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 8 },
  label: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  slots: { display: "flex", gap: 8 },
  slot: {
    backgroundColor: colors.surface,
    borderColor: { default: colors.borderStrong, ":focus": colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1.5,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 24,
    fontWeight: 700,
    height: 54,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
    textAlign: "center",
    width: 46,
  },
  slotInvalid: { borderColor: colors.busy },
  error: { color: colors.busy, fontSize: fonts.sizeSm, lineHeight: 1.5 },
});

/**
 * Masked numeric passcode boxes.
 *
 * @param props - Input props.
 * @returns The input.
 */
export function PasscodeInput({
  label,
  length,
  value,
  onValueChange,
  onComplete,
  error,
  isDisabled = false,
  isAutoFocus = false,
}: PasscodeInputProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div {...stylex.props(styles.root)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        {label}
      </label>
      <OTPField.Root
        id={id}
        key={length}
        length={length}
        mask
        inputMode="numeric"
        validationType="numeric"
        autoComplete="off"
        value={value}
        disabled={isDisabled}
        aria-describedby={error === undefined ? undefined : errorId}
        onValueChange={(next) => onValueChange(next)}
        onValueComplete={(next) => onComplete?.(next)}
        {...stylex.props(styles.slots)}
      >
        {Array.from({ length }, (_unused, index) => (
          <OTPField.Input
            key={index}
            autoFocus={isAutoFocus && index === 0}
            aria-label={index === 0 ? undefined : `第 ${index + 1} 位，共 ${length} 位`}
            {...stylex.props(styles.slot, error !== undefined && styles.slotInvalid)}
          />
        ))}
      </OTPField.Root>
      {error === undefined ? null : (
        <p id={errorId} role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
    </div>
  );
}
