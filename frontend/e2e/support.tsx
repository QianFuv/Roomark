/**
 * End-to-end helpers: seed the server through its API and run axe checks.
 *
 * @module
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Seeded room slug. */
export const ROOM_SLUG = "e2e9070";

/** Seeded room name. */
export const ROOM_NAME = "9070 会议室";

/** Passcode of the seeded claimed person 李四. */
export const LISI_PASSCODE = "2468";

/** Data created by {@link seed}. */
export interface Seeded {
  roomToken: string;
  adminToken: string;
}

/**
 * Tomorrow's date in Asia/Shanghai.
 *
 * @returns `YYYY-MM-DD`.
 */
export function tomorrow(): string {
  const now = new Date(Date.now() + 8 * 3600_000 + 24 * 3600_000);

  return now.toISOString().slice(0, 10);
}

/**
 * Create the room, people and a booking used by the tests (idempotent).
 *
 * @param request - Playwright API context.
 * @returns Tokens.
 */
export async function seed(request: APIRequestContext): Promise<Seeded> {
  const login = await request.post("/api/sessions", { data: { name: "管理员", passcode: "1234" } });

  expect(login.ok()).toBeTruthy();

  // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
  const adminToken = ((await login.json()) as { token: string }).token;
  const auth = { Authorization: `Bearer ${adminToken}` };

  const rules = {
    openTime: "00:00",
    closeTime: "23:45",
    maxDurationMinutes: 240,
    maxAdvanceDays: 14,
    maxActivePerPerson: 0,
    recurringMaxWeeks: 20,
  };

  // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
  let rooms = (await (await request.get("/api/admin/rooms", { headers: auth })).json()) as {
    slug: string;
    accessToken: string;
  }[];

  if (!rooms.some((room) => room.slug === ROOM_SLUG)) {
    const created = await request.post("/api/admin/rooms", {
      headers: auth,
      data: {
        slug: ROOM_SLUG,
        name: ROOM_NAME,
        location: "九号楼 7 层",
        capacity: 12,
        description: "",
        rules,
      },
    });

    expect(created.ok(), await created.text()).toBeTruthy();
    // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
    rooms = (await (await request.get("/api/admin/rooms", { headers: auth })).json()) as typeof rooms;
  }

  const roomToken = rooms.find((room) => room.slug === ROOM_SLUG)?.accessToken ?? "";

  await request.post("/api/admin/people/import", {
    headers: auth,
    data: {
      people: [
        { name: "李四", role: "teacher", isAdmin: false },
        { name: "访客甲", role: "student", isAdmin: false },
        { name: "访客乙", role: "student", isAdmin: false },
      ],
    },
  });

  // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
  const people = (await (
    await request.get(`/api/people?room=${ROOM_SLUG}`, { headers: { "X-Room-Token": roomToken } })
  ).json()) as { id: number; name: string; hasPasscode: boolean }[];

  const lisi = people.find((person) => person.name === "李四");
  let lisiToken = "";

  if (lisi !== undefined && !lisi.hasPasscode) {
    const claim = await request.post(`/api/people/${lisi.id}/claim?room=${ROOM_SLUG}`, {
      headers: { "X-Room-Token": roomToken },
      data: { passcode: LISI_PASSCODE },
    });

    // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
    lisiToken = ((await claim.json()) as { token: string }).token;
  } else {
    const session = await request.post("/api/sessions", { data: { name: "李四", passcode: LISI_PASSCODE } });

    // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
    lisiToken = ((await session.json()) as { token: string }).token;
  }

  await request.post(`/api/rooms/${ROOM_SLUG}/bookings`, {
    headers: { "X-Room-Token": roomToken, Authorization: `Bearer ${lisiToken}` },
    data: { start: `${tomorrow()}T10:00:00+08:00`, end: `${tomorrow()}T11:00:00+08:00`, title: "组会" },
  });

  return { roomToken, adminToken };
}

/**
 * Assert that a page has no serious or critical axe violations.
 *
 * @param page - The page.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  expect(
    serious.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}
