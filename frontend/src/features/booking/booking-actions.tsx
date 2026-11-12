/**
 * Booking write actions shared by every page: quick use, book, extend, end early, cancel.
 * Each action makes sure there is a session first, reports the result as a toast and refreshes
 * the booking queries.
 *
 * @module
 */
import {
  asProblem,
  errorMessage,
  fetchClient,
  refreshBookings,
  type Booking,
  type Conflict,
  type Suggestion,
} from "../../api/client";
import { formatBookingWhen, formatClockRange } from "../../lib/time";
import { rememberTitle, roomToken } from "../../state/app-store";
import { chooseAction, confirmAction } from "../../ui/dialogs";
import { notify } from "../../ui/toast";
import { requestSession } from "../identity/identity";

/** Outcome of a create attempt. */
export type CreateOutcome =
  | { kind: "created"; booking: Booking }
  | { kind: "conflict"; conflict: Conflict }
  | { kind: "invalid"; message: string }
  | { kind: "cancelled" };

/** Scope of an edit or cancel on a series occurrence. */
export type EditScope = "this" | "following";

/**
 * Header carrying the room token for booking endpoints addressed by id.
 *
 * @param slug - Room slug of the booking.
 * @returns The header object.
 */
export function roomHeader(slug: string): { "X-Room-Token"?: string } {
  const token = roomToken(slug);

  return token === undefined ? {} : { "X-Room-Token": token };
}

/**
 * Start using a free room right now. The caller makes sure there is a session first, so the
 * purpose sheet can open after identification.
 *
 * @param slug - Room slug.
 * @param minutes - Duration.
 * @param title - Purpose (用途).
 * @returns The booking, or `undefined` on failure.
 */
export async function quickUse(
  slug: string,
  minutes: 30 | 60 | 90 | 120,
  title: string,
): Promise<Booking | undefined> {
  const result = await fetchClient.POST("/api/rooms/{slug}/quick", {
    params: { path: { slug } },
    body: { minutes, title: title.trim() },
  });

  await refreshBookings({ updated: result.data === undefined ? [] : [result.data] });

  if (result.data === undefined) {
    notify("error", "没能开始使用", errorMessage(result.error));

    return undefined;
  }

  rememberTitle(result.data.title);

  notify(
    "success",
    "已开始使用",
    `${formatClockRange(result.data.start, result.data.end)}，用完可以提前结束`,
  );

  return result.data;
}

/** Fields of a new single booking. */
export interface NewBooking {
  start: string;
  end: string;
  title: string;
  conflictEventId?: number | undefined;
  onBehalfOf?: number | undefined;
  kind?: "normal" | "block" | undefined;
}

/**
 * Create a single booking.
 *
 * @param slug - Room slug.
 * @param booking - The booking fields.
 * @returns What happened.
 */
export async function createBooking(slug: string, booking: NewBooking): Promise<CreateOutcome> {
  if ((await requestSession(slug)) === undefined) return { kind: "cancelled" };

  const result = await fetchClient.POST("/api/rooms/{slug}/bookings", {
    params: { path: { slug } },
    body: {
      start: booking.start,
      end: booking.end,
      title: booking.title.trim(),
      conflictEventId: booking.conflictEventId,
      onBehalfOf: booking.onBehalfOf,
      kind: booking.kind,
    },
  });

  await refreshBookings({ updated: result.data === undefined ? [] : [result.data] });

  if (result.data !== undefined) {
    rememberTitle(result.data.title);
    notify("success", "预约成功", formatBookingWhen(result.data.start, result.data.end));

    return { kind: "created", booking: result.data };
  }

  const problem = asProblem(result.error);

  if (problem?.status === 409 && problem.conflictWith !== undefined) {
    return {
      kind: "conflict",
      conflict: {
        conflictWith: problem.conflictWith,
        suggestions: problem.suggestions ?? [],
        conflictEventId: problem.conflictEventId ?? 0,
      },
    };
  }

  return { kind: "invalid", message: errorMessage(result.error) };
}

/**
 * Book a conflict suggestion with one tap.
 *
 * @param slug - Room slug.
 * @param suggestion - The suggested window.
 * @param conflictEventId - Id of the conflict that produced the suggestion.
 * @param title - Purpose carried over from the form.
 * @returns What happened.
 */
export function bookSuggestion(
  slug: string,
  suggestion: Suggestion,
  conflictEventId: number,
  title: string,
): Promise<CreateOutcome> {
  return createBooking(slug, {
    start: suggestion.start,
    end: suggestion.end,
    title,
    conflictEventId: conflictEventId === 0 ? undefined : conflictEventId,
  });
}

/**
 * Ask whether an action on a series occurrence applies to this one or all following ones.
 *
 * @param booking - The occurrence.
 * @param verb - Action verb, e.g. `取消` or `修改`.
 * @returns The scope, or `undefined` if cancelled. Single bookings return `this` without asking.
 */
export async function askScope(booking: Booking, verb: string): Promise<EditScope | undefined> {
  if (booking.series === undefined) return "this";

  return chooseAction(
    `${verb}周期预约`,
    [
      { value: "this", label: "仅这一次", description: formatBookingWhen(booking.start, booking.end) },
      {
        value: "following",
        label: "这次及以后全部",
        description: `第 ${booking.series.index} 次起，共 ${booking.series.total - booking.series.index + 1} 次`,
        variant: verb === "取消" ? "danger" : "secondary",
      },
    ],
    booking.series.ruleSummary,
  );
}

/**
 * Cancel a booking after confirmation (series: choose the scope).
 *
 * @param booking - The booking.
 * @returns Whether it was cancelled.
 */
export async function cancelBooking(booking: Booking): Promise<boolean> {
  let scope: EditScope | undefined = "this";

  if (booking.series === undefined) {
    const isConfirmed = await confirmAction(
      "取消这次预约？",
      "取消预约",
      `${formatBookingWhen(booking.start, booking.end)}${booking.title === "" ? "" : ` · ${booking.title}`}`,
    );

    if (!isConfirmed) return false;
  } else {
    scope = await askScope(booking, "取消");
  }

  if (scope === undefined) return false;

  const result = await fetchClient.POST("/api/bookings/{id}/cancel", {
    params: { path: { id: booking.id }, header: roomHeader(booking.roomSlug) },
    body: { scope },
  });

  await refreshBookings({ removedIds: result.data === undefined ? [] : [booking.id] });

  if (result.data === undefined) {
    notify("error", "取消失败", errorMessage(result.error));

    return false;
  }

  notify("success", scope === "following" ? "已取消这次及以后的预约" : "已取消预约");

  return true;
}

/**
 * Extend an ongoing booking.
 *
 * @param booking - The booking.
 * @param minutes - Extension.
 * @returns The updated booking.
 */
export async function extendBooking(booking: Booking, minutes: 15 | 30 | 60): Promise<Booking | undefined> {
  const result = await fetchClient.POST("/api/bookings/{id}/extend", {
    params: { path: { id: booking.id }, header: roomHeader(booking.roomSlug) },
    body: { minutes },
  });

  await refreshBookings({ updated: result.data === undefined ? [] : [result.data] });

  if (result.data === undefined) {
    notify("error", "续时失败", errorMessage(result.error));

    return undefined;
  }

  notify(
    "success",
    "已续时",
    `现在用到 ${formatClockRange(result.data.start, result.data.end).split("–")[1] ?? ""}`,
  );

  return result.data;
}

/**
 * End an ongoing booking now, after confirmation.
 *
 * @param booking - The booking.
 * @returns Whether it ended.
 */
export async function endBooking(booking: Booking): Promise<boolean> {
  const isConfirmed = await confirmAction("现在结束使用？", "提前结束", "会议室会立即释放给其他人。", false);

  if (!isConfirmed) return false;

  const result = await fetchClient.POST("/api/bookings/{id}/end", {
    params: { path: { id: booking.id }, header: roomHeader(booking.roomSlug) },
  });

  await refreshBookings({ updated: result.data === undefined ? [] : [result.data] });

  if (result.data === undefined) {
    notify("error", "操作失败", errorMessage(result.error));

    return false;
  }

  notify("success", "已结束使用", "谢谢你及时释放会议室");

  return true;
}
