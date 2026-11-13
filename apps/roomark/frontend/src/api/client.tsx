/**
 * Typed HTTP client for the Roomark API (openapi-fetch + openapi-react-query).
 *
 * The client injects the session and room token headers and rewrites requests to the configured
 * server URL (empty means same origin).
 *
 * @module
 */
import { QueryClient } from "@tanstack/react-query";
import createFetchClient, { type Middleware } from "openapi-fetch";
import createQueryClient from "openapi-react-query";

import { isRecord, isString } from "../lib/guards";
import { appStore, roomToken, setSession } from "../state/app-store";
import type { components, paths } from "./schema";

/** RFC 9457 problem body returned by the API. */
export type Problem = Partial<components["schemas"]["Problem"]>;

/** Booking as returned by the API. */
export type Booking = components["schemas"]["Booking"];

/** Room as returned by the API. */
export type Room = components["schemas"]["Room"];

/** Live room status. */
export type RoomStatus = components["schemas"]["RoomStatus"];

/** A conflict with suggestions. */
export type Conflict = components["schemas"]["Conflict"];

/** A `[start, end)` range of RFC 3339 timestamps. */
export type TimeRange = components["schemas"]["TimeRange"];

/** A conflict suggestion. */
export type Suggestion = components["schemas"]["Suggestion"];

/** A listed person. */
export type Person = components["schemas"]["Person"];

/** An announcement. */
export type Announcement = components["schemas"]["Announcement"];

/** Room including access token (admin view). */
export type AdminRoom = components["schemas"]["AdminRoom"];

let serverBaseUrl = "";

/**
 * Set the server URL used for all API calls (from `PlatformService.ServerURL()`).
 *
 * @param url - Absolute base URL, or `""` for same origin.
 */
export function setServerBaseUrl(url: string): void {
  serverBaseUrl = url.replace(/\/+$/, "");
}

/**
 * Absolute URL for a server path (used for downloads such as CSV export and iCal feeds).
 *
 * @param path - Path starting with `/`.
 * @returns The URL.
 */
export function serverUrl(path: string): string {
  return `${serverBaseUrl}${path}`;
}

/**
 * Headers carrying the session (if any) and an optional room token.
 *
 * @param slug - Room whose token should be attached.
 * @returns The headers.
 */
export function authHeaders(slug?: string): Headers {
  const headers = new Headers();
  const session = appStore.state.session;

  if (session !== undefined) headers.set("Authorization", `Bearer ${session.token}`);
  const token = slug === undefined ? undefined : roomToken(slug);

  if (token !== undefined) headers.set("X-Room-Token", token);

  return headers;
}

const authMiddleware: Middleware = {
  async onRequest({ request, params }) {
    const slugParam = params.path?.["slug"] ?? params.query?.["room"];
    const slug = isString(slugParam) && slugParam !== "" ? slugParam : undefined;

    for (const [name, value] of authHeaders(slug)) {
      if (!request.headers.has(name)) request.headers.set(name, value);
    }

    if (serverBaseUrl === "") return request;
    const url = new URL(request.url);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    return new Request(`${serverBaseUrl}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: hasBody ? await request.arrayBuffer() : null,
      signal: request.signal,
    });
  },
  onResponse({ response, request }) {
    if (response.status === 401 && request.headers.has("Authorization")) setSession(undefined);

    return response;
  },
};

/** Raw typed fetch client. */
export const fetchClient = createFetchClient<paths>({
  baseUrl: globalThis.location?.origin ?? "http://localhost",
});

fetchClient.use(authMiddleware);

/** TanStack Query bindings for the typed client. */
export const api = createQueryClient(fetchClient);

/** Shared query client. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) =>
        failureCount < 2 && (problemStatus(error) === undefined || isSessionExpired(error)),
    },
  },
});

/**
 * Interpret an error thrown by the API client as a problem body.
 *
 * @param error - Anything thrown.
 * @returns The problem, or `undefined` for network and programming errors.
 */
export function asProblem(error: unknown): Problem | undefined {
  return isProblem(error) ? error : undefined;
}

/**
 * Whether a thrown value is an RFC 9457 problem body from the API.
 *
 * @param error - Anything thrown.
 * @returns `true` for problem bodies.
 */
function isProblem(error: unknown): error is Problem {
  return isRecord(error) && ("code" in error || "status" in error || "detail" in error);
}

/**
 * HTTP status of an API error.
 *
 * @param error - Anything thrown.
 * @returns The status, or `undefined` for network errors.
 */
export function problemStatus(error: unknown): number | undefined {
  return asProblem(error)?.status;
}

/**
 * User-facing Chinese message for any error.
 *
 * @param error - Anything thrown.
 * @returns The message.
 */
export function errorMessage(error: unknown): string {
  const problem = asProblem(error);

  if (problem?.detail !== undefined && problem.detail !== "") return problem.detail;

  if (problem?.violations !== undefined && problem.violations !== null && problem.violations.length > 0) {
    return problem.violations.map((violation) => violation.message).join("；");
  }

  if (problem?.status === 403) return "没有权限";

  if (problem !== undefined) return "操作失败，请稍后再试";

  return "网络连接失败，请检查网络";
}

/**
 * Whether an error means the stored session expired or was signed out elsewhere. The session is
 * dropped on that response, so retrying the request succeeds for public data.
 *
 * @param error - Anything thrown.
 * @returns `true` for `session_invalid`.
 */
function isSessionExpired(error: unknown): boolean {
  return asProblem(error)?.code === "session_invalid";
}

/**
 * Whether an error means the room token is missing or no longer valid.
 *
 * @param error - Anything thrown.
 * @returns `true` for `room_token_required` / `room_token_invalid`.
 */
export function isRoomTokenError(error: unknown): boolean {
  const code = asProblem(error)?.code;

  return code === "room_token_required" || code === "room_token_invalid";
}

/** What a booking write changed, used to update cached views before the refetch lands. */
export interface BookingChange {
  updated?: readonly Booking[] | undefined;
  removedIds?: readonly number[] | undefined;
}

/**
 * Whether a value is a booking object from the API.
 *
 * @param value - Any cached value.
 * @returns `true` for booking records.
 */
function isBookingRecord(value: unknown): value is Booking {
  return isRecord(value) && "roomSlug" in value && "id" in value && "start" in value && "end" in value;
}

/**
 * Replace changed bookings and drop removed ones anywhere inside a cached response (lists, my
 * bookings with series, room status). Unchanged branches keep their identity.
 *
 * @param value - Cached data.
 * @param updated - Changed bookings by id.
 * @param removed - Removed booking ids.
 * @returns The patched data.
 */
function patchBookings(
  value: unknown,
  updated: ReadonlyMap<number, Booking>,
  removed: ReadonlySet<number>,
): unknown {
  if (isBookingRecord(value)) return updated.get(value.id) ?? value;

  if (Array.isArray(value)) {
    const kept = value.filter((entry) => !(isBookingRecord(entry) && removed.has(entry.id)));
    const next = kept.map((entry) => patchBookings(entry, updated, removed));

    return next.length === value.length && next.every((entry, index) => entry === value[index])
      ? value
      : next;
  }

  if (!isRecord(value)) return value;

  let isChanged = false;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    next[key] = patchBookings(entry, updated, removed);
    isChanged ||= next[key] !== entry;
  }

  return isChanged ? next : value;
}

/**
 * Whether a cached query shows bookings, room status or statistics derived from them.
 *
 * @param queryKey - The query key (`[method, path, init]`).
 * @returns `true` for room, my and admin queries.
 */
function showsBookings(queryKey: readonly unknown[]): boolean {
  const path = queryKey[1];

  return (
    isString(path) &&
    (path.startsWith("/api/rooms") || path.startsWith("/api/me") || path.startsWith("/api/admin"))
  );
}

/**
 * Bring every view of bookings up to date after a write: patch cached responses with the
 * server's result right away (also queries of pages that are not mounted), then refetch the
 * mounted ones and mark the rest stale. Room status, room bookings for every cached range, my
 * bookings, the heatmap and admin lists are all covered.
 *
 * @param change - Bookings the server returned or removed, if known.
 * @returns A promise that resolves when mounted queries have refetched.
 */
export async function refreshBookings(change?: BookingChange): Promise<void> {
  const updated = new Map((change?.updated ?? []).map((booking) => [booking.id, booking]));
  const removed = new Set(change?.removedIds ?? []);

  if (updated.size > 0 || removed.size > 0) {
    queryClient.setQueriesData({ predicate: (query) => showsBookings(query.queryKey) }, (data: unknown) =>
      data === undefined ? data : patchBookings(data, updated, removed),
    );
  }

  await queryClient.invalidateQueries({ predicate: (query) => showsBookings(query.queryKey) });
}
