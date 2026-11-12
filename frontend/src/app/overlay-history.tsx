/**
 * Back closes overlays first. Opening a sheet, dialog, popover or menu pushes a history entry
 * that carries the overlay depth in its state (same URL, no scroll reset); browser, mouse,
 * keyboard and Android back then pop that entry and close the topmost overlay instead of leaving
 * the page. Closing an overlay normally removes its entry again with one `history.back()`, unless
 * a navigation already moved on.
 *
 * @module
 */
import { useRouter, type AnyRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { isFiniteNumber, isRecord } from "../lib/guards";

/** History state key holding the number of open overlays at that entry. */
const OVERLAY_KEY = "roomarkOverlay";

/** One open overlay. */
interface OverlayEntry {
  depth: number;
  close: () => void;
}

const stack: OverlayEntry[] = [];

const watchedRouters = new WeakSet<AnyRouter>();

/** Callbacks waiting for an overlay entry to leave the history. */
let settledWaiters: (() => void)[] = [];

/**
 * Overlay depth stored in a history state.
 *
 * @param state - History state.
 * @returns The depth, 0 for a plain page entry.
 */
export function overlayDepth(state: unknown): number {
  const value = isRecord(state) ? state[OVERLAY_KEY] : undefined;

  return isFiniteNumber(value) ? value : 0;
}

/**
 * Close overlays above the depth of the current entry whenever the history moves.
 *
 * @param router - The router.
 */
function watch(router: AnyRouter): void {
  if (watchedRouters.has(router)) return;

  watchedRouters.add(router);
  router.history.subscribe(() => {
    const depth = overlayDepth(router.history.location.state);

    while (stack.length > depth) stack.pop()?.close();

    const waiters = settledWaiters;

    settledWaiters = [];
    waiters.forEach((resolve) => resolve());
  });
}

/**
 * Resolve once a pending overlay entry has left the history (immediately when none is pending).
 *
 * @returns A promise.
 */
export function overlayHistorySettled(): Promise<void> {
  return new Promise((resolve) => {
    if (!isBackPending) {
      resolve();

      return;
    }

    settledWaiters.push(resolve);
  });
}

let isBackPending = false;

/**
 * Run an action once the overlay that triggered it has closed and left the history, e.g. a menu
 * item that opens a sheet or navigates.
 *
 * @param action - The action.
 */
export function afterOverlayClosed(action: () => void): void {
  window.setTimeout(() => void overlayHistorySettled().then(action), 0);
}

/**
 * Give an overlay a history entry while it is open, so back closes it.
 *
 * @param isOpen - Whether the overlay is open.
 * @param onClose - Close the overlay (called when the user goes back).
 */
export function useOverlayHistory(isOpen: boolean, onClose: () => void): void {
  // JUSTIFICATION: without a router (isolated component tests) the overlay simply gets no entry.
  const router = useRouter({ warn: false }) as AnyRouter | null | undefined;
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen || router === undefined || router === null) return undefined;

    watch(router);

    const entry: OverlayEntry = { depth: stack.length + 1, close: () => closeRef.current() };

    stack.push(entry);
    void router.navigate({
      to: ".",
      search: true,
      params: true,
      hash: true,
      state: (previous) => ({ ...previous, [OVERLAY_KEY]: entry.depth }),
      resetScroll: false,
      ignoreBlocker: true,
    });

    return () => {
      const index = stack.indexOf(entry);

      if (index === -1) return;

      stack.splice(index, 1);

      if (overlayDepth(router.history.location.state) !== entry.depth) return;

      isBackPending = true;
      settledWaiters.push(() => {
        isBackPending = false;
      });
      router.history.back({ ignoreBlocker: true });
    };
  }, [isOpen, router]);
}
