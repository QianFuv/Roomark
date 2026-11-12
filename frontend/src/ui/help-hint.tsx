/**
 * Small question-mark button beside a title that reveals a short explanation: on hover with a
 * mouse, on tap or click everywhere, and from the keyboard (Enter / Space). Escape or a tap
 * outside closes it. The icon is small but the hit area is 44 px.
 *
 * @module
 */
import { Popover } from "@animate-ui/react/primitives/base-ui/popover";
import * as stylex from "@stylexjs/stylex";
import { CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useOverlayHistory } from "../app/overlay-history";
import { colors, fonts, radii, sizes, space } from "../styles/tokens.stylex";
import { text } from "./typography";

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: radii.pill,
    borderWidth: 0,
    color: {
      default: colors.textMuted,
      ":hover": colors.primaryText,
      "[data-popup-open]": colors.primaryText,
    },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: sizes.control,
    justifyContent: "center",
    marginBlock: `calc(-1 * ${space.md})`,
    marginInlineEnd: 0,
    marginInlineStart: `calc(-1 * ${space.md})`,
    outline: "none",
    padding: 0,
    verticalAlign: "middle",
    width: sizes.control,
  },
  icon: {
    borderRadius: radii.pill,
    display: "inline-flex",
    outline: { default: "none", [stylex.when.ancestor(":focus-visible")]: `2px solid ${colors.focusRing}` },
  },
  positioner: { outline: "none", zIndex: 95 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 10px 28px ${colors.shadowStrong}`,
    color: colors.text,
    fontFamily: fonts.sans,
    maxWidth: `min(280px, calc(100vw - ${space.xl}))`,
    outline: "none",
    paddingBlock: space.sm,
    paddingInline: space.md,
  },
});

/**
 * Help button with a popover.
 *
 * @param props - Hint props.
 * @param props.topic - What the hint is about; the button is named `关于{topic}`.
 * @param props.children - The explanation.
 * @returns The button.
 */
export function HelpHint({ topic, children }: { topic: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFromHover, setIsFromHover] = useState(false);

  useOverlayHistory(isOpen && !isFromHover, () => setIsOpen(false));

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(open: boolean, details: { reason: string }) => {
        setIsFromHover(open && details.reason === "trigger-hover");
        setIsOpen(open);
      }}
    >
      <Popover.Trigger
        openOnHover
        delay={150}
        aria-label={`关于${topic}`}
        {...stylex.props(stylex.defaultMarker(), styles.trigger)}
      >
        <span {...stylex.props(styles.icon)}>
          <CircleHelp aria-hidden />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={2} {...stylex.props(styles.positioner)}>
          <Popover.Popup {...stylex.props(text.body, styles.popup)}>{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
