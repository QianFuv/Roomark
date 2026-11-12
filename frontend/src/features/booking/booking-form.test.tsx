/**
 * Booking form: live conflict check with suggestions that only change the form's time (the main
 * button books, attributed to the originally requested range or to the submit conflict), and the
 * recurring preview where a conflict defaults to skip and a suggestion raises the submit count.
 *
 * @module
 */
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { z } from "zod";

import type { Middleware } from "openapi-fetch";

import { fetchClient, type Room } from "../../api/client";
import { MOCK_PASSCODE, MOCK_SLUG, MOCK_TOKEN, addMockBooking } from "../../mocks/handlers";
import { nowZoned, toTimestamp } from "../../lib/time";
import { rememberRoom, setSession } from "../../state/app-store";
import { renderWithRouter } from "../../test/render";
import { BookingForm } from "./booking-form";

const ROOM: Room = {
  id: 1,
  slug: MOCK_SLUG,
  name: "9070 会议室",
  location: "",
  capacity: 12,
  description: "",
  rules: {
    openTime: "08:00",
    closeTime: "22:00",
    maxDurationMinutes: 240,
    maxAdvanceDays: 14,
    maxActivePerPerson: 0,
    recurringMaxWeeks: 20,
  },
};

const sessionSchema = z.object({
  token: z.string(),
  person: z.object({
    id: z.number(),
    name: z.string(),
    role: z.enum(["teacher", "student", "other"]),
    isAdmin: z.boolean(),
    hasPasscode: z.boolean(),
  }),
});

const TOMORROW = nowZoned().toPlainDate().add({ days: 1 });

/**
 * Sign in as the mock person 李四.
 */
async function signIn(): Promise<void> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personId: 2, passcode: MOCK_PASSCODE }),
  });

  setSession(await sessionSchema.parseAsync(await response.json()));
}

const recorders: Middleware[] = [];

/**
 * Collect the bodies of booking create requests sent by the API client.
 *
 * @returns The live list of bodies.
 */
function recordBookingPosts(): unknown[] {
  const bodies: unknown[] = [];

  const recorder: Middleware = {
    async onRequest({ request }) {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/bookings")) {
        bodies.push(await request.clone().json());
      }

      return undefined;
    },
  };

  fetchClient.use(recorder);
  recorders.push(recorder);

  return bodies;
}

afterEach(() => {
  for (const recorder of recorders.splice(0)) fetchClient.eject(recorder);
});

describe("booking form", () => {
  test("given a taken slot when the form checks it then the conflict and suggestion cards appear", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "10:00", end: "11:00", title: "", isRepeat: false }}
        onDone={() => undefined}
      />,
    );

    const panel = screen.getByRole("region", { name: "时段冲突" });

    await expect.element(panel.getByText("明天 10:00–11:00", { exact: true })).toBeVisible();
    await expect.element(panel.getByText("已被李四约了（组会）", { exact: true })).toBeVisible();
    await expect.element(panel.getByRole("group", { name: "换个时间" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "当天 11:00–12:00，1 小时" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /^预约$/ })).toBeDisabled();
  });

  test("given an empty 用途 when a live-check suggestion is tapped then the form switches to that time without booking, and 预约 asks for 用途 then books it as suggested from the requested range", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);
    await signIn();

    const posts = recordBookingPosts();
    const onDone = vi.fn();

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "10:00", end: "11:00", title: "", isRepeat: false }}
        onDone={onDone}
      />,
    );

    const suggestion = screen.getByRole("button", { name: "当天 11:00–12:00，1 小时" });

    await suggestion.click();
    await expect.element(suggestion).toHaveAttribute("aria-pressed", "true");
    await expect.element(screen.getByText(/已换到 .*11:00–12:00，可以约/)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /^预约$/ })).toBeEnabled();
    expect(posts).toEqual([]);

    await screen.getByRole("button", { name: /^预约$/ }).click();
    await expect.element(screen.getByText("请填写用途")).toBeVisible();
    await expect.element(screen.getByRole("textbox", { name: "用途" })).toHaveFocus();
    expect(posts).toEqual([]);

    await screen.getByRole("textbox", { name: "用途" }).fill("答辩彩排");
    await screen.getByRole("button", { name: /^预约$/ }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts).toEqual([
      expect.objectContaining({
        start: expect.stringContaining("T11:00:00"),
        end: expect.stringContaining("T12:00:00"),
        title: "答辩彩排",
        suggestedFrom: {
          start: toTimestamp(TOMORROW, "10:00"),
          end: toTimestamp(TOMORROW, "11:00"),
        },
      }),
    ]);
    expect(posts[0]).not.toHaveProperty("conflictEventId");
  });

  test("given a tapped suggestion when the time is changed by hand, even back to the same slot, then 预约 books it without attribution", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);
    await signIn();

    const posts = recordBookingPosts();
    const onDone = vi.fn();

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{
          date: TOMORROW.toString(),
          start: "10:00",
          end: "11:00",
          title: "答辩彩排",
          isRepeat: false,
        }}
        onDone={onDone}
      />,
    );

    await screen.getByRole("button", { name: "当天 11:00–12:00，1 小时" }).click();
    await expect.element(screen.getByText(/已换到 .*11:00–12:00，可以约/)).toBeVisible();
    await screen.getByRole("button", { name: "结束时间推后 15 分钟" }).click();
    await expect.element(screen.getByText(/11:00–12:15 可以约/)).toBeVisible();
    await screen.getByRole("button", { name: "结束时间提前 15 分钟" }).click();
    await expect.element(screen.getByText(/11:00–12:00 可以约/)).toBeVisible();
    await screen.getByRole("button", { name: /^预约$/ }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts).toEqual([
      expect.objectContaining({
        start: expect.stringContaining("T11:00:00"),
        end: expect.stringContaining("T12:00:00"),
      }),
    ]);
    expect(posts[0]).not.toHaveProperty("suggestedFrom");
    expect(posts[0]).not.toHaveProperty("conflictEventId");
  });

  test("given a slot taken between the check and 预约 when a suggestion from the 409 is booked then it is attributed by conflictEventId", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);
    await signIn();

    const posts = recordBookingPosts();
    const onDone = vi.fn();

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{
          date: TOMORROW.toString(),
          start: "15:00",
          end: "16:00",
          title: "答辩彩排",
          isRepeat: false,
        }}
        onDone={onDone}
      />,
    );

    await expect.element(screen.getByText(/15:00–16:00 可以约/)).toBeVisible();
    addMockBooking({
      roomSlug: MOCK_SLUG,
      kind: "normal",
      title: "讨论",
      start: toTimestamp(TOMORROW, "15:00"),
      end: toTimestamp(TOMORROW, "16:00"),
      plannedEnd: toTimestamp(TOMORROW, "16:00"),
      status: "confirmed",
      person: { id: 3, name: "张三", role: "student" },
      isMine: false,
      canEdit: false,
      releasedMinutes: 0,
    });
    await screen.getByRole("button", { name: /^预约$/ }).click();
    await screen.getByRole("button", { name: "当天 16:00–17:00，1 小时" }).click();
    await screen.getByRole("button", { name: /^预约$/ }).click();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(posts).toEqual([
      expect.objectContaining({ start: expect.stringContaining("T15:00:00") }),
      expect.objectContaining({ start: expect.stringContaining("T16:00:00"), conflictEventId: 99 }),
    ]);
    expect(posts[1]).not.toHaveProperty("suggestedFrom");
  });

  test("given a filled 用途 when a suggestion is tapped then nothing is booked until 预约 is pressed", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);
    await signIn();

    const posts = recordBookingPosts();

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "10:00", end: "11:00", title: "组会", isRepeat: false }}
        onDone={() => undefined}
      />,
    );

    await screen
      .getByRole("button", { name: /月.*日 .*，1 小时$/ })
      .first()
      .click();
    await expect.element(screen.getByText(/已换到 .*10:00–11:00，可以约。点「预约」确认/)).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(posts).toEqual([]);
  });

  test("given a free slot when the form checks it then it says the slot can be booked", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "15:00", end: "16:00", title: "", isRepeat: false }}
        onDone={() => undefined}
      />,
    );

    await expect.element(screen.getByText(/15:00–16:00 可以约/)).toBeVisible();
  });

  test("given a weekly series with one conflict when a suggestion is tapped then the submit count rises", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);
    await signIn();

    const screen = await renderWithRouter(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "10:00", end: "11:00", title: "", isRepeat: true }}
        onDone={() => undefined}
      />,
    );

    const preview = screen.getByRole("region", { name: "重复预约预览" });

    await expect.element(preview.getByText("共 8 次 · 7 次可约 · 1 次有冲突")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "预约 7 次" })).toBeVisible();
    await preview.getByRole("button", { name: /^当天 / }).click();
    await expect
      .element(preview.getByRole("button", { name: /^当天 / }))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(screen.getByRole("button", { name: "预约 8 次" })).toBeVisible();
  });
});
