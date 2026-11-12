/**
 * Main user flows against a real server: scan link, room status, the dated next booking and the
 * weekly meeting heatmap, calendar paging (touch swipe and arrows), quick use with first-time
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
  const sheet = page.getByRole("dialog", { name: "登录" });

  await sheet.getByRole("button", { name: new RegExp(name) }).click();
  await expect(sheet.getByText("输入 6 位口令")).toBeVisible();
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
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText(/空闲|正在使用|不可预约|未开放/);
  await expectAccessible(page);
});

test("given tomorrow's booking when the room home opens then 下一场 names the day and the heatmap pages weeks and opens the calendar", async ({
  page,
}, testInfo) => {
  await openRoom(page);
  await expect(page.getByRole("button", { name: /^明天 \d{2}:\d{2}–\d{2}:\d{2} / })).toBeVisible();

  const heatmap = page.getByRole("region", { name: "会议热力图" });
  const thisWeek = heatmap.getByRole("button", { name: "本周" });
  const weekLabel = heatmap.locator("[aria-live=polite]");

  await expect(thisWeek).toBeDisabled();

  const currentLabel = (await weekLabel.textContent()) ?? "";

  await heatmap.getByRole("button", { name: "下一周" }).click();
  await expect(weekLabel).not.toHaveText(currentLabel);
  await expect(thisWeek).toBeEnabled();
  await thisWeek.click();
  await expect(weekLabel).toHaveText(currentLabel);
  await expectAccessible(page);

  const [year = 0, month = 1, day = 1] = tomorrow().split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  if (weekday === 1) await heatmap.getByRole("button", { name: "下一周" }).click();

  const cellText = `${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday]} 10:00，已约 100%`;

  await expect(heatmap.getByText(cellText, { exact: true })).toBeAttached();
  await heatmap.locator(`td[title="${cellText}"]`).click();

  if (testInfo.project.name === "mobile") await expect(page).toHaveURL(new RegExp(`date=${tomorrow()}`));

  await expect(page.getByRole("button", { name: /^10:00–11:00 组会/ }).first()).toBeVisible();
});

test("given the calendar when paging then the content slides to the new range and leaves no stale page", async ({
  page,
}, testInfo) => {
  await openRoom(page);
  await page.getByRole("link", { name: "日历" }).click();

  const region = page.getByRole("region", { name: /的预约$/ });
  const columns = page.getByRole("group", { name: /，\d+ 个预约$/ });
  const before = (await region.getAttribute("aria-label")) ?? "";

  if (testInfo.project.name === "mobile") {
    await expect(columns).toHaveCount(1);
    await region.scrollIntoViewIfNeeded();

    const box = await region.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const y = (box?.y ?? 0) + 120;
    const startX = (box?.x ?? 0) + (box?.width ?? 0) * 0.85;

    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });

    for (let step = 1; step <= 10; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX - step * 18, y }],
      });
    }

    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    const [, month = 1, day = 1] = tomorrow().split("-").map(Number);

    await expect(region).toHaveAttribute("aria-label", new RegExp(` ${month}月${day}日 `));
    await expect(columns).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    return;
  }

  await expect(columns).toHaveCount(7);
  await region
    .getByRole("button", { name: /^\d{2}:\d{2}/ })
    .first()
    .waitFor({ state: "attached" });
  await page.getByRole("button", { name: "下一周" }).click();
  await expect(region).not.toHaveAttribute("aria-label", before);
  await expect(columns).toHaveCount(7);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(region).toHaveAttribute("aria-label", before);
  await expect(columns).toHaveCount(7, { timeout: 100 });
  await expectAccessible(page);
});

/**
 * Swipe the calendar content horizontally with touch events.
 *
 * @param page - The page.
 * @param direction - `1` for the next page (finger moves left), `-1` for the previous one.
 */
async function swipeCalendar(page: Page, direction: 1 | -1): Promise<void> {
  const box = await page.getByRole("region", { name: /的预约$/ }).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const y = Math.max((box?.y ?? 0) + 40, 200);
  const startX = (box?.x ?? 0) + (box?.width ?? 0) * (direction === 1 ? 0.85 : 0.3);

  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });

  for (let step = 1; step <= 10; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: startX - direction * step * 18, y }],
    });
  }

  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * Vertical scroll offset of whatever scrolls the calendar: its own time grid when it fills the
 * window (PC tiers), otherwise the page.
 *
 * @param page - The page.
 * @returns `scrollTop` in pixels.
 */
async function calendarScrollTop(page: Page): Promise<number> {
  return page.getByRole("region", { name: /的预约$/ }).evaluate((region) => {
    const isOwnScroller =
      region.scrollHeight > region.clientHeight + 1 && getComputedStyle(region).overflowY !== "visible";

    return isOwnScroller ? region.scrollTop : window.scrollY;
  });
}

test("given a calendar scrolled to 14:00 when paging forward twice and back once then the vertical position stays put", async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";

  await openRoom(page);
  await page.getByRole("link", { name: "日历" }).click();

  const region = page.getByRole("region", { name: /的预约$/ });

  await expect(page.getByRole("group", { name: /，\d+ 个预约$/ }).first()).toBeVisible();
  await page.waitForTimeout(400);
  await region.evaluate((element) => {
    const isOwnScroller =
      element.scrollHeight > element.clientHeight + 1 && getComputedStyle(element).overflowY !== "visible";

    const label = [...element.querySelectorAll("span")].find((span) => span.textContent === "14:00");
    const offset = label === undefined ? 0 : label.getBoundingClientRect().top - 80;

    if (isOwnScroller) element.scrollTop += offset - element.getBoundingClientRect().top;
    else window.scrollBy(0, offset);
  });

  const before = await calendarScrollTop(page);

  expect(before).toBeGreaterThan(100);

  for (const direction of [1, 1, -1] as const) {
    const label = (await region.getAttribute("aria-label")) ?? "";

    if (isMobile) await swipeCalendar(page, direction);
    else await page.getByRole("button", { name: direction === 1 ? "下一周" : "上一周" }).click();

    await expect(region).not.toHaveAttribute("aria-label", label);
    expect(Math.abs((await calendarScrollTop(page)) - before)).toBeLessThanOrEqual(4);
    await page.waitForTimeout(700);
    expect(Math.abs((await calendarScrollTop(page)) - before)).toBeLessThanOrEqual(4);
  }
});

test("given a free room when a first-time user taps quick use then they claim a name, give a purpose and the room becomes busy", async ({
  page,
}, testInfo) => {
  const visitor = testInfo.project.name === "mobile" ? "访客甲" : "访客乙";

  await openRoom(page);
  await page.getByRole("button", { name: /马上使用 30 分钟/ }).click();

  const identity = page.getByRole("dialog", { name: "登录" });

  await expect(identity).toBeVisible();
  await identity.getByRole("searchbox", { name: "搜索姓名" }).fill(visitor.slice(0, 2));
  await identity.getByRole("button", { name: new RegExp(visitor) }).click();

  if (await identity.getByText("设置 6 位数字口令").isVisible()) {
    await expectAccessible(page);
    await identity.getByRole("textbox").first().pressSequentially("135724");
    await expect(identity.getByText("再输一次确认")).toBeVisible();
    await identity.getByRole("textbox").first().pressSequentially("135724");
  } else {
    await identity.getByRole("textbox").first().pressSequentially("135724");
  }

  await expect(identity).toBeHidden();
  await expectAccessible(page);
  await startQuickUse(page, "临时讨论");
  await expect(page.getByRole("region", { name: "当前状态" })).toContainText("你正在使用");
  await expect(page.getByRole("region", { name: "续时或提前结束" })).toBeVisible();
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

  await expect(panel).toContainText("10:00–11:00 已被李四约了（组会）");
  await expectAccessible(page);

  const suggestion = panel.getByRole("button", { name: /^当天 / }).first();

  const range =
    /\d{2}:\d{2}–\d{2}:\d{2}/.exec((await suggestion.getAttribute("aria-label")) ?? "")?.[0] ?? "";

  await suggestion.click();
  await expect(suggestion).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByText(`已换到`)).toContainText(`${range}，可以约`);
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
  expect(bookingPosts).toEqual([
    expect.objectContaining({
      title: "答辩彩排",
      suggestedFrom: { start: `${tomorrow()}T10:00:00+08:00`, end: `${tomorrow()}T11:00:00+08:00` },
    }),
  ]);
});

test("given a weekly rule when a week conflicts then it defaults to skip and a suggestion raises the count", async ({
  page,
}) => {
  await openRoom(page);
  await page.goto(`/r/${ROOM_SLUG}/book?date=${tomorrow()}&start=10:00&end=11:00&repeat=true`);

  await page.getByRole("main").getByRole("button", { name: "登录" }).click();
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
