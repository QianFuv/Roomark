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

/** Passcode of the admin created from the server environment (see playwright.config.ts). */
export const ADMIN_PASSCODE = "123456";

/** Passcode of the seeded claimed person 李四. */
export const LISI_PASSCODE = "246813";

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
  let adminToken = "";

  await expect(async () => {
    const login = await request.post("/api/sessions", { data: { name: "管理员", passcode: ADMIN_PASSCODE } });

    expect(login.ok(), await login.text()).toBeTruthy();
    // JUSTIFICATION: response shape is defined by the Roomark OpenAPI contract.
    adminToken = ((await login.json()) as { token: string }).token;
  }).toPass({ intervals: [7_000], timeout: 90_000 });
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
    code: string;
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

  const roomToken = rooms.find((room) => room.slug === ROOM_SLUG)?.code ?? "";

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
 * @param include - Only check inside this selector, e.g. an open overlay window above a dimmed page.
 */
export async function expectAccessible(page: Page, include?: string): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
  const results = await (include === undefined ? builder : builder.include(include)).analyze();

  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  expect(
    serious.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

/** One element whose content is wider than its box. */
export interface OverflowFinding {
  element: string;
  text: string;
  scrollWidth: number;
  clientWidth: number;
}

/**
 * Find horizontal overflow: page-level horizontal scroll, any scroll container (`overflow-x:
 * auto | scroll`) whose content is wider than it (only the calendar's paging region may scroll
 * sideways), and any other visible element whose content escapes its box. Intentional ellipsis,
 * inline boxes, clipped boxes and visually hidden helpers are ignored.
 *
 * @param page - The page.
 * @returns The offending elements.
 */
export async function findOverflow(page: Page): Promise<OverflowFinding[]> {
  return page.evaluate(() => {
    const findings: OverflowFinding[] = [];
    const root = document.documentElement;
    const pagingRegion = '[role="region"][aria-label$="的预约"]';

    if (root.scrollWidth > root.clientWidth + 1) {
      findings.push({
        element: "html",
        text: "page scrolls horizontally",
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
      });
    }

    for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
      if (!(element instanceof HTMLElement)) continue;

      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const isScroller = style.overflowX === "auto" || style.overflowX === "scroll";

      const isSkipped =
        style.display === "none" ||
        style.display === "inline" ||
        style.display === "contents" ||
        style.visibility === "hidden" ||
        rect.width <= 2 ||
        rect.height <= 2 ||
        (isScroller && element.closest(pagingRegion) !== null) ||
        (!isScroller && style.overflowX === "clip") ||
        (!isScroller && style.textOverflow === "ellipsis") ||
        style.clipPath !== "none" ||
        style.clip !== "auto";

      if (isSkipped || element.scrollWidth <= element.clientWidth + 1) continue;

      const id = element.id === "" ? "" : `#${element.id}`;
      const label = element.getAttribute("aria-label");
      const kind = isScroller ? "scroller " : "";

      findings.push({
        element: `${kind}${element.tagName.toLowerCase()}${id}${label === null ? "" : `[aria-label="${label}"]`}`,
        text: (element.textContent ?? "").trim().slice(0, 60),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      });
    }

    return findings;
  });
}

/** Largest unfilled gap, in CSS pixels, a layout may leave. */
const BLANK_BAND_LIMIT = 120;

/**
 * Find unfilled bands, measured at the top of the page:
 *
 * 1. Side-by-side columns: for every grid or row-flex container in `<main>` whose in-flow children
 *    sit side by side (horizontally disjoint, overlapping vertically by at least half the shorter
 *    one) and whose tallest child is at least 240 px tall, each child's painted bottom (its own box
 *    when it has a background or border, otherwise its lowest painted descendant) must be within
 *    {@link BLANK_BAND_LIMIT} of the row's bottom.
 * 2. Workspaces (`data-fill="viewport"`) must end within {@link BLANK_BAND_LIMIT} of the window's
 *    bottom.
 * 3. The side navigation's background must reach the bottom of the document.
 *
 * @param page - The page.
 * @returns One description per band.
 */
export async function findBlankBands(page: Page): Promise<string[]> {
  await page.evaluate(() => window.scrollTo(0, 0));

  return page.evaluate((limit) => {
    const bands = new Set<string>();

    /**
     * Whether an element paints a surface of its own.
     *
     * @param element - The element.
     * @returns `true` for a visible background or a bottom border.
     */
    function isPainted(element: Element): boolean {
      const style = getComputedStyle(element);
      const color = style.backgroundColor;
      const hasColor = color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color);

      return hasColor || style.backgroundImage !== "none" || parseFloat(style.borderBottomWidth) > 0;
    }

    /**
     * Whether a child takes part in its parent's layout and is visible.
     *
     * @param element - The element.
     * @returns `true` for in-flow, visible boxes.
     */
    function isInFlow(element: Element): boolean {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.position !== "absolute" &&
        style.position !== "fixed" &&
        rect.height > 2 &&
        rect.width > 2
      );
    }

    /**
     * Bottom edge of what an element visibly paints.
     *
     * @param element - The element.
     * @returns Bottom in viewport coordinates.
     */
    function paintedBottom(element: Element): number {
      const rect = element.getBoundingClientRect();
      const children = [...element.children].filter(isInFlow);

      if (isPainted(element) || children.length === 0) return rect.bottom;

      return Math.max(rect.top, ...children.map(paintedBottom));
    }

    /**
     * Short name of an element for the report.
     *
     * @param element - The element.
     * @returns The name.
     */
    function describe(element: Element): string {
      const label = element.getAttribute("aria-label");
      const heading = element.querySelector("h1, h2, h3")?.textContent?.trim();
      const named = label === null ? "" : `[${label}]`;
      const titled = heading === undefined ? "" : ` "${heading.slice(0, 20)}"`;

      return `${element.tagName.toLowerCase()}${named}${titled}`;
    }

    for (const container of document.querySelector("main")?.querySelectorAll("*") ?? []) {
      const style = getComputedStyle(container);

      const isRow =
        style.display.includes("grid") ||
        (style.display.includes("flex") && style.flexDirection.startsWith("row"));

      if (!isRow) continue;

      const kids = [...container.children].filter(isInFlow);
      const rects = kids.map((kid) => kid.getBoundingClientRect());

      if (Math.max(0, ...rects.map((rect) => rect.height)) < 240) continue;

      for (let first = 0; first < kids.length; first += 1) {
        for (let second = first + 1; second < kids.length; second += 1) {
          const left = rects[first];
          const right = rects[second];

          if (left === undefined || right === undefined) continue;

          const isDisjoint = left.right <= right.left + 1 || right.right <= left.left + 1;
          const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);

          if (!isDisjoint || overlap < Math.min(left.height, right.height) / 2) continue;

          const rowBottom = Math.max(left.bottom, right.bottom);

          for (const kid of [kids[first], kids[second]]) {
            if (kid === undefined) continue;

            const gap = rowBottom - paintedBottom(kid);

            if (gap > limit) {
              bands.add(`${describe(kid)} ends ${Math.round(gap)}px above its row in ${describe(container)}`);
            }
          }
        }
      }
    }

    for (const workspace of document.querySelectorAll("[data-fill='viewport']")) {
      const gap = window.innerHeight - workspace.getBoundingClientRect().bottom;

      if (gap > limit)
        bands.add(`${describe(workspace)} workspace ends ${Math.round(gap)}px above the window bottom`);
    }

    const rail = document.querySelector("nav[aria-label='侧边导航']")?.parentElement;

    if (rail !== null && rail !== undefined && getComputedStyle(rail).display !== "none") {
      const gap =
        document.documentElement.scrollHeight - (rail.getBoundingClientRect().bottom + window.scrollY);

      if (gap > 1) bands.add(`side navigation ends ${Math.round(gap)}px above the page bottom`);
    }

    return [...bands];
  }, BLANK_BAND_LIMIT);
}
