/**
 * Passcode entry built on Base UI `OTPField`: six masked digit boxes that report completion as
 * soon as the last digit is typed.
 *
 * @module
 */
import { OTPField } from "@base-ui/react/otp-field";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { colors, fonts, radii } from "../styles/tokens.stylex";

/** Every passcode has exactly this many digits. */
export const PASSCODE_LENGTH = 6;

/** Props of {@link PasscodeInput}. */
export interface PasscodeInputProps {
  label: string;
  isLabelVisible?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string | undefined;
  isDisabled?: boolean;
  isAutoFocus?: boolean;
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  label: { color: colors.text, fontSize: fonts.sizeMd, fontWeight: 500, lineHeight: 1.5 },
  hiddenLabel: {
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  slots: { display: "flex", gap: 8, maxWidth: 352, width: "100%" },
  slot: {
    backgroundColor: colors.surface,
    borderColor: { default: colors.borderStrong, ":focus": colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1.5,
    color: colors.text,
    flexBasis: 0,
    flexGrow: 1,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: 700,
    height: 52,
    minWidth: 0,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
    textAlign: "center",
  },
  slotInvalid: { borderColor: colors.busy },
  error: { color: colors.busy, fontSize: fonts.sizeSm, lineHeight: 1.5 },
});

/**
 * Six masked numeric passcode boxes.
 *
 * @param props - Input props.
 * @returns The input.
 */
export function PasscodeInput({
  label,
  isLabelVisible = true,
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
      <label htmlFor={id} {...stylex.props(isLabelVisible ? styles.label : styles.hiddenLabel)}>
        {label}
      </label>
      <OTPField.Root
        id={id}
        length={PASSCODE_LENGTH}
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
        {Array.from({ length: PASSCODE_LENGTH }, (_unused, index) => (
          <OTPField.Input
            key={index}
            autoFocus={isAutoFocus && index === 0}
            aria-label={index === 0 ? undefined : `第 ${index + 1} 位，共 ${PASSCODE_LENGTH} 位`}
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
