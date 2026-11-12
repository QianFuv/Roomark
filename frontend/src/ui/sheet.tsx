/**
 * Bottom sheet (Animate UI drawer on Base UI). On wide screens it becomes a centered panel
 * docked to the bottom edge.
 *
 * @module
 */
import { Drawer } from "@animate-ui/react/primitives/base-ui/drawer";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { useOverlayHistory } from "../app/overlay-history";
import { colors, fonts, media, radii, sizes, space } from "../styles/tokens.stylex";
import { text } from "./typography";

/** Props of {@link Sheet}. */
export interface SheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  isWide?: boolean;
}

const styles = stylex.create({
  backdrop: {
    backdropFilter: "blur(2px)",
    backgroundColor: colors.scrim,
    inset: 0,
    position: "fixed",
    zIndex: 50,
  },
  viewport: {
    alignItems: "flex-end",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    position: "fixed",
    zIndex: 50,
  },
  popup: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.extraLarge,
    borderTopRightRadius: radii.extraLarge,
    boxShadow: `0 -8px 40px ${colors.shadowStrong}`,
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    maxHeight: "92dvh",
    outline: "none",
    width: { default: "100%", [media.narrow]: `min(560px, 100% - ${space.xxl})` },
  },
  popupWide: {
    width: { default: "100%", [media.narrow]: `min(720px, 100% - ${space.xxl})` },
  },
  handle: {
    backgroundColor: colors.borderStrong,
    borderRadius: radii.pill,
    flexShrink: 0,
    height: 5,
    marginInline: "auto",
    marginTop: space.sm,
    width: 40,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: space.md,
    paddingBlock: space.md,
    paddingInline: space.cardPadding,
  },
  headings: { display: "flex", flexDirection: "column", flexGrow: 1, gap: space.xxs, minWidth: 0 },
  title: { paddingTop: space.xs },
  description: { color: colors.textMuted },
  close: {
    alignItems: "center",
    backgroundColor: { default: colors.surfaceMuted, ":hover": colors.surfaceHover },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: sizes.controlSmall,
    justifyContent: "center",
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: sizes.controlSmall,
  },
  content: {
    flexGrow: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBottom: space.cardPadding,
    paddingInline: space.cardPadding,
  },
  footer: {
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: space.controlGap,
    paddingBottom: `max(${space.md}, env(safe-area-inset-bottom))`,
    paddingInline: space.cardPadding,
    paddingTop: space.md,
  },
  safeBottom: { paddingBottom: `max(${space.cardPadding}, env(safe-area-inset-bottom))` },
});

/**
 * Modal bottom sheet with a title, scrollable body and optional sticky footer.
 *
 * @param props - Sheet props.
 * @returns The sheet.
 */
export function Sheet({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  isWide = false,
}: SheetProps) {
  useOverlayHistory(isOpen, () => onOpenChange(false));

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => onOpenChange(open)} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop {...stylex.props(styles.backdrop)} />
        <Drawer.Viewport {...stylex.props(styles.viewport)}>
          <Drawer.VirtualKeyboardProvider>
            <Drawer.Popup {...stylex.props(styles.popup, isWide && styles.popupWide)}>
              <div aria-hidden {...stylex.props(styles.handle)} />
              <div {...stylex.props(styles.header)}>
                <div {...stylex.props(styles.headings)}>
                  <Drawer.Title {...stylex.props(text.title, styles.title)}>{title}</Drawer.Title>
                  {description === undefined ? null : (
                    <Drawer.Description {...stylex.props(text.body, styles.description)}>
                      {description}
                    </Drawer.Description>
                  )}
                </div>
                <Drawer.Close aria-label="关闭" {...stylex.props(styles.close)}>
                  <X aria-hidden />
                </Drawer.Close>
              </div>
              <Drawer.Content {...stylex.props(styles.content, footer === undefined && styles.safeBottom)}>
                {children}
              </Drawer.Content>
              {footer === undefined ? null : <div {...stylex.props(styles.footer)}>{footer}</div>}
            </Drawer.Popup>
          </Drawer.VirtualKeyboardProvider>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
