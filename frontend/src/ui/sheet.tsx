/**
 * Overlay window used by every sheet and dialog (Animate UI drawer on Base UI). Mobile shows it
 * as a bottom drawer with a grab handle that a downward swipe dismisses; narrow and wide show it
 * as a modal centered in the window that scales and fades in. Both tiers share one drawer tree,
 * so turning or resizing the window while it is open keeps its contents, focus and history entry.
 *
 * @module
 */
import { Drawer } from "@animate-ui/react/primitives/base-ui/drawer";
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { useOverlayHistory } from "../app/overlay-history";
import { colors, fonts, media, radii, sizes, space } from "../styles/tokens.stylex";
import { useLayoutTier } from "./tier";
import { text } from "./typography";

/** Props of {@link Sheet}. */
export interface SheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider centered modal for wide content (calendar export, room editor). */
  isWide?: boolean;
  /** Confirmation: `alertdialog` role, no close button, narrower, drawn above other sheets. */
  isAlert?: boolean;
  /** Give the overlay its own history entry so back closes it (off while a navigation waits on it). */
  isHistoryEntry?: boolean;
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
    alignItems: { default: "flex-end", [media.narrow]: "center" },
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: { default: 0, [media.narrow]: space.xl },
    position: "fixed",
    zIndex: 50,
  },
  alertLayer: { zIndex: 60 },
  popup: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: { default: 0, [media.narrow]: radii.extraLarge },
    borderBottomRightRadius: { default: 0, [media.narrow]: radii.extraLarge },
    borderTopLeftRadius: radii.extraLarge,
    borderTopRightRadius: radii.extraLarge,
    boxShadow: {
      default: `0 -8px 40px ${colors.shadowStrong}`,
      [media.narrow]: `0 20px 60px ${colors.shadowStrong}`,
    },
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    maxHeight: { default: "90dvh", [media.narrow]: "100%" },
    outline: "none",
    width: { default: "100%", [media.narrow]: "min(560px, 100%)" },
  },
  popupWide: { width: { default: "100%", [media.narrow]: "min(720px, 100%)" } },
  popupAlert: { width: { default: "100%", [media.narrow]: "min(440px, 100%)" } },
  modalHidden: { opacity: 0, transform: { default: "scale(0.96)", [media.reducedMotion]: "none" } },
  handle: {
    backgroundColor: colors.borderStrong,
    borderRadius: radii.pill,
    display: { default: "block", [media.narrow]: "none" },
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
    paddingBottom: space.md,
    paddingInline: space.cardPadding,
    paddingTop: { default: space.md, [media.narrow]: space.cardPadding },
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
 * Whether a popup is entering or leaving (Base UI's `data-starting-style` / `data-ending-style`).
 *
 * @param status - The popup's transition status.
 * @returns `true` while it should take its hidden pose.
 */
function isTransitioning(status: string | undefined): boolean {
  return status === "starting" || status === "ending";
}

/**
 * Modal overlay window with a title, scrollable body and optional pinned footer: a bottom drawer
 * on mobile, a centered modal on narrow and wide screens.
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
  isAlert = false,
  isHistoryEntry = true,
}: SheetProps) {
  const isDrawer = useLayoutTier() === "mobile";

  useOverlayHistory(isOpen && isHistoryEntry, () => onOpenChange(false));

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => onOpenChange(open)} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop {...stylex.props(styles.backdrop, isAlert && styles.alertLayer)} />
        <Drawer.Viewport {...stylex.props(styles.viewport, isAlert && styles.alertLayer)}>
          <Drawer.VirtualKeyboardProvider>
            <Drawer.Popup
              role={isAlert ? "alertdialog" : "dialog"}
              data-base-ui-swipe-ignore={isDrawer ? undefined : ""}
              className={(state) =>
                stylex.props(
                  styles.popup,
                  isWide && styles.popupWide,
                  isAlert && styles.popupAlert,
                  !isDrawer && isTransitioning(state.transitionStatus) && styles.modalHidden,
                ).className
              }
            >
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
                {isAlert ? null : (
                  <Drawer.Close aria-label="关闭" {...stylex.props(styles.close)}>
                    <X aria-hidden />
                  </Drawer.Close>
                )}
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
