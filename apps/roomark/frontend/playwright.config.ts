/**
 * Playwright end-to-end configuration. Runs against a real Roomark server build
 * (`wails3 task build:server`, path in ROOMARK_E2E_SERVER) with a fresh SQLite database.
 *
 * @module
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = 18_090;

const SERVER =
  process.env["ROOMARK_E2E_SERVER"] ?? path.resolve(import.meta.dirname, "../bin/roomark-server.exe");

const DATABASE = path.join(mkdtempSync(path.join(tmpdir(), "roomark-e2e-")), "e2e.db");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.tsx",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      testIgnore: "**/layout.spec.tsx",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `"${SERVER}"`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ROOMARK_DB: DATABASE,
      ROOMARK_PUBLIC_URL: `http://127.0.0.1:${PORT}`,
      ROOMARK_ADMIN_NAME: "管理员",
      ROOMARK_ADMIN_PASSCODE: "123456",
      ROOMARK_TRUSTED_PROXIES: "127.0.0.0/8,::1/128",
      WAILS_SERVER_HOST: "127.0.0.1",
      WAILS_SERVER_PORT: String(PORT),
    },
  },
});
