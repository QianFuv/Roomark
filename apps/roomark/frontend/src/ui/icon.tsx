/**
 * Icon rules: lucide-react only, one stroke width app-wide (set by `IconDefaults`) and a fixed size
 * per context from {@link ICON_SIZE}. The default size is `control`, so icons in buttons and inline
 * with body text need no `size` prop.
 *
 * @module
 */
import { LucideProvider } from "lucide-react";
import type { ReactNode } from "react";

/** Icon sizes by context, in pixels. */
export const ICON_SIZE = {
  /** Inline with meta text (12 px). */
  meta: 14,
  /** Inline with body text and inside buttons, inputs and menus; the default. */
  control: 16,
  /** Navigation items and tabs. */
  nav: 18,
  /** Empty and error states. */
  empty: 32,
} as const;

/** Stroke width of every icon. */
const ICON_STROKE_WIDTH = 1.75;

/**
 * Provide the app-wide icon defaults.
 *
 * @param props - Provider props.
 * @param props.children - The app.
 * @returns The provider.
 */
export function IconDefaults({ children }: { children: ReactNode }) {
  return (
    <LucideProvider size={ICON_SIZE.control} strokeWidth={ICON_STROKE_WIDTH}>
      {children}
    </LucideProvider>
  );
}
