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
import { colors, fonts, media, radii } from "../styles/tokens.stylex";

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
    width: { default: "100%", [media.narrow]: "min(560px, 100% - 32px)" },
  },
  popupWide: {
    width: { default: "100%", [media.narrow]: "min(720px, 100% - 32px)" },
  },
  handle: {
    backgroundColor: colors.borderStrong,
    borderRadius: radii.pill,
    flexShrink: 0,
    height: 5,
    marginInline: "auto",
    marginTop: 8,
    width: 40,
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: 12,
    paddingBlock: 12,
    paddingInline: 20,
  },
  headings: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 4, minWidth: 0 },
  title: { fontSize: fonts.sizeXl, fontWeight: 700, lineHeight: 1.3 },
  description: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.5 },
  close: {
    alignItems: "center",
    backgroundColor: { default: colors.surfaceMuted, ":hover": colors.surfaceHover },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    width: 36,
  },
  content: {
    flexGrow: 1,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBottom: 20,
    paddingInline: 20,
  },
  footer: {
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: 8,
    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
    paddingInline: 20,
    paddingTop: 12,
  },
  safeBottom: { paddingBottom: "max(20px, env(safe-area-inset-bottom))" },
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
                  <Drawer.Title {...stylex.props(styles.title)}>{title}</Drawer.Title>
                  {description === undefined ? null : (
                    <Drawer.Description {...stylex.props(styles.description)}>
                      {description}
                    </Drawer.Description>
                  )}
                </div>
                <Drawer.Close aria-label="关闭" {...stylex.props(styles.close)}>
                  <X size={18} aria-hidden />
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
