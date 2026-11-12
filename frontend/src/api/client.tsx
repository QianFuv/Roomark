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
      retry: (failureCount, error) => failureCount < 2 && problemStatus(error) === undefined,
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

  if (problem?.status === 403) return "没有权限执行此操作";

  if (problem !== undefined) return "操作失败，请稍后重试";

  return "网络连接失败，请检查网络后重试";
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

/**
 * Refetch everything that shows bookings after a write.
 *
 * @returns A promise that resolves when invalidation is scheduled.
 */
export function invalidateBookings(): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const path = query.queryKey[1];

      return (
        isString(path) &&
        (path.startsWith("/api/rooms") || path.startsWith("/api/me") || path.startsWith("/api/admin"))
      );
    },
  });
}
