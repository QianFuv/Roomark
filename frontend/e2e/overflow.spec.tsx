/**
 * Layout audit (desktop project only; it sets its own viewports): on the main pages, at 390, 1024
 * and 1440 px in light and dark, no visible element may let its content escape horizontally
 * (buttons, chips, cards, table cells, sheets).
 *
 * @module
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import {
  ADMIN_PASSCODE,
  LISI_PASSCODE,
  ROOM_SLUG,
  findOverflow,
  seed,
  tomorrow,
  type OverflowFinding,
  type Seeded,
} from "./support";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 800 },
  { width: 1440, height: 900 },
] as const;

const STORAGE_KEY = "roomark.state.v1";

let seeded: Seeded;

test.beforeAll(async ({ request }) => {
  seeded = await seed(request);
});

/**
 * Sign in through the API and return the stored session, waiting out the per-IP login limit that
 * the other specs may have used up.
 *
 * @param request - API context.
 * @param name - Person name.
 * @param passcode - Passcode.
 * @returns The session JSON.
 */
async function sessionFor(request: APIRequestContext, name: string, passcode: string): Promise<unknown> {
  let session: unknown;

  await expect(async () => {
    const response = await request.post("/api/sessions", { data: { name, passcode } });

    expect(response.ok(), await response.text()).toBeTruthy();
    session = await response.json();
  }).toPass({ intervals: [7_000], timeout: 60_000 });

  return session;
}

/**
 * Open a page in a fresh context whose stored client state holds the room and an optional session.
 *
 * @param browser - The browser.
 * @param options - Context options.
 * @param options.baseURL - Server URL.
 * @param options.viewport - Viewport size.
 * @param options.scheme - Color scheme.
 * @param options.session - Session to store, or `undefined` for none.
 * @returns The page.
 */
async function openAs(
  browser: Browser,
  options: {
    baseURL: string;
    viewport: { width: number; height: number };
    scheme: "light" | "dark";
    session: unknown;
  },
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: options.baseURL,
    viewport: options.viewport,
    colorScheme: options.scheme,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  });

  const state = JSON.stringify({
    session: options.session,
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
    lastRoomSlug: ROOM_SLUG,
    recentTitles: ["组会", "论文讨论"],
  });

  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    STORAGE_KEY,
    state,
  ] as const);

  return context.newPage();
}

test("given the main pages at every tier and theme when audited then no content overflows its box", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(300_000);

  const lisi = await sessionFor(request, "李四", LISI_PASSCODE);
  const admin = await sessionFor(request, "管理员", ADMIN_PASSCODE);
  const findings: string[] = [];

  /**
   * Record overflow on a page.
   *
   * @param page - The page.
   * @param where - Page name for the report.
   */
  async function audit(page: Page, where: string): Promise<void> {
    await page.waitForTimeout(300);

    const found: OverflowFinding[] = await findOverflow(page);

    for (const item of found) {
      findings.push(`${where}: ${item.element} "${item.text}" ${item.scrollWidth}>${item.clientWidth}`);
    }
  }

  for (const scheme of ["light", "dark"] as const) {
    for (const viewport of VIEWPORTS) {
      const tag = `${viewport.width}-${scheme}`;
      const base = { baseURL: baseURL ?? "", viewport, scheme };
      const anonymous = await openAs(browser, { ...base, session: undefined });

      await anonymous.goto(`/r/${ROOM_SLUG}`);
      await expect(anonymous.getByRole("region", { name: "当前状态" })).toBeVisible();
      await anonymous
        .getByRole("region", { name: "会议热力图" })
        .getByRole("button", { name: /会议热力图/ })
        .click();
      await expect(anonymous.getByText(/ 10:00 已预约 /).first()).toBeAttached();
      await audit(anonymous, `room home ${tag}`);
      await anonymous.goto(`/r/${ROOM_SLUG}/book?date=${tomorrow()}&start=10:00&end=11:00`);
      await expect(anonymous.getByRole("region", { name: "时段冲突" })).toBeVisible();
      await audit(anonymous, `booking conflict ${tag}`);
      await anonymous.getByRole("textbox", { name: "用途" }).fill("排版检查");
      await anonymous
        .getByRole("button", { name: /^当天 / })
        .first()
        .click();
      await anonymous.getByRole("button", { name: /^预约$/ }).click();
      await expect(anonymous.getByRole("dialog", { name: "你是谁？" })).toBeVisible();
      await audit(anonymous, `identity sheet ${tag}`);
      await anonymous.context().close();

      const member = await openAs(browser, { ...base, session: lisi });

      await member.goto(`/r/${ROOM_SLUG}/calendar`);
      await expect(member.getByRole("region", { name: /的预约$/ })).toBeVisible();
      await audit(member, `calendar ${tag}`);
      await member.goto("/me");
      await expect(member.getByRole("heading", { level: 1 })).toBeVisible();
      await audit(member, `me ${tag}`);
      await member.context().close();

      const manager = await openAs(browser, { ...base, session: admin });

      for (const [path, heading] of [
        ["/admin/rooms", "房间"],
        ["/admin/people", "名单"],
        ["/admin/bookings", "预约"],
        ["/admin/stats", "统计"],
      ] as const) {
        await manager.goto(path);
        await expect(manager.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await audit(manager, `${path} ${tag}`);
      }

      await manager.context().close();
    }
  }

  expect(findings).toEqual([]);
});
