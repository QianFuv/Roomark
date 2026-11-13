/**
 * Keep Animate UI highlights in step with the theme.
 *
 * Animate UI paints hover and selection highlights (menu items, menu and popover triggers,
 * segmented controls, tabs, selects) as separate elements whose colour is a snapshot of the
 * control's computed `background-color`, taken when the control's state attributes change. A
 * theme switch changes the tokens behind that colour but no attribute, so a control that is
 * hovered, highlighted or selected at that moment kept the previous theme's colour. After every
 * theme change this re-announces the observed state attributes with their current values, which
 * makes each highlight read its colour again from the new tokens.
 *
 * @module
 */
import { useTheme } from "next-themes";
import { useEffect } from "react";

/** Attributes Animate UI watches on hover and item highlights. */
const ITEM_ATTRIBUTES = ["data-highlighted", "aria-expanded", "data-popup-open", "data-pressed"] as const;

/** Root of Animate UI's segmented / tab / toggle-group surfaces; it re-reads on `class` changes. */
const SURFACE_ROOT = "[data-animate-ui-surfaces]";

/** Re-announce state attributes so every highlight samples the current theme's colours. */
function resyncHighlights(): void {
  for (const name of ITEM_ATTRIBUTES) {
    for (const element of document.querySelectorAll(`[${name}]`)) {
      element.setAttribute(name, element.getAttribute(name) ?? "");
    }
  }

  for (const root of document.querySelectorAll(SURFACE_ROOT)) {
    root.setAttribute("class", root.getAttribute("class") ?? "");
  }
}

/**
 * Resync highlights after the resolved theme changes (menu choice or system setting).
 *
 * @returns Nothing to render.
 */
export function ThemeResync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(resyncHighlights);
    });

    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return null;
}
