/**
 * Layout tier of the viewport, for the few places where the tiers differ in structure rather than
 * style (the StyleX `media.narrow` / `media.wide` queries cover the rest), and the live
 * reduced-motion preference for script-driven animation.
 *
 * @module
 */
import { useSyncExternalStore } from "react";

/** Mobile < 768 px, narrow 768–1279 px, wide ≥ 1280 px. */
export type LayoutTier = "mobile" | "narrow" | "wide";

const NARROW_QUERY = "(min-width: 768px)";

const WIDE_QUERY = "(min-width: 1280px)";

/**
 * Current tier from the media queries.
 *
 * @returns The tier.
 */
function currentTier(): LayoutTier {
  if (window.matchMedia(WIDE_QUERY).matches) return "wide";

  return window.matchMedia(NARROW_QUERY).matches ? "narrow" : "mobile";
}

/**
 * Re-render when the tier changes.
 *
 * @param onChange - Store callback.
 * @returns Unsubscribe.
 */
function subscribe(onChange: () => void): () => void {
  const lists = [window.matchMedia(NARROW_QUERY), window.matchMedia(WIDE_QUERY)];

  lists.forEach((list) => list.addEventListener("change", onChange));

  return () => lists.forEach((list) => list.removeEventListener("change", onChange));
}

/**
 * The viewport's layout tier, updated on resize.
 *
 * @returns The tier.
 */
export function useLayoutTier(): LayoutTier {
  return useSyncExternalStore(subscribe, currentTier, () => "mobile");
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Re-render when the reduced-motion preference changes.
 *
 * @param onChange - Store callback.
 * @returns Unsubscribe.
 */
function subscribeReducedMotion(onChange: () => void): () => void {
  const list = window.matchMedia(REDUCED_MOTION_QUERY);

  list.addEventListener("change", onChange);

  return () => list.removeEventListener("change", onChange);
}

/**
 * Whether the user asks for reduced motion, updated live when the setting changes.
 *
 * @returns `true` to skip animations.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}
