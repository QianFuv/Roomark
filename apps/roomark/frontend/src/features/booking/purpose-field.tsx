/**
 * Required purpose (用途) input with one-tap chips for purposes recently used on this device.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { History } from "lucide-react";
import type { Ref } from "react";

import { useRecentTitles } from "../../state/app-store";
import { colors, fonts, radii, sizes, space } from "../../styles/tokens.stylex";
import { TextField } from "../../ui/field";
import { text } from "../../ui/typography";

/** Longest purpose the API accepts. */
export const TITLE_MAX_LENGTH = 200;

/** Message shown when the purpose is missing. */
export const TITLE_REQUIRED_MESSAGE = "请填写用途";

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  chips: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: space.sm },
  chipsIcon: { color: colors.textMuted, display: "inline-flex" },
  chip: {
    backgroundColor: { default: colors.surfaceMuted, ":hover": colors.surfaceHover },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    fontFamily: fonts.sans,
    maxWidth: 200,
    minHeight: sizes.controlSmall,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    overflow: "hidden",
    paddingInline: space.md,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/** Props of {@link PurposeField}. */
export interface PurposeFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  error?: string | undefined;
  placeholder?: string;
  isAutoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Purpose input plus recent-purpose chips.
 *
 * @param props - Field props.
 * @returns The field.
 */
export function PurposeField({
  value,
  onValueChange,
  error,
  placeholder = "如：组会、答辩、面试",
  isAutoFocus = false,
  inputRef,
}: PurposeFieldProps) {
  const recent = useRecentTitles().filter((title) => title !== value.trim());

  return (
    <div {...stylex.props(styles.root)}>
      <TextField
        ref={inputRef}
        label="用途"
        placeholder={placeholder}
        value={value}
        onValueChange={onValueChange}
        maxLength={TITLE_MAX_LENGTH}
        required
        autoFocus={isAutoFocus}
        error={error}
      />
      {recent.length === 0 ? null : (
        <div role="group" aria-label="最近用过的用途" {...stylex.props(styles.chips)}>
          <span aria-hidden {...stylex.props(styles.chipsIcon)}>
            <History />
          </span>
          {recent.map((title) => (
            <button
              key={title}
              type="button"
              aria-label={`用途：${title}`}
              onClick={() => onValueChange(title)}
              {...stylex.props(text.body, styles.chip)}
            >
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
