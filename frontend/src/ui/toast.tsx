/**
 * Toast notifications (Animate UI toast on Base UI). Use {@link notify} from anywhere and render
 * {@link ToastHost} once near the root.
 *
 * @module
 */
import { Toast } from "@animate-ui/react/primitives/base-ui/toast";
import * as stylex from "@stylexjs/stylex";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import type { ReactNode } from "react";

import { colors, fonts, radii } from "../styles/tokens.stylex";

/** Kind of toast. */
export type ToastTone = "success" | "error" | "info";

const toastManager = Toast.createToastManager();

/**
 * Show a toast.
 *
 * @param tone - Visual tone.
 * @param title - Main text.
 * @param description - Secondary text.
 */
export function notify(tone: ToastTone, title: string, description?: string): void {
  toastManager.add({
    title,
    description,
    type: tone,
    timeout: tone === "error" ? 6000 : 3500,
    priority: tone === "error" ? "high" : "low",
  });
}

const styles = stylex.create({
  viewport: {
    bottom: "max(16px, env(safe-area-inset-bottom))",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    left: "50%",
    maxWidth: "calc(100vw - 24px)",
    position: "fixed",
    translate: "-50% 0",
    width: 420,
    zIndex: 70,
  },
  root: {
    alignItems: "flex-start",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 10px 30px ${colors.shadowStrong}`,
    color: colors.text,
    display: "flex",
    fontFamily: fonts.sans,
    gap: 10,
    paddingBlock: 12,
    paddingInline: 14,
  },
  content: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 2, minWidth: 0 },
  title: { fontSize: fonts.sizeMd, fontWeight: 600, lineHeight: 1.4, margin: 0 },
  description: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.4, margin: 0 },
  success: { color: colors.free },
  error: { color: colors.busy },
  info: { color: colors.info },
  icon: { flexShrink: 0, marginTop: 1 },
  close: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: colors.textSubtle,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
});

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CircleCheck size={20} aria-hidden />,
  error: <CircleAlert size={20} aria-hidden />,
  info: <Info size={20} aria-hidden />,
};

/**
 * Whether a toast type is one of ours.
 *
 * @param value - The toast's `type`.
 * @returns `true` for known tones.
 */
function isTone(value: string | undefined): value is ToastTone {
  return value === "success" || value === "error" || value === "info";
}

/**
 * Renders the toast list.
 *
 * @returns The toasts.
 */
function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => {
    const tone = isTone(toast.type) ? toast.type : "info";

    return (
      <Toast.Root key={toast.id} toast={toast} {...stylex.props(styles.root)}>
        <span {...stylex.props(styles.icon, styles[tone])}>{ICONS[tone]}</span>
        <Toast.Content {...stylex.props(styles.content)}>
          <Toast.Title {...stylex.props(styles.title)} />
          <Toast.Description {...stylex.props(styles.description)} />
        </Toast.Content>
        <Toast.Close aria-label="关闭通知" {...stylex.props(styles.close)}>
          <X size={16} aria-hidden />
        </Toast.Close>
      </Toast.Root>
    );
  });
}

/**
 * Toast provider and viewport. Wrap the app with it.
 *
 * @param props - Children.
 * @param props.children - App content.
 * @returns The provider.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport {...stylex.props(styles.viewport)}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
