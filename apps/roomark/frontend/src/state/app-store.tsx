/**
 * Persistent client state: the session and the room tokens this device has scanned.
 *
 * @module
 */
import { createStore, useSelector } from "@tanstack/react-store";
import { z } from "zod";

const STORAGE_KEY = "roomark.state.v1";

const personSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.enum(["teacher", "student", "other"]),
  isAdmin: z.boolean(),
  hasPasscode: z.boolean(),
});

const persistedSchema = z.object({
  session: z.object({ token: z.string(), person: personSchema }).optional(),
  rooms: z.record(z.string(), z.object({ token: z.string(), name: z.string().optional() })).default({}),
  lastRoomSlug: z.string().optional(),
  recentTitles: z.array(z.string()).default([]),
});

/** Person stored with the session. */
type StoredPerson = z.infer<typeof personSchema>;

/** Session stored on this device. */
export interface StoredSession {
  token: string;
  person: StoredPerson;
}

/** Room token remembered for a slug. */
export interface StoredRoom {
  token: string;
  name?: string | undefined;
}

/** Whole persisted client state. */
export interface AppState {
  session?: StoredSession | undefined;
  rooms: Record<string, StoredRoom>;
  lastRoomSlug?: string | undefined;
  recentTitles?: string[] | undefined;
}

/**
 * Read the persisted state, tolerating missing or corrupted storage.
 *
 * @returns The state.
 */
function loadState(): AppState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

    if (raw === null || raw === undefined) return { rooms: {} };
    const parsed = persistedSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data : { rooms: {} };
  } catch {
    return { rooms: {} };
  }
}

/** The application store. */
export const appStore = createStore<AppState>(loadState());

/**
 * Persist the state. Storage may be unavailable (private mode); the state then lives in memory.
 *
 * @param state - The state to save.
 * @returns Whether saving succeeded.
 */
function saveState(state: AppState): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));

    return true;
  } catch {
    return false;
  }
}

appStore.subscribe(saveState);

/**
 * Remember a room token (from a scanned QR code).
 *
 * @param slug - Room slug.
 * @param token - Room token.
 */
export function rememberRoom(slug: string, token: string): void {
  appStore.setState((state) => ({
    ...state,
    rooms: { ...state.rooms, [slug]: { ...state.rooms[slug], token } },
    lastRoomSlug: slug,
  }));
}

/**
 * Store the room's display name next to its token.
 *
 * @param slug - Room slug.
 * @param name - Room name.
 */
export function rememberRoomName(slug: string, name: string): void {
  const current = appStore.state.rooms[slug];

  if (current === undefined || current.name === name) return;
  appStore.setState((state) => ({
    ...state,
    rooms: { ...state.rooms, [slug]: { token: current.token, name } },
  }));
}

/**
 * Forget a room (e.g. after its token was rotated).
 *
 * @param slug - Room slug.
 */
export function forgetRoom(slug: string): void {
  appStore.setState((state) => {
    const rooms = { ...state.rooms };
    delete rooms[slug];

    return {
      ...state,
      rooms,
      lastRoomSlug: state.lastRoomSlug === slug ? undefined : state.lastRoomSlug,
    };
  });
}

/**
 * Mark a room as the most recently viewed.
 *
 * @param slug - Room slug.
 */
export function markLastRoom(slug: string): void {
  if (appStore.state.lastRoomSlug === slug) return;
  appStore.setState((state) => ({ ...state, lastRoomSlug: slug }));
}

/**
 * Store or clear the session.
 *
 * @param session - The new session, or `undefined` to log out locally.
 */
export function setSession(session: StoredSession | undefined): void {
  appStore.setState((state) => ({ ...state, session }));
}

/**
 * Room token for a slug, if known.
 *
 * @param slug - Room slug.
 * @returns The token.
 */
export function roomToken(slug: string): string | undefined {
  return appStore.state.rooms[slug]?.token;
}

/**
 * React hook: the current session.
 *
 * @returns The session or `undefined`.
 */
export function useSession(): StoredSession | undefined {
  return useSelector(appStore, (state) => state.session);
}

/**
 * React hook: remembered rooms as a list.
 *
 * @returns Slugs with tokens and names.
 */
export function useRememberedRooms(): ({ slug: string } & StoredRoom)[] {
  const rooms = useSelector(appStore, (state) => state.rooms);

  return Object.entries(rooms).map(([slug, room]) => ({ slug, ...room }));
}

/** How many recent purposes are kept for one-tap reuse. */
const RECENT_TITLE_LIMIT = 6;

/**
 * Remember a purpose (用途) for the recent-purpose chips, newest first.
 *
 * @param title - The purpose just used.
 */
export function rememberTitle(title: string): void {
  const trimmed = title.trim();

  if (trimmed === "") return;
  appStore.setState((state) => ({
    ...state,
    recentTitles: [trimmed, ...(state.recentTitles ?? []).filter((item) => item !== trimmed)].slice(
      0,
      RECENT_TITLE_LIMIT,
    ),
  }));
}

/**
 * Recently used purposes on this device, newest first.
 *
 * @returns The purposes.
 */
export function useRecentTitles(): readonly string[] {
  return useSelector(appStore, (state) => state.recentTitles ?? EMPTY_TITLES);
}

const EMPTY_TITLES: readonly string[] = [];
