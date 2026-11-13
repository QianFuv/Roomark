/**
 * Room calendar: after the viewer ends their ongoing booking early, the calendar shows the new
 * end time right away instead of the planned one.
 *
 * @module
 */
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { MOCK_PASSCODE, MOCK_SLUG, MOCK_TOKEN, addMockBooking, setMockOpenHours } from "../../mocks/handlers";
import { formatClock, formatTimestamp, nowZoned } from "../../lib/time";
import { rememberRoom, setSession } from "../../state/app-store";
import { renderWithRouter } from "../../test/render";
import { RoomCalendar } from "./room-calendar";

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

describe("room calendar", () => {
  test("given my ongoing booking when I end it early then the calendar shows the new end time", async () => {
    rememberRoom(MOCK_SLUG, MOCK_TOKEN);
    setMockOpenHours("00:00", "23:59");

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: 2, passcode: MOCK_PASSCODE }),
    });

    setSession(await sessionSchema.parseAsync(await response.json()));

    const now = nowZoned().round({ smallestUnit: "minute", roundingMode: "floor" });
    const start = now.hour === 0 && now.minute < 5 ? now : now.subtract({ minutes: 5 });

    const plannedEnd = now.add({ minutes: 50 }).toPlainDate().equals(now.toPlainDate())
      ? now.add({ minutes: 50 })
      : now.with({ hour: 23, minute: 59 });

    addMockBooking({
      roomSlug: MOCK_SLUG,
      kind: "normal",
      title: "讨论",
      start: formatTimestamp(start),
      end: formatTimestamp(plannedEnd),
      plannedEnd: formatTimestamp(plannedEnd),
      status: "confirmed",
      person: { id: 2, name: "李四", role: "teacher" },
      isMine: true,
      canEdit: true,
      releasedMinutes: 0,
    });

    const screen = await renderWithRouter(
      <RoomCalendar slug={MOCK_SLUG} anchorDate={undefined} onAnchorChange={() => undefined} />,
    );

    const before = `${formatClock(start)}–${formatClock(plannedEnd)}`;

    await screen.getByRole("button", { name: new RegExp(`^${before}`) }).click();
    await screen.getByRole("button", { name: "提前结束" }).click();
    await screen.getByRole("alertdialog").getByRole("button", { name: "提前结束" }).click();

    const ended = `${formatClock(start)}–${formatClock(nowZoned())}`;

    await expect.element(screen.getByRole("button", { name: new RegExp(`^${ended}`) })).toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: new RegExp(`^${before}`) }))
      .not.toBeInTheDocument();
  });
});
