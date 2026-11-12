/**
 * Account menu, logout and switching identity, history-aware back (overlays first, tabs, the
 * visible back control, unsaved-form prompt), binding a room by its code, recovering from a stale
 * stored token, and theme switching while a menu item is hovered.
 *
 * @module
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { ADMIN_PASSCODE, LISI_PASSCODE, ROOM_NAME, ROOM_SLUG, seed, type Seeded } from "./support";

const STORAGE_KEY = "roomark.state.v1";

let seeded: Seeded;

const sessions: Record<string, unknown> = {};

test.beforeAll(async ({ request }) => {
  seeded = await seed(request);
});

/**
 * A session for a person, created once per worker through the API (waits out the login limit).
 *
 * @param request - API context.
 * @param name - Person name.
 * @param passcode - Passcode.
 * @returns The stored session JSON.
 */
async function sessionFor(request: APIRequestContext, name: string, passcode: string): Promise<unknown> {
  if (sessions[name] !== undefined) return sessions[name];

  await expect(async () => {
    const response = await request.post("/api/sessions", { data: { name, passcode } });

    expect(response.ok(), await response.text()).toBeTruthy();
    sessions[name] = await response.json();
  }).toPass({ intervals: [7_000], timeout: 60_000 });

  return sessions[name];
}

/**
 * Store client state before the first page load.
 *
 * @param page - The page.
 * @param state - Session and rooms.
 * @param state.session - Stored session, if any.
 * @param state.rooms - Rooms by slug with their stored token.
 */
async function storeState(
  page: Page,
  { session, rooms }: { session?: unknown; rooms: Record<string, { token: string }> },
): Promise<void> {
  const value = JSON.stringify({ session, rooms, lastRoomSlug: Object.keys(rooms)[0] });

  await page.addInitScript(
    ([key, json]) => {
      if (sessionStorage.getItem("roomark.e2e.seeded") !== null) return;

      sessionStorage.setItem("roomark.e2e.seeded", "1");
      localStorage.setItem(key, json);
    },
    [STORAGE_KEY, value] as const,
  );
}

/**
 * The visible account control.
 *
 * @param page - The page.
 * @returns The trigger.
 */
function accountButton(page: Page) {
  return page.getByRole("button", { name: /^账户：/ });
}

test("given 我的 when signing out from the account menu then the room overview opens with 已退出 and no identity sheet", async ({
  page,
  request,
}) => {
  await storeState(page, {
    session: await sessionFor(request, "李四", LISI_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1, name: "我的预约" })).toBeVisible();
  await accountButton(page).click();
  await expect(page.getByRole("menuitem", { name: "管理后台" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "退出" }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
  await expect(page.getByText("已退出")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: ROOM_NAME })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "登录" }).first()).toBeVisible();
  delete sessions["李四"];
});

test("given the admin area when an admin signs out then the room overview opens, not an admin login screen", async ({
  page,
  request,
}) => {
  await storeState(page, {
    session: await sessionFor(request, "管理员", ADMIN_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto("/admin/people");
  await expect(page.getByRole("heading", { level: 1, name: "名单" })).toBeVisible();
  await accountButton(page).click();
  await expect(page.getByRole("menuitem", { name: "管理后台" })).toBeVisible();
  await page.getByRole("menuitem", { name: "退出" }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
  await expect(page.getByText("已退出")).toBeVisible();
  await expect(page.getByRole("heading", { name: "管理员登录" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  delete sessions["管理员"];
});

test("given a signed-in member on the calendar when switching identity then the sheet opens in place, cancel keeps them, and choosing another person switches", async ({
  page,
  request,
}) => {
  await storeState(page, {
    session: await sessionFor(request, "李四", LISI_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto(`/r/${ROOM_SLUG}/calendar`);
  await expect(page.getByRole("region", { name: /的预约$/ })).toBeVisible();

  const url = page.url();

  await accountButton(page).click();
  await page.getByRole("menuitem", { name: "切换身份" }).click();

  const sheet = page.getByRole("dialog", { name: "切换身份" });

  await expect(sheet).toBeVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(accountButton(page)).toHaveAccessibleName("账户：李四");
  expect(page.url()).toBe(url);

  await accountButton(page).click();
  await page.getByRole("menuitem", { name: "切换身份" }).click();
  await sheet.getByRole("button", { name: /管理员/ }).click();
  await sheet.getByRole("textbox").first().pressSequentially(ADMIN_PASSCODE);
  await expect(sheet).toBeHidden();
  await expect(accountButton(page)).toHaveAccessibleName("账户：管理员");
  expect(page.url()).toBe(url);
  delete sessions["李四"];
});

test("given an open sheet when going back then the sheet closes first, and back from 日历 or 预约 returns to 概况", async ({
  page,
  request,
}) => {
  await storeState(page, {
    session: await sessionFor(request, "李四", LISI_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto(`/r/${ROOM_SLUG}`);
  await expect(page.getByRole("region", { name: "当前状态" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "会议室" });

  await tabs.getByRole("link", { name: "日历" }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await page
    .getByRole("button", { name: /空闲，点按预约$/ })
    .last()
    .click();

  const sheet = page.getByRole("dialog", { name: /^预约/ });

  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/calendar/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));

  await tabs.getByRole("link", { name: "预约" }).click();
  await expect(page).toHaveURL(/\/book/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
  await expect(page.getByRole("region", { name: "当前状态" })).toBeVisible();
});

test("given typed 用途 when backing out of the booking form then it asks once to discard", async ({
  page,
  request,
}) => {
  await storeState(page, {
    session: await sessionFor(request, "李四", LISI_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto(`/r/${ROOM_SLUG}`);
  await page.getByRole("navigation", { name: "会议室" }).getByRole("link", { name: "预约" }).click();
  await page.getByRole("textbox", { name: "用途" }).fill("还没保存");
  await page.goBack();

  const prompt = page.getByRole("alertdialog", { name: "放弃填写的内容？" });

  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "取消" }).click();
  await expect(page).toHaveURL(/\/book/);
  await expect(page.getByRole("textbox", { name: "用途" })).toHaveValue("还没保存");
  await page.goBack();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "放弃" }).click();
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
});

test("given an admin sub-page when pressing the back control then it returns to the room list, with or without history", async ({
  page,
  request,
}) => {
  await storeState(page, {
    session: await sessionFor(request, "管理员", ADMIN_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto("/admin/rooms");
  await page.getByRole("button", { name: "导出二维码" }).first().click();
  await expect(page.getByRole("img", { name: /海报预览/ })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page).toHaveURL(/\/admin\/rooms$/);

  const qrPath = await page.getByRole("button", { name: "导出二维码" }).first().getAttribute("href");

  await page.goto(qrPath ?? "/admin/rooms");
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page).toHaveURL(/\/admin\/rooms$/);
});

test("given no bound room when typing the room code then the room opens, and a wrong code says so", async ({
  page,
}) => {
  await storeState(page, { rooms: {} });
  await page.goto("/");

  const first = page.getByRole("textbox").first();

  await first.click();
  await page.keyboard.type("ABCDEF");
  await expect(page.getByRole("alert")).toContainText("没有这个房间码");
  await first.click();
  await page.keyboard.type(seeded.roomToken.toLowerCase());
  await expect(page).toHaveURL(new RegExp(`/r/${ROOM_SLUG}$`));
  await expect(page.getByRole("heading", { level: 1, name: ROOM_NAME })).toBeVisible();
});

test("given a stale long token from before room codes when the room opens then it is dropped and the room code input recovers it", async ({
  page,
}) => {
  await storeState(page, {
    rooms: { [ROOM_SLUG]: { token: "qmsi7hmuoZhddVP2-AbFrpMfoNVksC4FwXKDlnr4n_Y" } },
  });
  await page.goto(`/r/${ROOM_SLUG}`);
  await expect(page.getByText("输入房间码", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) ?? "", STORAGE_KEY))
    .not.toContain("qmsi7hmuo");
  await page.getByRole("textbox").first().click();
  await page.keyboard.type(seeded.roomToken);
  await expect(page.getByRole("heading", { level: 1, name: ROOM_NAME })).toBeVisible();
});

test("given the pointer on a theme item when the theme switches then its highlight takes the new theme's hover color", async ({
  page,
  request,
}, testInfo) => {
  // oxlint-disable-next-line anti-slop/tests-require-given-when-then
  test.skip(testInfo.project.name === "mobile", "Hover needs a mouse.");

  await page.emulateMedia({ colorScheme: "light" });
  await storeState(page, {
    session: await sessionFor(request, "李四", LISI_PASSCODE),
    rooms: { [ROOM_SLUG]: { token: seeded.roomToken } },
  });
  await page.goto(`/r/${ROOM_SLUG}`);
  await accountButton(page).click();

  const highlight = page.locator('[role="menu"] [data-slot="item-highlight"]');

  for (const [name, expected, stale] of [
    ["主题：深色", "rgb(44, 44, 44)", "rgb(237, 237, 238)"],
    ["主题：浅色", "rgb(237, 237, 238)", "rgb(44, 44, 44)"],
  ] as const) {
    const item = page.getByRole("menuitemradio", { name });

    await item.hover();
    await item.click();
    await expect(highlight).toHaveCSS("background-color", expected);

    const leftovers = await page.evaluate(
      (color) =>
        [...document.querySelectorAll<HTMLElement>("[style]")].filter(
          (element) => element.style.backgroundColor === color,
        ).length,
      stale,
    );

    expect(leftovers).toBe(0);
  }
});
