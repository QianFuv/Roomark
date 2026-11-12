/**
 * Booking route: new booking (optionally prefilled) or editing an existing one.
 *
 * @module
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import type { Booking, Room } from "../../../api/client";
import { BookingForm, type BookingDraft } from "../../../features/booking/booking-form";
import { useRoomBookings, useRoomDetail } from "../../../features/room/room-data";
import { DEFAULT_SLOT_MINUTES } from "../../../lib/schedule";
import {
  ceilToGrid,
  clockToMinutes,
  formatClock,
  minutesOfDay,
  minutesToClock,
  nowZoned,
  parseZoned,
} from "../../../lib/time";
import { EmptyState, Notice, Skeleton, Stack } from "../../../ui/layout";

const searchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  repeat: z.boolean().optional(),
  edit: z.number().int().optional(),
  mode: z.enum(["block"]).optional(),
});

export const Route = createFileRoute("/r/$slug/book")({
  validateSearch: searchSchema,
  component: BookPage,
});

/**
 * Default draft: the next grid slot today (or tomorrow's opening after closing time).
 *
 * @param room - The room.
 * @param search - Prefill from the URL.
 * @returns The draft.
 */
export function defaultDraft(room: Room, search: z.infer<typeof searchSchema>): BookingDraft {
  const now = nowZoned();
  const open = clockToMinutes(room.rules.openTime);
  const close = clockToMinutes(room.rules.closeTime);
  let date = now.toPlainDate();
  let start = Math.max(open, ceilToGrid(minutesOfDay(now)));

  if (start + 15 > close) {
    date = date.add({ days: 1 });
    start = open;
  }

  const startClock = search.start ?? minutesToClock(start);

  const endClock =
    search.end ?? minutesToClock(Math.min(clockToMinutes(startClock) + DEFAULT_SLOT_MINUTES, close));

  return {
    date: search.date ?? date.toString(),
    start: startClock,
    end: endClock,
    title: "",
    isRepeat: search.repeat === true,
  };
}

/**
 * Booking page.
 *
 * @returns The page.
 */
function BookPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const detail = useRoomDetail(slug);
  const editDate = search.edit === undefined ? "" : (search.date ?? "");
  const bookings = useRoomBookings(slug, editDate, editDate, search.edit !== undefined && editDate !== "");
  const room = detail.data?.room;

  if (room === undefined) {
    return (
      <Stack gap="md">
        <Skeleton height={84} />
        <Skeleton height={72} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </Stack>
    );
  }

  let editing: Booking | undefined;

  if (search.edit !== undefined) {
    if (bookings.data === undefined) return <Skeleton height={320} />;

    editing = (bookings.data ?? []).find((booking) => booking.id === search.edit);

    if (editing === undefined) {
      return <EmptyState title="找不到这条预约">它可能已经被取消或已结束。</EmptyState>;
    }
  }

  const draft: BookingDraft =
    editing === undefined
      ? defaultDraft(room, search)
      : {
          date: parseZoned(editing.start).toPlainDate().toString(),
          start: formatClock(editing.start),
          end: formatClock(editing.end),
          title: editing.title,
          isRepeat: false,
        };

  return (
    <Stack gap="md">
      {editing?.series === undefined ? null : (
        <Notice tone="info" title="这是周期预约中的一次">
          保存时可以选择只改这一次，或这次及以后全部。
        </Notice>
      )}
      <BookingForm
        key={`${editing?.id ?? "new"}-${draft.date}-${draft.start}-${draft.end}-${String(draft.isRepeat)}-${search.mode ?? ""}`}
        room={room}
        draft={draft}
        editing={editing}
        initialKind={search.mode === "block" ? "block" : "normal"}
        onDone={() => void navigate({ to: "/r/$slug", params: { slug } })}
      />
    </Stack>
  );
}
