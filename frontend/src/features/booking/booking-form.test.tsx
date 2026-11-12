/**
 * Booking form: live conflict check with one-tap suggestions, and the recurring preview where a
 * conflict defaults to skip and a suggestion raises the submit count.
 *
 * @module
 */
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import type { Room } from "../../api/client";
import { MOCK_PASSCODE, MOCK_SLUG, MOCK_TOKEN } from "../../mocks/handlers";
import { nowZoned } from "../../lib/time";
import { rememberRoom, setSession } from "../../state/app-store";
import { renderWithProviders } from "../../test/render";
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

describe("booking form", () => {
  test("given a taken slot when the form checks it then the conflict and suggestion chips appear", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);

    const screen = await renderWithProviders(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "10:00", end: "11:00", title: "", isRepeat: false }}
        onDone={() => undefined}
      />,
    );

    await expect.element(screen.getByText(/李四 10:00–11:00「组会」 已占用/)).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "当天 11:00–12:00" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: /^预约$/ })).toBeDisabled();
  });

  test("given a free slot when the form checks it then it says the slot can be booked", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);

    const screen = await renderWithProviders(
      <BookingForm
        room={ROOM}
        draft={{ date: TOMORROW.toString(), start: "15:00", end: "16:00", title: "", isRepeat: false }}
        onDone={() => undefined}
      />,
    );

    await expect.element(screen.getByText(/15:00–16:00 可以预约/)).toBeVisible();
  });

  test("given a weekly series with one conflict when a suggestion is tapped then the submit count rises", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: 2, passcode: MOCK_PASSCODE }),
    });

    setSession(await sessionSchema.parseAsync(await response.json()));

    const screen = await renderWithProviders(
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
    await expect.element(screen.getByRole("button", { name: "预约 8 次" })).toBeVisible();
  });
});
