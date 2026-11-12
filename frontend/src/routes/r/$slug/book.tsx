/**
 * Booking route: new booking (optionally prefilled) or editing an existing one.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import type { Booking, Room } from "../../../api/client";
import { BookingForm, type BookingDraft } from "../../../features/booking/booking-form";
import { useRoomBookings, useRoomDetail } from "../../../features/room/room-data";
import { DEFAULT_SLOT_MINUTES, nextFreeSlot } from "../../../lib/schedule";
import {
  ceilToGrid,
  clockToMinutes,
  formatClock,
  minutesOfDay,
  minutesToClock,
  nowZoned,
  parseDate,
  parseZoned,
} from "../../../lib/time";
import { colors, media, radii } from "../../../styles/tokens.stylex";
import { EmptyState, Skeleton, Stack } from "../../../ui/layout";

const styles = stylex.create({
  frame: {
    backgroundColor: { default: "transparent", [media.narrow]: colors.surface },
    borderColor: colors.border,
    borderRadius: radii.extraLarge,
    borderStyle: "solid",
    borderWidth: { default: 0, [media.narrow]: 1 },
    maxWidth: 1000,
    padding: { default: 0, [media.narrow]: 24, [media.wide]: 32 },
    width: "100%",
  },
});

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

/** URL prefill of the booking form. */
type BookSearch = z.infer<typeof searchSchema>;

/**
 * Default draft. URL prefills (from the calendar or agenda) win; otherwise the form starts at the
 * next free slot of the room, on the prefilled date or from today on, falling back to the next grid
 * step (or tomorrow's opening) when nothing is free.
 *
 * @param room - The room.
 * @param search - Prefill from the URL.
 * @param bookings - Bookings covering the searched dates.
 * @returns The draft.
 */
function defaultDraft(room: Room, search: BookSearch, bookings: readonly Booking[]): BookingDraft {
  const now = nowZoned();
  const open = clockToMinutes(room.rules.openTime);
  const close = clockToMinutes(room.rules.closeTime);
  let date = now.toPlainDate();
  let start = Math.max(open, ceilToGrid(minutesOfDay(now)));

  if (start + 15 > close) {
    date = date.add({ days: 1 });
    start = open;
  }

  const range = freeSlotRange(room, search);

  const free =
    search.start === undefined
      ? nextFreeSlot(
          bookings,
          now,
          room.rules.openTime,
          room.rules.closeTime,
          room.rules.maxDurationMinutes,
          parseDate(range.from),
          parseDate(range.to),
        )
      : undefined;

  const startClock = search.start ?? free?.startClock ?? minutesToClock(start);

  const endClock =
    search.end ??
    (free !== undefined && search.start === undefined
      ? free.endClock
      : minutesToClock(Math.min(clockToMinutes(startClock) + DEFAULT_SLOT_MINUTES, close)));

  return {
    date: search.date ?? free?.date.toString() ?? date.toString(),
    start: startClock,
    end: endClock,
    title: "",
    isRepeat: search.repeat === true,
  };
}

/** Inclusive `YYYY-MM-DD` date range. */
interface DateSpan {
  from: string;
  to: string;
}

/**
 * Dates searched for the next free slot: the prefilled date, or today through the booking horizon.
 *
 * @param room - The room, if loaded.
 * @param search - Prefill from the URL.
 * @returns Inclusive `YYYY-MM-DD` range.
 */
function freeSlotRange(room: Room | undefined, search: BookSearch): DateSpan {
  if (search.date !== undefined) return { from: search.date, to: search.date };

  const today = nowZoned().toPlainDate();

  return {
    from: today.toString(),
    to: today.add({ days: Math.max(room?.rules.maxAdvanceDays ?? 0, 1) }).toString(),
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
  const needsFreeSlot = search.edit === undefined && search.start === undefined;
  const range = freeSlotRange(room, search);
  const freeBookings = useRoomBookings(slug, range.from, range.to, needsFreeSlot && room !== undefined);
  const searchKey = JSON.stringify(search);
  const [frozenDraft, setFrozenDraft] = useState<{ key: string; draft: BookingDraft }>();

  if (room === undefined || (needsFreeSlot && (freeBookings.isPending || freeBookings.isPlaceholderData))) {
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
      return <EmptyState title="找不到这条预约">可能已取消或已结束</EmptyState>;
    }
  }

  let draft: BookingDraft;

  if (editing !== undefined) {
    draft = {
      date: parseZoned(editing.start).toPlainDate().toString(),
      start: formatClock(editing.start),
      end: formatClock(editing.end),
      title: editing.title,
      isRepeat: false,
    };
  } else if (frozenDraft?.key === searchKey) {
    draft = frozenDraft.draft;
  } else {
    draft = defaultDraft(room, search, freeBookings.data ?? []);
    setFrozenDraft({ key: searchKey, draft });
  }

  return (
    <Stack gap="md" xstyle={styles.frame}>
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
