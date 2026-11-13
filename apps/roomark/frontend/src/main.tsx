/**
 * Application entry: detect the platform, configure the API base URL and render the router.
 *
 * @module
 */
import "./styles/base.css";

import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { setServerBaseUrl } from "./api/client";
import { loadPlatform } from "./platform/platform";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * Start the application.
 */
async function start(): Promise<void> {
  if (import.meta.env.MODE === "mock") await startMockApi();

  const detected = await loadPlatform();

  setServerBaseUrl(detected.serverUrl);

  const rootElement = document.getElementById("root");

  if (rootElement === null) return;

  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

/**
 * Serve the API from MSW handlers (`vp dev --mode mock`), for working without the Go server.
 */
async function startMockApi(): Promise<void> {
  const { setupWorker } = await import("msw/browser");
  const { handlers, MOCK_SLUG, MOCK_TOKEN } = await import("./mocks/handlers");
  const { rememberRoom } = await import("./state/app-store");

  await setupWorker(...handlers).start({ onUnhandledFrame: "bypass" });
  rememberRoom(MOCK_SLUG, MOCK_TOKEN);
}

void start();
