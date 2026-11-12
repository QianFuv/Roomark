/**
 * Main user flows against a real server: scan link, room status, quick use with first-time
 * identity, conflict suggestion, recurring preview, my bookings, admin QR export and stats.
 *
 * @module
 */
import { expect, test, type Page } from "@playwright/test";

import {
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
 * Log in through the identity sheet with an already claimed name.
 *
 * @param page - The page.
 * @param name - Person name.
 * @param passcode - 4-digit passcode.
 */
async function identifyWithPasscode(page: Page, name: string, passcode: string): Promise<void> {
  const sheet = page.getByRole("dialog", { name: "你是谁？" });

  await sheet.getByRole("button", { name: new RegExp(name) }).click();
  await sheet.getByRole("textbox").first().pressSequentially(passcode);
  await sheet.getByRole("button", { name: "确认" }).click();
  await expect(sheet).toBeHidden();
}

test("given a QR link when the room opens then the token leaves the address bar and the status is shown", async ({
  page,
}) => {
  await openRoom(page);
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText(/空闲|使用中/);
  await expect(page.getByRole("heading", { name: "今天" })).toBeVisible();
  await expectAccessible(page);
});

test("given a free room when a first-time user taps quick use then they claim a name and the room becomes busy", async ({
  page,
}, testInfo) => {
  const visitor = testInfo.project.name === "mobile" ? "访客甲" : "访客乙";

  await openRoom(page);
  await page.getByRole("button", { name: /马上使用 30 分钟/ }).click();

  const sheet = page.getByRole("dialog", { name: "你是谁？" });

  await expect(sheet).toBeVisible();
  await sheet.getByRole("searchbox", { name: "搜索姓名" }).fill(visitor.slice(0, 2));
  await sheet.getByRole("button", { name: new RegExp(visitor) }).click();

  const first = sheet.getByRole("textbox").first();

  if (await sheet.getByText("第一次使用这个名字").isVisible()) {
    await expectAccessible(page);
    await first.pressSequentially("1357");
    await sheet.getByRole("textbox").first().pressSequentially("1357");
  } else {
    await first.pressSequentially("1357");
    await sheet.getByRole("button", { name: "确认" }).click();
    await page.getByRole("button", { name: /马上使用 30 分钟/ }).click();
  }

  await expect(page.getByRole("region", { name: "当前状态" })).toContainText("使用中");
  await expect(page.getByRole("heading", { name: /你正在使用/ })).toBeVisible();
  await page.getByRole("button", { name: "提前结束" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "提前结束" }).click();
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText("空闲");
});

test("given a taken slot when booking it then the conflict offers suggestions that book in one tap", async ({
  page,
}) => {
  await openRoom(page);
  await page.goto(`/r/${ROOM_SLUG}/book?date=${tomorrow()}&start=10:00&end=11:00`);
  await expect(page.getByText(/李四 10:00–11:00「组会」 已占用/)).toBeVisible();
  await expectAccessible(page);

  const suggestion = page.getByRole("button", { name: /^当天 / }).first();

  await suggestion.click();
  await identifyWithPasscode(page, "李四", LISI_PASSCODE);
  await expect(page.getByText("预约成功")).toBeVisible();
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
  await page.getByRole("textbox").nth(1).pressSequentially("1234");
  await page.getByRole("button", { name: "登录" }).click();
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
