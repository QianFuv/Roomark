/**
 * Room data hooks with polling, plus a ticking clock.
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "../../api/client";
import { nowZoned } from "../../lib/time";

/** Polling interval for live room data. */
const POLL_MS = 30_000;

/**
 * Room info, live status and announcements, refreshed every 30 s and on focus.
 *
 * @param slug - Room slug.
 * @returns The query.
 */
export function useRoomDetail(slug: string) {
  return api.useQuery(
    "get",
    "/api/rooms/{slug}",
    { params: { path: { slug } } },
    { refetchInterval: POLL_MS, placeholderData: keepPreviousData, staleTime: 5_000 },
  );
}

/**
 * Confirmed bookings of a room in an inclusive date range, refreshed every 30 s.
 *
 * @param slug - Room slug.
 * @param from - First date `YYYY-MM-DD`.
 * @param to - Last date `YYYY-MM-DD`.
 * @param isEnabled - Whether to fetch.
 * @returns The query.
 */
export function useRoomBookings(slug: string, from: string, to: string, isEnabled = true) {
  return api.useQuery(
    "get",
    "/api/rooms/{slug}/bookings",
    { params: { path: { slug }, query: { from, to } } },
    { refetchInterval: POLL_MS, placeholderData: keepPreviousData, enabled: isEnabled },
  );
}

/**
 * Public "usually free" heatmap of the last 8 weeks.
 *
 * @param slug - Room slug.
 * @param isEnabled - Whether to fetch.
 * @returns The query.
 */
export function useRoomHeatmap(slug: string, isEnabled: boolean) {
  return api.useQuery(
    "get",
    "/api/rooms/{slug}/heatmap",
    { params: { path: { slug }, query: { weeks: 8 } } },
    { enabled: isEnabled, staleTime: 10 * 60_000 },
  );
}

/**
 * Current time, re-rendering at a fixed interval (aligned to the minute by default).
 *
 * @param intervalMs - Tick interval.
 * @returns The current zoned time.
 */
export function useNow(intervalMs = 15_000): Temporal.ZonedDateTime {
  const [now, setNow] = useState(nowZoned);

  useEffect(() => {
    const timer = setInterval(() => setNow(nowZoned()), intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
