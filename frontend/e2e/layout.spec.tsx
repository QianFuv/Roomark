/**
 * Layout audit (desktop project only; it sets its own viewports) with realistic data (30 people,
 * 50 bookings, announcements). Every main page at 390×844, 1024×768, 1440×900 and 1440×1600, in
 * light and dark, must:
 *
 * - not scroll horizontally, and on no element let content escape its box ({@link findOverflow});
 *   only the calendar's paging region may scroll sideways;
 * - leave no unfilled band ({@link findBlankBands}): side-by-side columns end together, a
 *   `data-fill="viewport"` workspace reaches the bottom of the window, and the side navigation's
 *   background reaches the bottom of the document.
 *
 * It also opens one overlay window of each kind (login, booking detail, confirmation, admin
 * editor) at 390×844, 1024×768 and 1440×900, checks it with axe, and saves screenshots when
 * `ROOMARK_SCREENSHOT_DIR` is set.
 *
 * @module
 */
import path from "node:path";

import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import {
  ADMIN_PASSCODE,
  LISI_PASSCODE,
  ROOM_SLUG,
  expectAccessible,
  findBlankBands,
  findOverflow,
  seed,
  tomorrow,
  type Seeded,
} from "./support";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1440, height: 1600 },
] as const;

const STORAGE_KEY = "roomark.state.v1";

const EXTRA_PEOPLE = Array.from({ length: 30 }, (_unused, index) => ({
  name: `审计成员${String(index + 1).padStart(2, "0")}`,
  role: index % 3 === 0 ? "teacher" : "student",
  isAdmin: false,
}));

/** Daily slots of the audit bookings, clear of the times other specs use. */
const AUDIT_SLOTS = [
  ["08:00", "09:00"],
  ["11:00", "12:00"],
  ["13:00", "14:30"],
  ["15:00", "16:00"],
  ["19:00", "20:00"],
] as const;

let seeded: Seeded;

/**
 * Date `days` from today in Asia/Shanghai.
 *
 * @param days - Offset in days.
 * @returns `YYYY-MM-DD`.
 */
function shanghaiDate(days: number): string {
  return new Date(Date.now() + 8 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Add 30 people, 50 bookings (10 of them 李四's) and two announcements; repeated runs only add
 * what is missing.
 *
 * @param request - API context.
 * @param data - Tokens from {@link seed}.
 */
async function seedVolume(request: APIRequestContext, data: Seeded): Promise<void> {
  const admin = { Authorization: `Bearer ${data.adminToken}`, "X-Room-Token": data.roomToken };

  await request.post("/api/admin/people/import", { headers: admin, data: { people: EXTRA_PEOPLE } });

  // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
  const people = (await (await request.get("/api/admin/people", { headers: admin })).json()) as {
    id: number;
    name: string;
  }[];

  const members = people.filter((person) => person.name.startsWith("审计成员") || person.name === "李四");
  let index = 0;

  for (let day = 3; day <= 12; day += 1) {
    for (const [start, end] of AUDIT_SLOTS) {
      const person =
        index % 5 === 0 ? people.find((item) => item.name === "李四") : members[index % members.length];

      index += 1;
      await request.post(`/api/rooms/${ROOM_SLUG}/bookings`, {
        headers: admin,
        data: {
          start: `${shanghaiDate(day)}T${start}:00+08:00`,
          end: `${shanghaiDate(day)}T${end}:00+08:00`,
          title: `审计会议 ${index}`,
          onBehalfOf: person?.id,
        },
      });
    }
  }

  // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
  const announcements = (await (
    await request.get("/api/admin/announcements", { headers: admin })
  ).json()) as {
    title: string;
  }[];

  for (const title of ["本周五下午消杀，暂停使用", "投影仪遥控器在前台"]) {
    if (announcements.some((item) => item.title === title)) continue;

    await request.post("/api/admin/announcements", {
      headers: admin,
      data: {
        title,
        body: "",
        roomSlug: ROOM_SLUG,
        pinned: title.startsWith("本周"),
        startsAt: `${shanghaiDate(-1)}T00:00:00+08:00`,
        endsAt: `${shanghaiDate(7)}T00:00:00+08:00`,
      },
    });
  }
}

test.beforeAll(async ({ request }) => {
  seeded = await seed(request);
  await seedVolume(request, seeded);
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

test("given the main pages at every tier, height and theme when audited then nothing overflows and no band is left unfilled", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(600_000);

  const lisi = await sessionFor(request, "李四", LISI_PASSCODE);
  const admin = await sessionFor(request, "管理员", ADMIN_PASSCODE);
  const findings: string[] = [];

  /**
   * Record overflow and blank bands on a page.
   *
   * @param page - The page.
   * @param where - Page name for the report.
   */
  async function audit(page: Page, where: string): Promise<void> {
    await page.waitForTimeout(400);

    for (const item of await findOverflow(page)) {
      findings.push(
        `${where}: overflow ${item.element} "${item.text}" ${item.scrollWidth}>${item.clientWidth}`,
      );
    }

    for (const band of await findBlankBands(page)) findings.push(`${where}: blank ${band}`);
  }

  for (const scheme of ["light", "dark"] as const) {
    for (const viewport of VIEWPORTS) {
      const tag = `${viewport.width}x${viewport.height}-${scheme}`;
      const base = { baseURL: baseURL ?? "", viewport, scheme };
      const anonymous = await openAs(browser, { ...base, session: undefined });

      await anonymous.goto(`/r/${ROOM_SLUG}`);
      await expect(anonymous.getByRole("region", { name: "当前状态" })).toBeVisible();
      await expect(anonymous.getByText(/ 10:00，已约 /).first()).toBeAttached();
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
      await expect(anonymous.getByRole("dialog", { name: "登录" })).toBeVisible();
      await audit(anonymous, `identity sheet ${tag}`);
      await anonymous.goto("/?add=true");
      await expect(anonymous.getByText("房间码", { exact: true })).toBeVisible();
      await audit(anonymous, `add room ${tag}`);
      await anonymous.context().close();

      const member = await openAs(browser, { ...base, session: lisi });

      await member.goto(`/r/${ROOM_SLUG}/calendar`);
      await expect(member.getByRole("region", { name: /的预约$/ })).toBeVisible();
      await audit(member, `calendar ${tag}`);
      await member.goto(`/r/${ROOM_SLUG}`);
      await expect(member.getByRole("region", { name: "当前状态" })).toBeVisible();
      await member.getByRole("button", { name: /^账户/ }).first().click();
      await expect(member.getByRole("menu")).toBeVisible();
      await audit(member, `account menu ${tag}`);
      await member.keyboard.press("Escape");
      await member.goto("/me");
      await expect(member.getByRole("heading", { level: 1, name: "我的预约" })).toBeVisible();
      await audit(member, `me ${tag}`);
      await member.context().close();

      const manager = await openAs(browser, { ...base, session: admin });

      for (const [path, heading] of [
        ["/admin/rooms", "房间"],
        ["/admin/people", "名单"],
        ["/admin/bookings", "预约"],
        ["/admin/announcements", "公告"],
        ["/admin/stats", "统计"],
      ] as const) {
        await manager.goto(path);
        await expect(manager.getByRole("heading", { level: 1, name: heading })).toBeVisible();

        if (path === "/admin/stats")
          await expect(
            manager.getByRole("region", { name: "概览" }).or(manager.getByText("这个范围内没有预约")),
          ).toBeVisible();

        await audit(manager, `${path} ${tag}`);
      }

      await manager.goto("/admin/rooms");
      await manager.getByRole("button", { name: "导出二维码" }).first().click();
      await expect(manager.getByRole("img", { name: /海报预览/ })).toBeVisible();
      await audit(manager, `qr export ${tag}`);
      await manager.context().close();
    }
  }

  expect(findings).toEqual([]);
});

test("given each kind of overlay window at every tier when opened then it passes axe (and is captured on request)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(600_000);

  const lisi = await sessionFor(request, "李四", LISI_PASSCODE);
  const admin = await sessionFor(request, "管理员", ADMIN_PASSCODE);
  const directory = process.env["ROOMARK_SCREENSHOT_DIR"];

  /**
   * Check the open overlay window with axe and save a screenshot when a directory is configured.
   *
   * @param page - The page.
   * @param name - File name without extension.
   */
  async function capture(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(600);
    await expectAccessible(page, '[role="dialog"], [role="alertdialog"]');

    if (directory !== undefined) await page.screenshot({ path: path.join(directory, `${name}.png`) });
  }

  for (const [viewport, schemes] of [
    [{ width: 390, height: 844 }, ["light", "dark"]],
    [{ width: 1024, height: 768 }, ["light"]],
    [{ width: 1440, height: 900 }, ["light", "dark"]],
  ] as const) {
    for (const scheme of schemes) {
      const tag = `${viewport.width}x${viewport.height}-${scheme}`;
      const base = { baseURL: baseURL ?? "", viewport, scheme };
      const anonymous = await openAs(browser, { ...base, session: undefined });

      await anonymous.goto(`/r/${ROOM_SLUG}`);
      await anonymous.getByRole("button", { name: "登录" }).first().click();
      await expect(anonymous.getByRole("dialog", { name: "登录" })).toBeVisible();
      await capture(anonymous, `login-${tag}`);
      await anonymous.context().close();

      const member = await openAs(browser, { ...base, session: lisi });

      await member.goto("/me");
      await member.getByRole("tabpanel").getByRole("button").first().click();

      const detail = member.getByRole("dialog");

      await expect(detail).toBeVisible();
      await capture(member, `booking-detail-${tag}`);
      await detail.getByRole("button", { name: /^(取消预约|提前结束)$/ }).click();

      const confirm = member.getByRole("alertdialog");

      await expect(confirm).toBeVisible();
      await capture(member, `confirm-${tag}`);
      await confirm.getByRole("button", { name: "取消", exact: true }).click();
      await expect(confirm).toBeHidden();
      await member.context().close();

      const manager = await openAs(browser, { ...base, session: admin });

      await manager.goto("/admin/rooms");
      await manager.getByRole("button", { name: "编辑", exact: true }).first().click();
      await expect(manager.getByRole("dialog", { name: "编辑房间" })).toBeVisible();
      await capture(manager, `admin-room-editor-${tag}`);
      await manager.context().close();
    }
  }
});
