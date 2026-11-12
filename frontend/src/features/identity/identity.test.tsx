/**
 * Identity flow: claim a preset name by entering the passcode twice, log in with a claimed name,
 * and show the lockout message.
 *
 * @module
 */
import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { MOCK_PASSCODE, MOCK_SLUG, MOCK_TOKEN } from "../../mocks/handlers";
import { appStore, rememberRoom } from "../../state/app-store";
import { renderWithProviders } from "../../test/render";
import { IdentitySheet, requestSession } from "./identity";

/**
 * Render the sheet and start a session request for the mock room.
 *
 * @returns The render result and the pending session promise.
 */
async function openSheet() {
  rememberRoom(MOCK_SLUG, MOCK_TOKEN);

  const screen = await renderWithProviders(<IdentitySheet />);
  const pending = requestSession(MOCK_SLUG);

  return { screen, pending };
}

describe("identity sheet", () => {
  test("given an unclaimed name when the passcode is entered twice then a mismatch resets and a match signs in", async () => {
    const { screen, pending } = await openSheet();

    await screen.getByRole("button", { name: /张三/ }).click();
    await expect.element(screen.getByText("第一次使用这个名字")).toBeVisible();
    await userEvent.keyboard("1357");
    await expect.element(screen.getByText("再输入一次确认")).toBeVisible();
    await userEvent.keyboard("1358");
    await expect.element(screen.getByText("两次输入不一致，请重新设置")).toBeVisible();
    await userEvent.keyboard("1357");
    await userEvent.keyboard("1357");

    const session = await pending;

    expect(session?.person.name).toBe("张三");
    expect(appStore.state.session?.person.name).toBe("张三");
  });

  test("given a claimed name when the right passcode is confirmed then the session resolves", async () => {
    const { screen, pending } = await openSheet();

    await screen.getByRole("searchbox", { name: "搜索姓名" }).fill("李");
    await screen.getByRole("button", { name: /李四/ }).click();
    await userEvent.keyboard(MOCK_PASSCODE);
    await screen.getByRole("button", { name: "确认" }).click();

    expect((await pending)?.person.name).toBe("李四");
  });

  test("given a locked name when logging in then the remaining lock time is shown", async () => {
    const { screen } = await openSheet();

    await screen.getByRole("button", { name: /赵六/ }).click();
    await userEvent.keyboard("0000");
    await screen.getByRole("button", { name: "确认" }).click();
    await expect.element(screen.getByText(/已暂时锁定。请在 10:15 后再试/)).toBeVisible();
  });
});
