/**
 * Tests for binding a room by its 6-character room code.
 *
 * @module
 */
import { userEvent } from "vite-plus/test/browser/context";
import { describe, expect, test, vi } from "vite-plus/test";

import { MOCK_RATE_LIMITED_CODE, MOCK_SLUG, MOCK_TOKEN } from "../../mocks/handlers";
import { appStore } from "../../state/app-store";
import { renderWithRouter } from "../../test/render";
import { RoomCodeInput, normalizeRoomCode } from "./scan-room";

describe("normalizeRoomCode", () => {
  test("given lower-case text with look-alike and separator characters when normalised then only code characters remain, upper-cased", () => {
    expect(normalizeRoomCode("k7m-2xq")).toBe("K7M2XQ");
    expect(normalizeRoomCode("O0I1L k7m2xq")).toBe("K7M2XQ");
  });

  test("given a pasted door QR link when normalised then its code is extracted", () => {
    expect(normalizeRoomCode("https://rooms.example.com/r/9070?k=k7m2xq")).toBe("K7M2XQ");
    expect(normalizeRoomCode(normalizeRoomCode("https://x/r/9070?k=K7M2XQ&utm=1"))).toBe("K7M2XQ");
  });
});

describe("RoomCodeInput", () => {
  test("given a valid code typed in lower case when the sixth character is entered then the room is stored and opened", async () => {
    const onBound = vi.fn();
    const screen = await renderWithRouter(<RoomCodeInput onBound={onBound} isAutoFocus />);

    await userEvent.keyboard(MOCK_TOKEN.toLowerCase());

    await expect.poll(() => onBound.mock.calls[0]?.[0]).toBe(MOCK_SLUG);
    expect(appStore.state.rooms[MOCK_SLUG]?.token).toBe(MOCK_TOKEN);
    expect(appStore.state.rooms[MOCK_SLUG]?.name).toBe("9070 会议室");
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  test("given a full QR link pasted into the boxes when pasted then its code is resolved", async () => {
    const onBound = vi.fn();
    const screen = await renderWithRouter(<RoomCodeInput onBound={onBound} />);

    const first = screen.getByRole("textbox").first();
    const data = new DataTransfer();

    await first.click();
    data.setData("text/plain", `https://rooms.example.com/r/${MOCK_SLUG}?k=${MOCK_TOKEN.toLowerCase()}`);
    first
      .element()
      .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));

    await expect.poll(() => onBound.mock.calls[0]?.[0]).toBe(MOCK_SLUG);
  });

  test("given an unknown code when it is complete then a short inline message is shown and nothing is stored", async () => {
    const onBound = vi.fn();
    const screen = await renderWithRouter(<RoomCodeInput onBound={onBound} isAutoFocus />);

    await userEvent.keyboard("ABCDEF");

    await expect.element(screen.getByRole("alert")).toHaveTextContent("没有这个房间码，请核对");
    expect(onBound).not.toHaveBeenCalled();
    expect(appStore.state.rooms).toEqual({});
  });

  test("given too many attempts when the server rate-limits then the message asks to wait", async () => {
    const screen = await renderWithRouter(<RoomCodeInput onBound={vi.fn()} isAutoFocus />);

    await userEvent.keyboard(MOCK_RATE_LIMITED_CODE);

    await expect.element(screen.getByRole("alert")).toHaveTextContent("试得太频繁，请稍后再试");
  });
});
