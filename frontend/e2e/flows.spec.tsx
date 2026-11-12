/**
 * Main user flows against a real server: scan link, room status, quick use with first-time
 * identity and a required purpose, the calendar updating right after an early end, conflict
 * suggestion, recurring preview, admin QR export and stats, and the admin booking filters.
 *
 * @module
 */
import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_PASSCODE,
  LISI_PASSCODE,
  ROOM_NAME,
  ROOM_SLUG,
  expectAccessible,
  seed,
  tomorrow,
  type Seeded,
} from "./support";

let seeded: Seeded;

test.beforeAll(async ({ request }) => {
  seeded = await seed(request);
});

/**
 * Open the room through its QR link.
 *
 * @param page - The page.
 */
async function openRoom(page: Page): Promise<void> {
  await page.goto(`/r/${ROOM_SLUG}?k=${seeded.roomToken}`);
  await expect(page.getByRole("heading", { level: 1, name: ROOM_NAME })).toBeVisible();
}

/**
 * Log in through the identity sheet with an already claimed name; six digits sign in directly.
 *
 * @param page - The page.
 * @param name - Person name.
 * @param passcode - 6-digit passcode.
 */
async function identifyWithPasscode(page: Page, name: string, passcode: string): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "你是谁？" });

  await sheet.getByRole("button", { name: new RegExp(name) }).click();
  await expect(sheet.getByText("输入你的 6 位口令")).toBeVisible();
  await sheet.getByRole("textbox").first().pressSequentially(passcode);
  await expect(sheet).toBeHidden();
}

/**
 * Fill 用途 in the quick-use sheet and start.
 *
 * @param page - The page.
 * @param title - Purpose.
 */
async function startQuickUse(page: Page, title: string): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "马上使用" });

  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: "用途" }).fill(title);
  await sheet.getByRole("button", { name: /^开始使用/ }).click();
  await expect(sheet).toBeHidden();
}

test("given a QR link when the room opens then the token leaves the address bar and the status is shown", async ({
  page,
}) => {
  await openRoom(page);
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText(/空闲|使用中/);
  await expectAccessible(page);
});

test("given a free room when a first-time user taps quick use then they claim a name, give a purpose and the room becomes busy", async ({
  page,
}, testInfo) => {
  const visitor = testInfo.project.name === "mobile" ? "访客甲" : "访客乙";

  await openRoom(page);
  await page.getByRole("button", { name: /马上使用 30 分钟/ }).click();

  const identity = page.getByRole("dialog", { name: "你是谁？" });

  await expect(identity).toBeVisible();
  await identity.getByRole("searchbox", { name: "搜索姓名" }).fill(visitor.slice(0, 2));
  await identity.getByRole("button", { name: new RegExp(visitor) }).click();

  if (await identity.getByText("设置 6 位数字口令").isVisible()) {
    await expectAccessible(page);
    await identity.getByRole("textbox").first().pressSequentially("135724");
    await expect(identity.getByText("再输入一次确认")).toBeVisible();
    await identity.getByRole("textbox").first().pressSequentially("135724");
  } else {
    await identity.getByRole("textbox").first().pressSequentially("135724");
  }

  await expect(identity).toBeHidden();
  await expectAccessible(page);
  await startQuickUse(page, "临时讨论");
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText("使用中");
  await expect(page.getByRole("heading", { name: /你正在使用/ })).toBeVisible();
  await page.getByRole("button", { name: "提前结束" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "提前结束" }).click();
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText("空闲");
});

test("given my ongoing booking on the calendar when I end it early then the calendar drops the old end time at once", async ({
  page,
}) => {
  await openRoom(page);
  await page.getByRole("button", { name: /马上使用 1 小时，/ }).click();
  await identifyWithPasscode(page, "李四", LISI_PASSCODE);
  await startQuickUse(page, "日历刷新");
  await page.getByRole("link", { name: "日历" }).click();

  const block = page.getByRole("button", { name: /^\d{2}:\d{2}–\d{2}:\d{2} 日历刷新/ }).first();

  await expect(block).toBeVisible();

  const label = (await block.getAttribute("aria-label")) ?? "";
  const planned = page.getByRole("button", { name: label, exact: true });

  await block.click();
  await page.getByRole("dialog").getByRole("button", { name: "提前结束" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "提前结束" }).click();
  await expect(planned).toHaveCount(0, { timeout: 3_000 });
});

test("given a taken slot when a suggestion is tapped then only the time changes and 预约 books it", async ({
  page,
}) => {
  const bookingPosts: unknown[] = [];

  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/bookings")) {
      bookingPosts.push(request.postDataJSON());
    }
  });

  await openRoom(page);
  await page.goto(`/r/${ROOM_SLUG}/book?date=${tomorrow()}&start=10:00&end=11:00`);

  const panel = page.getByRole("region", { name: "时段冲突" });

  await expect(panel).toContainText("10:00–11:00 已被李四「组会」占用");
  await expectAccessible(page);

  const suggestion = panel.getByRole("button", { name: /^当天 / }).first();

  const range =
    /\d{2}:\d{2}–\d{2}:\d{2}/.exec((await suggestion.getAttribute("aria-label")) ?? "")?.[0] ?? "";

  await suggestion.click();
  await expect(suggestion).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByText(`已改到`)).toContainText(`${range}，可以预约`);
  await expect(page.getByText(range).first()).toBeVisible();
  expect(bookingPosts).toEqual([]);

  await page.getByRole("button", { name: /^预约$/ }).click();
  await expect(page.getByRole("textbox", { name: "用途" })).toBeFocused();
  await expect(page.getByText("请填写用途")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "用途" })).toBeInViewport();
  expect(bookingPosts).toEqual([]);

  await page.getByRole("textbox", { name: "用途" }).fill("答辩彩排");
  await page.getByRole("button", { name: /^预约$/ }).click();
  await identifyWithPasscode(page, "李四", LISI_PASSCODE);
  await expect(page.getByText("预约成功")).toBeVisible();
  expect(bookingPosts).toEqual([expect.objectContaining({ title: "答辩彩排" })]);
});

test("given a weekly rule when a week conflicts then it defaults to skip and a suggestion raises the count", async ({
  page,
}) => {
  await openRoom(page);
  await page.goto(`/r/${ROOM_SLUG}/book?date=${tomorrow()}&start=10:00&end=11:00&repeat=true`);

  await page.getByRole("button", { name: "选择我的名字" }).click();
  await identifyWithPasscode(page, "李四", LISI_PASSCODE);

  const preview = page.getByRole("region", { name: "重复预约预览" });

  await expect(preview).toContainText("共 8 次");
  await expect(preview).toContainText("次有冲突");

  const submit = page.getByRole("button", { name: /^预约 \d+ 次$/ });
  const before = Number((await submit.textContent())?.match(/\d+/)?.[0]);

  await preview.getByRole("group").first().getByRole("button").first().click();
  await expect(submit).toHaveText(`预约 ${before + 1} 次`);
  await expectAccessible(page);
});

test("given an admin when exporting the QR code then the poster preview and stats render", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "姓名" }).fill("管理员");
  await page.getByRole("textbox").nth(1).pressSequentially(ADMIN_PASSCODE);
  await expect(page.getByRole("heading", { name: "房间" })).toBeVisible();
  await page.getByRole("button", { name: "导出二维码" }).first().click();
  await expect(page.getByRole("img", { name: /A4 海报预览/ })).toBeVisible();
  await page
    .getByRole("radio", { name: "仅二维码" })
    .or(page.getByRole("button", { name: "仅二维码" }))
    .click();
  await expect(page.getByRole("img", { name: /仅二维码预览/ })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/admin/stats");
  await expect(page.getByRole("region", { name: "概览" })).toContainText("预约次数");
  await expectAccessible(page);
});

test("given an admin on the bookings page when filtering then the dates use the calendar picker and the person is searchable", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("textbox", { name: "姓名" }).fill("管理员");
  await page.getByRole("textbox").nth(1).pressSequentially(ADMIN_PASSCODE);
  await expect(page.getByRole("heading", { name: "房间" })).toBeVisible();
  await page.goto("/admin/bookings");
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await page.getByRole("button", { name: /^从：.*打开日历$/ }).click();
  await expect(page.getByRole("dialog", { name: "从日历" })).toBeVisible();
  await page.keyboard.press("Escape");

  const person = page.getByRole("combobox", { name: "预约人" });

  await person.fill("李");
  await page.getByRole("option", { name: "李四" }).click();
  await expect(person).toHaveValue("李四");
  await expectAccessible(page);
});
