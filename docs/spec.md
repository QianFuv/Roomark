# Roomark Specification

Roomark is a meeting-room booking app for a small research group (a handful of teachers and students). Each room has one QR code at its door. People scan it to see whether the room is free and to book it.

This document is the contract between the backend and the frontend. When code and this document disagree, fix the code or raise the conflict; do not silently diverge.

- UI language: Simplified Chinese only.
- Time zone: always `Asia/Shanghai`. No cross-midnight bookings.
- Tech stack: `C:\Users\57676\.t3\userdata\attachments\0c5331be-1f70-401f-b735-95ebb21371c4-978aeab8-ad14-4671-a43d-a847d19a4478-md.md` ("Wails 多端技术栈（StyleX 版）"). Every library choice follows it. Version numbers there are minimums.
- Browser baseline: `since 2025-01-01` (Chromium ≥ 132, Safari/iOS ≥ 18.3), generated from the current year as the stack doc describes.

## 1. Targets and architecture

One Go module (`roomark`), one React frontend, three build targets:

| Target | Build | Role |
| --- | --- | --- |
| Server (= Web) | `wails3 task build:server` (`-tags server`) | Wails server mode. Serves the web frontend, the business HTTP API under `/api`, iCal feeds under `/ical`, and owns the only SQLite database. |
| PC (Windows) | `wails3 task build` / `package` | Wails desktop window + system tray. Calls the server's HTTP API. No local business data. |
| Android | `wails3 task android:package` | Wails Android app. Calls the server's HTTP API. No local business data. |

- All business logic lives behind the HTTP API (huma). Desktop and Android clients talk to the server over HTTP exactly like the browser does.
- Wails bindings are used only for host capabilities (platform info, server URL setting, file saving/sharing, QR scanning, tray, autostart). See §7.
- The frontend detects the platform through `PlatformService.Info()` (§7). In the server build it reports `web`.
- Server build configuration (env vars, all optional except where noted):
  - `ROOMARK_DB` — SQLite file path (default `./roomark.db`).
  - `ROOMARK_PUBLIC_URL` — public base URL used in QR links and iCal URLs (e.g. `https://rooms.example.com`). Required for QR export.
  - `ROOMARK_ALLOWED_ORIGINS` — extra CORS origins, comma separated. The Wails desktop and Android app origins are always allowed.
  - `ROOMARK_ADMIN_NAME`, `ROOMARK_ADMIN_PASSCODE` — on startup, if no admin exists, create this admin person.
  - `ROOMARK_TRUSTED_PROXIES` — comma-separated CIDRs or addresses of reverse proxies (e.g. the Docker network of Nginx Proxy Manager, `172.20.0.0/16`). Only requests from these peers may supply the client address through `X-Real-IP`; it feeds the per-IP login rate limit.
  - `WAILS_SERVER_HOST`, `WAILS_SERVER_PORT` — Wails server mode listen address.
- Desktop/Android: the default server URL is injected at build time (`-ldflags "-X main.defaultServerURL=..."`) and can be changed in Settings.

## 2. Product rules

### 2.1 Rooms and room code

- A room has: `slug` (e.g. `9070`), name, location, capacity, description, and rules (§2.4).
- Each room has a fixed random **room code**: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L), unique across rooms, case-insensitive on input, generated when the room is created and never rotated. The door QR encodes `{PUBLIC_URL}/r/{slug}?k={code}`, and the poster also prints the code so people can type it (e.g. on the desktop app). `X-Room-Token` carries the code.
- Every room-scoped API call needs header `X-Room-Token` matching that room, unless the caller is an admin. Without it the room is invisible (`403 room_token_required` / `room_token_invalid`). Exception: `/api/bookings/{id}/*` only needs the booker's own session, so people can manage their bookings from any device.
- Clients remember tokens per room (web: `localStorage`; apps: same, inside the webview) and strip `k` from the address bar after storing it.
- Binding by typing: `POST /api/room-codes/resolve {code}` → `{ slug, name }` (rate-limited per client IP, failed attempts count towards the limit). Repeated wrong room codes on any endpoint are rate-limited per IP as well.

### 2.2 People and personal passcode

- No accounts. A person = name + role (`teacher` | `student` | `other`) + optional admin flag + personal passcode.
- Admin maintains a preset list. Anyone not on it can add themselves with a custom name (role `other`).
- **Everyone uses a 6-digit numeric passcode.**
- First use of a preset name: the person sets the passcode (claim). After that, anyone using that name must enter it.
- Login works on any device: pick name (or type it on the admin login) + passcode → long-lived session (365 days, sliding).
- 5 consecutive wrong passcodes lock that person for 15 minutes. Also rate-limit login attempts per client IP.
- Forgotten passcode: an admin resets it; the person sets a new one on next use.
- Viewing room status, calendar and heatmap needs only the room token. Booking and managing bookings need a session.
- People can only modify their own bookings. Admins can modify everything.
- Admins are people with `isAdmin = true`. They log in the same way; the UI shows a 管理 entry.
- Deleting a person is a soft delete. Their history stays in stats.

### 2.3 Bookings

- Statuses: `confirmed`, `cancelled`. Nothing else. No approval, no check-in, no no-show tracking.
- `kind`: `normal` or `block` (admin-only "不可预约" time, e.g. 消杀/考试; rules other than conflicts do not apply).
- A booking has a required `title` (用途, 1–200 chars after trimming; blocks too). Everyone who can see the room sees booker name and title. Quick use ("马上使用") also asks for 用途.
- Grid: start and end align to 15 minutes. Exception: quick use ("马上使用") starts at the current minute.
- A free slot books instantly. A conflict returns `409` with **suggestions** (§2.5).
- Edit: change time/title; re-validated excluding itself.
- Cancel: future or ongoing booking. Cancelling an ongoing booking is not allowed; use end-early.
- End early: only while ongoing; sets `end` to the current minute and records `releasedMinutes`.
- Extend: by 15/30/60 minutes, only if the extension is free, within open hours and within max duration.
- "Ongoing" / "finished" are derived from time; there is no background job.

### 2.4 Rules (per room, admin-editable, defaults)

| Rule | Default |
| --- | --- |
| Open hours (`HH:MM`, close at most `23:59`) | 08:00–22:00 |
| Max duration per booking | 240 min |
| Max advance for single bookings | 14 days |
| Max active bookings per person (a series counts as 1) | 0 = unlimited |
| Max span for recurring series | 20 weeks |

Violations return `422` with machine-readable codes (`outside_open_hours`, `too_long`, `too_far_ahead`, `in_past`, `misaligned`, `too_many_active`, `series_too_long`, `invalid_range`) plus a Chinese message.

### 2.5 Conflict suggestions

Given a requested `[start, end)` of duration D that conflicts:

1. Same day: free windows of length D, aligned to 15 min, inside open hours, not in the past, ordered by `|candidateStart − requestedStart|`. Return up to 2 (prefer one earlier and one later when both exist).
2. Following days: the same clock time on the next days where it is free and allowed by rules (advance limit). Return up to 3.

Each suggestion: `{start, end, kind: "same_day" | "other_day"}`. Every 409 also returns the conflicting booking (`name`, `title`, `start`, `end`) and a `conflictEventId`. When the client later books a suggestion it passes `conflictEventId` so stats can count accepted suggestions. Conflicts seen only through the live `/check` are not recorded; when the client books a slot it took from a `/check` suggestion it sends `suggestedFrom: {start, end}` (the originally requested range) instead, and the server records one conflict event for that range, marked accepted, if the booked slot is a valid suggestion for it.

### 2.6 Recurring bookings

- Rule: `freq` = `weekly` | `biweekly`; `weekdays` ⊆ 1..7 (ISO, Monday = 1); `startDate`; one of `untilDate` / `count`; `startTime`, `endTime` (HH:MM).
- Default UI: weekly, weekday of the chosen date, count 8.
- Preview before creating: every occurrence with status `ok` | `conflict` | `violation`, conflict details and suggestions per occurrence.
- Create sends the rule plus per-occurrence overrides: `skip`, or `move` to `{start, end}` (usually a suggestion). Default for conflicts is skip. The server re-validates everything; if anything changed since preview, return `409` with a fresh preview.
- Edit/cancel on an occurrence takes `scope`: `this` | `following`.
- Series span is limited by "Max span for recurring series" instead of the 14-day advance rule.

### 2.7 Announcements

Admin-managed. Fields: room (or all rooms), title, body (plain text), `startsAt`, `endsAt`, `pinned`. Active ones show as a banner on the room page.

### 2.8 Statistics

Admin-only full stats; everyone with the room token sees the public "会议热力图" (this week's bookings by weekday × hour, see §4.2).

Filters: room (or all), date range (presets: 本周 / 本月 / 本学期 / 自定义), role (all / teacher / student / other).

- **Overview** with previous-period comparison: bookings count, actual used hours (cancelled and early-released time excluded), utilization (used ÷ open hours in range), distinct people.
- **Trend**: utilization per day or per week (auto by range length), plus previous period overlay.
- **Heatmap**: weekday × hour (08–22), occupancy ratio.
- **Habits**: duration histogram (≤30m, ≤1h, ≤2h, ≤3h, ≤4h, >4h); lead time buckets (same day, 1–3 days, 4–7 days, >7 days); single vs recurring share.
- **Demand gap**: conflict count, top conflicting slots (weekday + hour), suggestion acceptance rate.
- **Cancellations**: cancel rate, last-minute rate (cancelled < 1 h before start), early-end count and average released minutes.
- **People ranking**: by used hours and by booking count.
- CSV export of booking rows for the filter.

### 2.9 iCal

- Room feed: `GET /ical/{slug}.ics?k={roomToken}`.
- Personal feed: `GET /ical/person/{feedToken}.ics` (`feedToken` random per person, shown in 我的).

## 3. Data model (SQLite)

Times stored as Unix seconds (UTC). Suggested tables; the backend may refine names/columns but must keep the semantics.

- `rooms(id, slug UNIQUE, name, location, capacity, description, access_token (the room code), open_time, close_time, max_duration_min, max_advance_days, max_active_per_person, recurring_max_weeks, archived_at, created_at)`
- `people(id, name UNIQUE NOCASE among non-deleted, role, is_admin, passcode_hash, failed_attempts, locked_until, feed_token, source ('preset'|'self'), deleted_at, created_at)`
- `sessions(id, token_hash UNIQUE, person_id, created_at, last_used_at, expires_at)`
- `series(id, room_id, person_id NULL for blocks, kind, title, rule_json, created_at)`
- `bookings(id, room_id, person_id NULL for blocks, series_id NULL, kind, title, start_at, end_at, planned_end_at, status, created_at, updated_at, cancelled_at, cancelled_by)`
- `announcements(id, room_id NULL, title, body, starts_at, ends_at, pinned, created_at)`
- `conflict_events(id, room_id, person_id, requested_start, requested_end, source ('single'|'series'), accepted_booking_id NULL, created_at)`

Passcodes and session tokens are stored hashed (`golang.org/x/crypto`). All booking writes run in a transaction that checks conflicts before inserting (single writer connection), so two clients can never book the same slot.

## 4. HTTP API

- Prefix `/api`. JSON. Times are RFC 3339 with `+08:00`. Dates `YYYY-MM-DD`, clock times `HH:MM`.
- Auth headers: `X-Room-Token` (room scope), `Authorization: Bearer <session>` (person scope).
- Errors use huma's RFC 9457 problem JSON with an extra `code` field (snake_case) and Chinese `detail`.
- OpenAPI 3.1 is exported to `api/openapi.json` (command: `go run ./cmd/openapi` or a `task` target). The frontend generates `frontend/src/api/schema.d.ts` from it with openapi-typescript.

### 4.1 Shapes

```
Room            { id, slug, name, location, capacity, description, rules: Rules }
Rules           { openTime, closeTime, maxDurationMinutes, maxAdvanceDays, maxActivePerPerson, recurringMaxWeeks }
RoomStatus      { state: "free"|"busy", current?: Booking, next?: Booking, freeUntil?: time, busyUntil?: time }
Booking         { id, roomSlug, kind, title, start, end, plannedEnd, status,
                  person?: { id, name, role }, series?: { id, index, total, ruleSummary },
                  isMine, canEdit }
Suggestion      { start, end, kind: "same_day"|"other_day" }
Conflict        { conflictWith: { name, title, start, end }, suggestions: Suggestion[], conflictEventId }
Person          { id, name, role, isAdmin, hasPasscode }
Session         { token, person: Person }
SeriesRule      { freq, weekdays, startDate, untilDate?, count?, startTime, endTime }
Occurrence      { date, start, end, status: "ok"|"conflict"|"violation", conflict?: Conflict, violations?: Violation[] }
Override        { date, action: "skip"|"move", start?, end? }
Violation       { code, message }
Announcement    { id, roomSlug?, title, body, startsAt, endsAt, pinned }
```

### 4.2 Endpoints

Room scope (`X-Room-Token` or admin):

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/rooms/{slug}` | `{ room, status, announcements }` |
| GET | `/api/rooms/{slug}/bookings?from&to` | confirmed bookings in date range (max 62 days) |
| GET | `/api/rooms/{slug}/heatmap?week=YYYY-MM-DD` | public 会议热力图 for the Monday–Sunday week containing `week` (default: current week): `{ weekStart, days: date[7], hours: int[] (room open hour .. last hour before close), cells: number[7][hours] }` where each cell is the booked share (0–1) of that hour on that day, counting confirmed bookings and blocks |
| POST | `/api/rooms/{slug}/check` | `{start,end,excludeBookingId?}` → `{ ok, violations, conflict? }` (no write; for live form feedback; `excludeBookingId` ignores the booking being edited) |
| GET | `/api/people` | preset + self-added people `{ id, name, role, hasPasscode }` (needs any valid room token via `X-Room-Token` + `?room={slug}`) |

Person scope (session; room endpoints also need the room token):

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/rooms/{slug}/bookings` | `{start,end,title,conflictEventId?,suggestedFrom?: {start,end}, onBehalfOf? (admin), kind? (admin: block)}` → 201 Booking / 409 Conflict / 422 |
| POST | `/api/rooms/{slug}/quick` | `{minutes: 30\|60\|90\|120, title}`; capped at next booking / close time; returns Booking |
| POST | `/api/rooms/{slug}/series/preview` | `{rule}` → `{ occurrences: Occurrence[] }` |
| POST | `/api/rooms/{slug}/series` | `{rule,title?,overrides,onBehalfOf?,kind?}` → `{ seriesId, created: Booking[], skipped: date[] }` / 409 `{ occurrences }` |
| PATCH | `/api/bookings/{id}` | `{start?,end?,title?,scope?}` |
| POST | `/api/bookings/{id}/cancel` | `{scope?: "this"\|"following"}` |
| POST | `/api/bookings/{id}/extend` | `{minutes: 15\|30\|60}` |
| POST | `/api/bookings/{id}/end` | end early |
| GET | `/api/me` | Person |
| GET | `/api/me/bookings?past=false` | `{ singles: Booking[], series: [{ id, roomSlug, title, ruleSummary, firstDate, lastDate, remaining, occurrences: Booking[] }] }` |
| GET | `/api/me/feeds` | `{ personFeedUrl }` |
| PUT | `/api/me/passcode` | `{current, next}` |
| DELETE | `/api/sessions/current` | logout |

Session creation (no session needed; rate-limited):

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/sessions` | `{personId? , name?, passcode}` → Session; `409 passcode_not_set` if unclaimed; `423 locked` with `lockedUntil` |
| POST | `/api/people/{id}/claim` | `{passcode}` → Session; only if no passcode yet; needs `X-Room-Token` |
| POST | `/api/people` | `{name, passcode}` → Session (role `other`); `409 name_taken`; needs `X-Room-Token` |

Admin (`isAdmin`):

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/api/admin/rooms` | list incl. tokens / create |
| PATCH | `/api/admin/rooms/{id}` | edit info + rules, archive |
| GET | `/api/admin/rooms/{id}/qr` | `{ url, code }` — the frontend renders the poster |
| GET/POST | `/api/admin/people` | list / create preset |
| POST | `/api/admin/people/import` | `{ people: [{name, role}] }` |
| PATCH/DELETE | `/api/admin/people/{id}` | edit (name, role, isAdmin) / soft delete |
| POST | `/api/admin/people/{id}/reset-passcode` | |
| GET | `/api/admin/bookings?room&from&to&personId&status` | |
| GET/POST/PATCH/DELETE | `/api/admin/announcements[/{id}]` | |
| GET | `/api/admin/stats?room&from&to&role` | all §2.8 sections in one response |
| GET | `/api/admin/stats/export.csv?...` | |

Non-API: `GET /ical/{slug}.ics?k=`, `GET /ical/person/{feedToken}.ics`. Everything else falls back to the SPA `index.html`.

## 5. Frontend routes and flows

Three layout tiers, each designed on purpose (not just stretched):

| Tier | Viewport | Used by |
| --- | --- | --- |
| Mobile | < 768 px | phones (browser and Android app) |
| Narrow | 768–1279 px | PC app and web in a smaller window |
| Wide | ≥ 1280 px | PC app and web maximised |

Light and dark themes. Colors follow the T3 Soft palette in `docs/design/t3-soft.json` (dark = `colors`, light = `variants.light`). No visible horizontal scrollbars in pickers; date and time choices use compact, scroll-free pickers.

| Route | Content |
| --- | --- |
| `/` | No stored room: "请扫描会议室门口的二维码" (apps: 扫码绑定 / 粘贴链接). One room: redirect. Several: room cards with live status. |
| `/r/$slug` | Room home: big status (空闲 / 使用中：某某 到 15:30, "空闲至 16:00"), primary action 马上使用 (30/60/90/120, options beyond the free window disabled), 预约 button, next booking (with its date when it is not today: 今天/明天/后天 or `11月14日 周五`), today's timeline, announcement banner, "会议热力图" for the week with previous/next week controls (collapsible). Room tabs order: 概况 · 预约 · 日历. Calendar day/week changes animate (slide) with Motion. Mine-and-ongoing: 续时 / 提前结束. |
| `/r/$slug/calendar` | 3-day view on phones (swipe), week view ≥ 768 px. Tap empty slot → booking sheet prefilled. Booking blocks show name, title, 🔁 for series. Tap → detail sheet. |
| `/r/$slug/book` | Booking form: date, start/end (15-min steps), 用途, 重复 toggle. Live check via `/check`. Conflict → suggestion chips (one tap books). Recurring → preview list (see below). |
| `/me` | Identity (name, switch, logout, change passcode), 我的预约: upcoming / past tabs; series collapse into one card ("组会 · 每周三 14:00–16:00 · 11/19–1/7 · 还剩 6 次"), expandable. iCal feed links with copy buttons. |
| `/admin/*` | 房间 (info, rules, 导出二维码), 名单 (CRUD, import, reset passcode, admin flag), 预约 (filterable table, edit/cancel, 代人预约, 不可预约时段 incl. recurring), 公告, 统计. |
| `/settings` | Apps only: server URL; desktop: 开机自启. |

Identity flow (sheet, triggered by any write action when there is no session): search the preset list → if unclaimed, set a 6-digit passcode (enter twice) → done. "我不在名单里" → type name → set passcode. Claimed names → enter passcode. Locked → show remaining time. Admin login on `/admin` takes name + passcode.

Recurring preview layout:

```
共 8 次 · 7 次可约 · 1 次有冲突
11月19日 周三 14:00–16:00   ✓
11月26日 周三 14:00–16:00   ✗ 李四 14:00–15:00 已占用
          [当天 15:00–17:00] [11月27日 周四 14:00–16:00] [跳过这次]
…                                        [预约 7 次]
```

Conflicting occurrences default to 跳过; tapping a suggestion switches to it and the submit count updates. Edit/cancel of an occurrence asks 仅这一次 / 这次及以后全部. Destructive actions confirm first.

QR export (admin → 房间 → 导出二维码): live preview; layouts A4 poster (room name large, QR, "扫码查看空闲 · 预约", small URL), A5 poster, QR only (square); formats PNG (300 dpi) and PDF. The poster shows the room code in large monospace text under the QR ("房间码 K7M2XQ"). Delivery: web → browser download; desktop → native save dialog via `FileService`; Android → `FileService` (share/save).

Polling: room status and calendar refetch every 30 s and on window focus (TanStack Query). No WebSocket.

## 6. Repository layout and ownership

Two implementers work in the same checkout at the same time. Stay inside your paths. **Do not run any mutating git command** (no add/commit/stash/checkout/reset); the coordinator reviews and commits.

| Path | Owner |
| --- | --- |
| `*.go`, `cmd/**`, `internal/**`, `db/**`, `sqlc.yaml`, `go.mod`, `go.sum`, `.golangci.yml` | Backend |
| `build/**` (Taskfiles, Android manifest/Java, Windows manifest), root `Taskfile.yml`, `build/config.yml` | Backend |
| `api/openapi.json` (generated) | Backend |
| `frontend/bindings/**` (generated by `wails3 generate bindings -ts`) | Backend |
| `frontend/**` except `frontend/bindings/**` | Frontend |
| `docs/**` | Coordinator (propose changes in your report) |

Interfaces between the two:

- Build: Taskfiles run `pnpm install` and `pnpm run build` (production) / `pnpm run build:dev` inside `frontend/`, output `frontend/dist`. The frontend must provide those scripts (via Vite+).
- API: `api/openapi.json` → frontend runs openapi-typescript into `frontend/src/api/schema.d.ts`.
- Host services: Go services listed in §7; frontend imports from `frontend/bindings/`.

## 7. Host services (Wails bindings)

Registered in every build. In the server build they return web-appropriate values or `ErrUnsupported`.

| Service | Methods |
| --- | --- |
| `PlatformService` | `Info() → { platform: "web"\|"desktop"\|"android", version }`; `ServerURL() → string` (`""` in server build = same origin); `SetServerURL(url)` (apps; persisted in the app config dir / `Mobile.StoragePath()`) |
| `FileService` | `SaveFile(suggestedName, mimeType, base64Data) → { saved: bool, path? }` — desktop: native save dialog; Android: share or save to Downloads (whatever Wails supports; document the result) |
| `ScanService` | `ScanQR() → string` — Android: take a photo via `Mobile.CapturePhoto` and decode the QR in Go; other targets: `ErrUnsupported` |
| `TrayService` | desktop only: `Update({ state, label, roomName })` sets tray icon (green/red) and tooltip; tray menu items 马上使用 / 打开日历 / 显示窗口 / 退出 emit events `tray:quick-use`, `tray:open-calendar` to the frontend. Closing the window hides it to the tray. |
| `AutostartService` | desktop only: `Enabled() → bool`, `SetEnabled(bool)` |
