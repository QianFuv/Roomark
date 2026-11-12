/**
 * Buttons built on Base UI `Button`.
 *
 * @module
 */
import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { colors, fonts, media, radii } from "../styles/tokens.stylex";

/** Visual emphasis of a button. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "soft";

/** Button height. */
type ButtonSize = "sm" | "md" | "lg" | "xl";

/** Props of {@link Button}. */
export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, "className" | "style"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isFullWidth?: boolean;
  isLoading?: boolean;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  xstyle?: stylex.StyleXStyles;
}

const spin = stylex.keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fonts.sans,
    fontWeight: 600,
    gap: 8,
    justifyContent: "center",
    lineHeight: 1.2,
    opacity: { default: 1, ":disabled": 0.45 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    outlineOffset: 2,
    position: "relative",
    textDecoration: "none",
    transitionDuration: { default: "120ms", [media.reducedMotion]: "0ms" },
    transitionProperty: "background-color, border-color, color, transform, box-shadow",
    transform: { default: "none", ":active:not(:disabled)": "scale(0.98)" },
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    whiteSpace: "nowrap",
  },
  sm: { fontSize: fonts.sizeSm, minHeight: 36, paddingInline: 12 },
  md: { fontSize: fonts.sizeMd, minHeight: 44, paddingInline: 16 },
  lg: { fontSize: fonts.sizeLg, minHeight: 52, paddingInline: 20, borderRadius: radii.large },
  xl: { fontSize: fonts.sizeXl, minHeight: 64, paddingInline: 24, borderRadius: radii.large },
  fullWidth: { width: "100%" },
  primary: {
    backgroundColor: { default: colors.primary, ":hover:not(:disabled)": colors.primaryHover },
    color: colors.onPrimary,
  },
  success: {
    backgroundColor: { default: colors.freeSolid, ":hover:not(:disabled)": colors.freeSolidHover },
    color: colors.onFree,
  },
  secondary: {
    backgroundColor: { default: colors.surface, ":hover:not(:disabled)": colors.surfaceHover },
    borderColor: colors.borderStrong,
    color: colors.text,
  },
  soft: {
    backgroundColor: { default: colors.primarySoft, ":hover:not(:disabled)": colors.surfaceHover },
    color: colors.primaryText,
  },
  ghost: {
    backgroundColor: { default: "transparent", ":hover:not(:disabled)": colors.surfaceHover },
    color: colors.text,
  },
  danger: {
    backgroundColor: { default: colors.busySoft, ":hover:not(:disabled)": colors.busySolid },
    color: { default: colors.busyStrong, ":hover:not(:disabled)": "#ffffff" },
  },
  spinner: {
    animationDuration: "800ms",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
});

/**
 * Accessible button with variants, sizes and a loading state.
 *
 * @param props - Button props.
 * @returns The button.
 */
export function Button({
  variant = "secondary",
  size = "md",
  isFullWidth = false,
  isLoading = false,
  icon,
  trailingIcon,
  xstyle,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <BaseButton
      {...rest}
      disabled={disabled === true || isLoading}
      focusableWhenDisabled={isLoading}
      aria-busy={isLoading || undefined}
      {...stylex.props(styles.base, styles[size], styles[variant], isFullWidth && styles.fullWidth, xstyle)}
    >
      {isLoading ? <LoaderCircle size={18} aria-hidden {...stylex.props(styles.spinner)} /> : icon}
      {children}
      {trailingIcon}
    </BaseButton>
  );
}
