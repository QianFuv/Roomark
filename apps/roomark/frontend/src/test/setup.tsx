/**
 * Vitest browser-mode setup: MSW worker and clean client state per test.
 *
 * @module
 */
import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll } from "vite-plus/test";

import { queryClient } from "../api/client";
import { handlers, resetMockState } from "../mocks/handlers";
import { appStore } from "../state/app-store";

/** Mock service worker shared by all tests. */
export const worker = setupWorker(...handlers);

beforeAll(async () => {
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
});

afterEach(() => {
  worker.resetHandlers();
  resetMockState();
  queryClient.clear();
  appStore.setState(() => ({ rooms: {} }));
  localStorage.clear();
});

afterAll(async () => {
  await worker.stop();
});
