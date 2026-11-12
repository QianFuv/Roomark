/**
 * MSW request handlers backed by a small in-memory model of the Roomark API. Used by component
 * tests and by `vp dev --mode mock` to work without the Go server.
 *
 * @module
 */
import { HttpResponse, http } from "msw";

import type { components } from "../api/schema";
import { formatTimestamp, nowZoned, parseZoned, toTimestamp } from "../lib/time";

type Booking = components["schemas"]["Booking"];

type Person = components["schemas"]["Person"];

type Occurrence = components["schemas"]["Occurrence"];

/** Room slug served by the mocks. */
export const MOCK_SLUG = "9070";

/** Room token accepted by the mocks. */
export const MOCK_TOKEN = "mock-room-token-0001";

/** Passcode of the claimed mock person 李四. */
export const MOCK_PASSCODE = "246813";

const RULES = {
  openTime: "08:00",
  closeTime: "22:00",
  maxDurationMinutes: 240,
  maxAdvanceDays: 14,
  maxActivePerPerson: 0,
  recurringMaxWeeks: 20,
};

const ROOM = {
  id: 1,
  slug: MOCK_SLUG,
  name: "9070 会议室",
  location: "九号楼 7 层",
  capacity: 12,
  description: "",
  rules: RULES,
};

type MockRoom = typeof ROOM;

/** Mutable mock state. */
interface MockState {
  room: MockRoom;
  people: (Person & { passcode?: string; lockedUntil?: string })[];
  bookings: Booking[];
  sessions: Map<string, number>;
  nextId: number;
}

/**
 * Fresh mock state: three people (李四 claimed) and one booking tomorrow 10:00–11:00.
 *
 * @returns The state.
 */
function createMockState(): MockState {
  const tomorrow = nowZoned().toPlainDate().add({ days: 1 });

  return {
    room: ROOM,
    people: [
      { id: 1, name: "管理员", role: "teacher", isAdmin: true, hasPasscode: true, passcode: "123456" },
      { id: 2, name: "李四", role: "teacher", isAdmin: false, hasPasscode: true, passcode: MOCK_PASSCODE },
      { id: 3, name: "张三", role: "student", isAdmin: false, hasPasscode: false },
      {
        id: 4,
        name: "赵六",
        role: "student",
        isAdmin: false,
        hasPasscode: true,
        passcode: "999999",
        lockedUntil: "2099-01-01T10:15:00+08:00",
      },
    ],
    bookings: [
      {
        id: 1,
        roomSlug: MOCK_SLUG,
        kind: "normal",
        title: "组会",
        start: toTimestamp(tomorrow, "10:00"),
        end: toTimestamp(tomorrow, "11:00"),
        plannedEnd: toTimestamp(tomorrow, "11:00"),
        status: "confirmed",
        person: { id: 2, name: "李四", role: "teacher" },
        isMine: false,
        canEdit: false,
        releasedMinutes: 0,
      },
    ],
    sessions: new Map(),
    nextId: 10,
  };
}

let state = createMockState();

/** Reset the mock state between tests. */
export function resetMockState(): void {
  state = createMockState();
}

/**
 * Change the mock room's opening hours (tests that must not depend on the time of day use
 * `00:00`–`23:59`).
 *
 * @param openTime - Opening `HH:MM`.
 * @param closeTime - Closing `HH:MM`.
 */
export function setMockOpenHours(openTime: string, closeTime: string): void {
  state.room = { ...state.room, rules: { ...state.room.rules, openTime, closeTime } };
}

/**
 * Add a booking to the mock state (tests use it to set up ongoing bookings).
 *
 * @param booking - The booking; `id` is assigned.
 * @returns The stored booking.
 */
export function addMockBooking(booking: Omit<Booking, "id">): Booking {
  const stored: Booking = { ...booking, id: (state.nextId += 1) };

  state.bookings.push(stored);

  return stored;
}

/**
 * Person id of the request's session.
 *
 * @param request - The request.
 * @returns The person id.
 */
function sessionPerson(request: Request): number | undefined {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";

  return state.sessions.get(token);
}

/**
 * Problem response.
 *
 * @param status - HTTP status.
 * @param code - Machine code.
 * @param detail - Chinese message.
 * @param extra - Extra fields.
 * @returns The response.
 */
function problem(
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
): Response {
  return HttpResponse.json({ type: "about:blank", status, code, detail, ...extra }, { status });
}

/**
 * Create a session for a person.
 *
 * @param person - The person.
 * @returns Session body.
 */
function openSession(person: Person): components["schemas"]["Session"] {
  const token = `session-${person.id}-${state.sessions.size + 1}`;

  state.sessions.set(token, person.id);

  return {
    token,
    person: {
      id: person.id,
      name: person.name,
      role: person.role,
      isAdmin: person.isAdmin,
      hasPasscode: true,
    },
  };
}

/**
 * Bookings overlapping `[start, end)`.
 *
 * @param start - Start timestamp.
 * @param end - End timestamp.
 * @returns The first overlapping booking.
 */
function overlapping(start: string, end: string): Booking | undefined {
  const from = parseZoned(start).epochMilliseconds;
  const to = parseZoned(end).epochMilliseconds;

  return state.bookings.find(
    (booking) =>
      booking.status === "confirmed" &&
      parseZoned(booking.start).epochMilliseconds < to &&
      from < parseZoned(booking.end).epochMilliseconds,
  );
}

/**
 * Conflict body with a later same-day suggestion and the next day.
 *
 * @param start - Requested start.
 * @param end - Requested end.
 * @param other - The conflicting booking.
 * @param conflictEventId - Recorded conflict event; `0` for the live check, which records none.
 * @returns Conflict.
 */
function conflictFor(
  start: string,
  end: string,
  other: Booking,
  conflictEventId: number,
): components["schemas"]["Conflict"] {
  const duration = parseZoned(end).epochMilliseconds - parseZoned(start).epochMilliseconds;
  const later = parseZoned(other.end);
  const nextDayStart = parseZoned(start).add({ days: 1 });

  return {
    conflictWith: { name: other.person?.name ?? "", title: other.title, start: other.start, end: other.end },
    conflictEventId,
    suggestions: [
      {
        kind: "same_day",
        start: formatTimestamp(later),
        end: formatTimestamp(later.add({ milliseconds: duration })),
      },
      {
        kind: "other_day",
        start: formatTimestamp(nextDayStart),
        end: formatTimestamp(nextDayStart.add({ milliseconds: duration })),
      },
    ],
  };
}

/**
 * Expand a weekly rule (single weekday, count) into a preview.
 *
 * @param rule - The rule.
 * @returns Occurrences.
 */
function previewRule(rule: components["schemas"]["SeriesRule"]): Occurrence[] {
  const first = parseZoned(toTimestamp(rule.startDate, "00:00")).toPlainDate();
  const step = rule.freq === "biweekly" ? 14 : 7;

  return Array.from({ length: rule.count ?? 8 }, (_unused, index) => {
    const date = first.add({ days: index * step });
    const start = toTimestamp(date, rule.startTime);
    const end = toTimestamp(date, rule.endTime);
    const other = overlapping(start, end);

    return other === undefined
      ? { date: date.toString(), start, end, status: "ok" as const }
      : {
          date: date.toString(),
          start,
          end,
          status: "conflict" as const,
          conflict: conflictFor(start, end, other, 99),
        };
  });
}

/** All handlers. */
export const handlers = [
  http.get("*/api/rooms/:slug", () =>
    HttpResponse.json({ room: state.room, status: { state: "free" }, announcements: [] }),
  ),
  http.get("*/api/rooms/:slug/bookings", () => HttpResponse.json(state.bookings)),
  http.get("*/api/rooms/:slug/heatmap", () =>
    HttpResponse.json(
      Array.from({ length: 7 }, (_row, row) =>
        Array.from({ length: 14 }, (_cell, cell) => ((row + cell) % 5) / 5),
      ),
    ),
  ),
  http.get("*/api/people", () =>
    HttpResponse.json(
      state.people.map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
        isAdmin: person.isAdmin,
        hasPasscode: person.hasPasscode,
      })),
    ),
  ),
  http.post("*/api/rooms/:slug/check", async ({ request }) => {
    // JUSTIFICATION: mock request bodies follow the OpenAPI request schema.
    const body = (await request.json()) as { start: string; end: string };
    const other = overlapping(body.start, body.end);

    return HttpResponse.json(
      other === undefined
        ? { ok: true, violations: [] }
        : { ok: false, violations: [], conflict: conflictFor(body.start, body.end, other, 0) },
    );
  }),
  http.post("*/api/rooms/:slug/series/preview", async ({ request }) => {
    if (sessionPerson(request) === undefined)
      return problem(401, "session_required", "请先选择姓名并输入口令");

    // JUSTIFICATION: mock request bodies follow the OpenAPI request schema.
    const body = (await request.json()) as { rule: components["schemas"]["SeriesRule"] };

    return HttpResponse.json({ occurrences: previewRule(body.rule) });
  }),
  http.post("*/api/sessions", async ({ request }) => {
    // JUSTIFICATION: mock request bodies follow the OpenAPI request schema.
    const body = (await request.json()) as { personId?: number; name?: string; passcode: string };
    const person = state.people.find((item) => item.id === body.personId || item.name === body.name);

    if (person?.lockedUntil !== undefined) {
      return problem(423, "locked", "口令连续错误五次，请十五分钟后重试", {
        lockedUntil: person.lockedUntil,
      });
    }

    if (person === undefined || person.passcode !== body.passcode) {
      return problem(401, "invalid_passcode", "姓名或口令不正确");
    }

    return HttpResponse.json(openSession(person));
  }),
  http.post("*/api/people/:id/claim", async ({ request, params }) => {
    // JUSTIFICATION: mock request bodies follow the OpenAPI request schema.
    const body = (await request.json()) as { passcode: string };
    const person = state.people.find((item) => item.id === Number(params["id"]));

    if (person === undefined) return problem(404, "not_found", "不存在");

    if (person.hasPasscode) return problem(409, "already_claimed", "已设置口令");

    person.passcode = body.passcode;
    person.hasPasscode = true;

    return HttpResponse.json(openSession(person));
  }),
  http.post("*/api/rooms/:slug/bookings", async ({ request }) => {
    const personId = sessionPerson(request);

    if (personId === undefined) return problem(401, "session_required", "请先选择姓名并输入口令");

    // JUSTIFICATION: mock request bodies follow the OpenAPI request schema.
    const body = (await request.json()) as { start: string; end: string; title?: string };
    const other = overlapping(body.start, body.end);

    if (other !== undefined) {
      const conflict = conflictFor(body.start, body.end, other, 99);

      return problem(409, "booking_conflict", "该时段已被占用", { ...conflict });
    }

    const person = state.people.find((item) => item.id === personId);

    const booking: Booking = {
      id: (state.nextId += 1),
      roomSlug: MOCK_SLUG,
      kind: "normal",
      title: body.title ?? "",
      start: body.start,
      end: body.end,
      plannedEnd: body.end,
      status: "confirmed",
      person: { id: personId, name: person?.name ?? "", role: person?.role ?? "other" },
      isMine: true,
      canEdit: true,
      releasedMinutes: 0,
    };

    state.bookings.push(booking);

    return HttpResponse.json(booking, { status: 201 });
  }),
  http.post("*/api/bookings/:id/end", ({ request, params }) => {
    const booking = state.bookings.find((item) => item.id === Number(params["id"]));

    if (sessionPerson(request) === undefined)
      return problem(401, "session_required", "请先选择姓名并输入口令");

    if (booking === undefined) return problem(404, "not_found", "预约不存在");

    const now = nowZoned().round({ smallestUnit: "minute", roundingMode: "floor" });

    booking.releasedMinutes = Math.round(
      (parseZoned(booking.end).epochMilliseconds - now.epochMilliseconds) / 60_000,
    );
    booking.end = formatTimestamp(now);

    return HttpResponse.json(booking);
  }),
];
