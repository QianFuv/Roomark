# Roomark 规格说明

Roomark 是给小团队（几位老师和学生）用的会议室预约应用。每间会议室门口贴一张二维码，扫码即可查看房间是否空闲并预约。

本文是产品规则和前后端接口的约定。代码与本文不一致时，修改代码或先更新本文，不要让两者悄悄分叉。

- 界面语言：只有简体中文。
- 时区：固定 `Asia/Shanghai`，不支持跨零点的预约。
- 浏览器基线：Chromium ≥ 132、Safari / iOS ≥ 18.3。

## 1. 构建目标与架构

一个 Go 模块（`roomark`）加一个 React 前端，三个构建目标：

| 目标 | 构建 | 作用 |
| --- | --- | --- |
| 服务端（含网页） | `wails3 task build:server`（`-tags server`） | Wails server 模式。提供网页前端、`/api` 下的业务 HTTP API、`/ical` 下的日历订阅，并持有唯一的 SQLite 数据库 |
| PC（Windows） | `wails3 task build` / `package` | Wails 桌面窗口加系统托盘，通过 HTTP 调用服务端，不保存业务数据 |
| Android | `wails3 task android:package` | Wails Android 应用，通过 HTTP 调用服务端，不保存业务数据 |

- 所有业务逻辑都在 HTTP API（huma）之后。桌面端和 Android 与浏览器一样通过 HTTP 访问服务端。
- Wails 绑定只用于宿主能力：平台信息、服务器地址、保存或分享文件、扫码、托盘、开机自启，见第 7 节。
- 前端通过 `PlatformService.Info()` 判断平台，服务端构建中返回 `web`。
- 服务端的环境变量见 [deployment.md](deployment.md#环境变量)。
- 桌面端和 Android 的默认服务器地址可以在构建时注入（`-X main.defaultServerURL=...`），用户可在「设置」中修改。

## 2. 产品规则

### 2.1 会议室与房间码

- 会议室包含：`slug`（如 `9070`）、名称、位置、容纳人数、说明，以及预约规则（2.4）。
- 每间会议室有一个固定的随机**房间码**：6 个字符，取自 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（去掉 0/O/1/I/L），各房间互不相同，输入时不区分大小写；创建房间时生成，之后不再更换。门口二维码编码 `{PUBLIC_URL}/r/{slug}?k={房间码}`，海报上同时印出房间码，方便手动输入（如桌面端）。请求头 `X-Room-Token` 携带房间码。
- 所有房间范围的接口都需要与该房间匹配的 `X-Room-Token`，管理员除外。缺少或错误时房间不可见（`403 room_token_required` / `room_token_invalid`）。例外：`/api/bookings/{id}/*` 只需预约者本人的会话，这样在任何设备上都能管理自己的预约。
- 客户端按房间记住房间码（网页存在 `localStorage`，应用存在内置网页的存储中），保存后从地址栏去掉 `k` 参数。已保存的旧码被拒绝时，清掉该房间并显示房间码输入框。
- 手动绑定：`POST /api/room-codes/resolve {code}` → `{ slug, name }`。按客户端 IP 限流，失败也计入次数；其他接口上反复使用错误房间码同样按 IP 限流。

### 2.2 人员与个人口令

- 没有账号。一个人 = 姓名 + 身份（`teacher` | `student` | `other`）+ 可选的管理员标记 + 个人口令。
- 管理员维护预设名单；不在名单上的人可以自己添加名字（身份为 `other`）。
- **所有人都使用 6 位数字口令。**
- 第一次使用预设名字时由本人设置口令（认领），之后任何人用这个名字都要输入口令。
- 任何设备都能登录：选名字（管理员登录页可输入名字）+ 口令 → 长期会话（365 天，使用时顺延）。
- 连续输错 5 次口令，此人锁定 15 分钟；登录请求另按客户端 IP 限流。
- 忘记口令：管理员重置，本人下次使用时重新设置。
- 查看房间状态、日历和热力图只需房间码；预约和管理预约需要登录。
- 普通人只能修改自己的预约，管理员可以修改全部。
- 管理员是 `isAdmin = true` 的人，登录方式相同，界面会出现「管理后台」入口。
- 删除人员是软删除，历史数据仍计入统计。

### 2.3 预约

- 状态只有 `confirmed` 和 `cancelled`。没有审批、签到和爽约记录。
- `kind`：`normal`，或 `block`（管理员设置的「不可预约」时段，如消杀、考试；除冲突检查外不受其他规则限制）。
- 每条预约都有必填的 `title`（用途，去掉首尾空白后 1–200 字，不可预约时段也一样）。能看到房间的人都能看到预约人和用途。「马上使用」同样要填用途。
- 时间按 15 分钟对齐。例外：「马上使用」从当前分钟开始。
- 时段空闲就立即预约成功；冲突时返回 `409` 和推荐时段（2.5）。
- 修改：可改时间和用途，重新校验时排除自身。
- 取消：未开始的预约可以取消；进行中的预约不能取消，只能提前结束。
- 提前结束：只在进行中可用，把 `end` 设为当前分钟，并记录 `releasedMinutes`。
- 续时：15 / 30 / 60 分钟，要求续上的时段空闲、在开放时间内且不超过单次最长时长。
- 「进行中」「已结束」由时间推算，没有后台任务。

### 2.4 预约规则（每间房单独设置，管理员可改）

| 规则 | 默认值 |
| --- | --- |
| 开放时间（`HH:MM`，关门最晚 `23:59`） | 08:00–22:00 |
| 单次最长时长 | 240 分钟 |
| 单次预约最多提前 | 14 天 |
| 每人同时有效的预约数（一组重复预约算 1 个） | 0 表示不限 |
| 重复预约最长跨度 | 20 周 |

违反规则返回 `422`，附机器可读的代码（`outside_open_hours`、`too_long`、`too_far_ahead`、`in_past`、`misaligned`、`too_many_active`、`series_too_long`、`invalid_range`）和中文说明。说明中带上具体限制，例如「开放时间是 08:00–22:00」「最多提前 14 天预约」。

### 2.5 冲突推荐

请求的 `[start, end)` 时长为 D 且发生冲突时：

1. 当天：长度为 D、按 15 分钟对齐、在开放时间内、不在过去的空档，按与原开始时间的距离排序，最多 2 个（两边都有时各取一个更早和更晚的）。
2. 之后几天：同一时间段在之后几天空闲且符合规则（提前天数限制）的，最多 3 个。

每条推荐为 `{start, end, kind: "same_day" | "other_day"}`。每个 409 还返回冲突的预约（`name`、`title`、`start`、`end`）和 `conflictEventId`。

- 点推荐只会把表单时间改成推荐时段，不会直接预约，用户仍需点「预约」确认。
- 客户端预约推荐时段时带上 `conflictEventId`，用于统计推荐采纳率。
- 只在实时检查 `/check` 中出现的冲突不记录。用户采用了 `/check` 给出的推荐时，客户端发送 `suggestedFrom: {start, end}`（最初请求的时段）；如果最终预约的时段确实是它的有效推荐，服务端为该时段记录一条已采纳的冲突事件。

### 2.6 重复预约

- 规则：`freq` = `weekly` | `biweekly`；`weekdays` ⊆ 1..7（ISO，周一为 1）；`startDate`；`untilDate` 与 `count` 二选一；`startTime`、`endTime`（HH:MM）。
- 界面默认：每周、所选日期的星期、8 次。
- 创建前预览每一次：状态为 `ok` | `conflict` | `violation`，冲突的那几次附冲突详情和推荐时段。
- 创建时提交规则和逐次调整：`skip`，或 `move` 到 `{start, end}`（通常是推荐时段）。冲突的那几次默认跳过。服务端会全部重新校验；如果预览之后情况有变，返回 `409` 和新的预览。
- 修改或取消其中一次时带 `scope`：`this` | `following`。
- 重复预约受「重复预约最长跨度」限制，不受 14 天提前预约限制。

### 2.7 公告

由管理员维护。字段：房间（或全部房间）、标题、正文（纯文本）、`startsAt`、`endsAt`、`pinned`。生效中的公告显示在会议室页面顶部。

### 2.8 统计

完整统计只对管理员开放；持有房间码的人都能看到公开的「会议热力图」（本周各天各小时的预约占比，见 4.2）。

筛选条件：房间（或全部）、日期范围（本周 / 本月 / 本学期 / 自定义）、身份（全部 / 老师 / 学生 / 其他）。

- **概览**（与上一周期对比）：预约数、实际使用时长（扣除取消和提前结束的时间）、利用率（已用时长 ÷ 范围内已经过去的开放时长）、使用人数。
- **趋势**：按天或按周的利用率（按范围长度自动选择），叠加上一周期。
- **热力图**：星期 × 小时（08–22）的占用率。
- **习惯**：时长分布（≤30 分、≤1 时、≤2 时、≤3 时、≤4 时、>4 时）；提前量分布（当天、1–3 天、4–7 天、>7 天）；单次与重复预约的占比。
- **需求缺口**：冲突次数、冲突最多的时段（星期 + 小时）、推荐采纳率。
- **取消情况**：取消率、临时取消率（开始前 1 小时内取消）、提前结束次数和平均提前时长。
- **人员排行**：按使用时长和预约次数。
- 按筛选条件导出预约明细 CSV。

### 2.9 日历订阅（iCal）

- 房间订阅：`GET /ical/{slug}.ics?k={房间码}`。
- 个人订阅：`GET /ical/person/{feedToken}.ics`（`feedToken` 每人随机生成，在「我的预约」中显示）。

## 3. 数据模型（SQLite）

时间以 Unix 秒（UTC）存储。

- `rooms(id, slug UNIQUE, name, location, capacity, description, access_token（房间码）, open_time, close_time, max_duration_min, max_advance_days, max_active_per_person, recurring_max_weeks, archived_at, created_at)`
- `people(id, name（未删除者中不区分大小写唯一）, role, is_admin, passcode_hash, failed_attempts, locked_until, feed_token, source ('preset'|'self'), deleted_at, created_at)`
- `sessions(id, token_hash UNIQUE, person_id, created_at, last_used_at, expires_at)`
- `series(id, room_id, person_id（不可预约时段为 NULL）, kind, title, rule_json, created_at)`
- `bookings(id, room_id, person_id（不可预约时段为 NULL）, series_id NULL, kind, title, start_at, end_at, planned_end_at, status, created_at, updated_at, cancelled_at, cancelled_by)`
- `announcements(id, room_id NULL, title, body, starts_at, ends_at, pinned, created_at)`
- `conflict_events(id, room_id, person_id, requested_start, requested_end, source ('single'|'series'), accepted_booking_id NULL, created_at)`

口令用 bcrypt 哈希，会话令牌只存哈希。所有预约写入都在同一个事务里先查冲突再插入（单一写连接），两个客户端不可能约到同一时段。迁移由 goose 管理，启动时自动执行。

## 4. HTTP API

- 前缀 `/api`，JSON。时间为带 `+08:00` 的 RFC 3339，日期为 `YYYY-MM-DD`，时刻为 `HH:MM`。
- 鉴权头：`X-Room-Token`（房间范围）、`Authorization: Bearer <session>`（个人范围）。
- 错误使用 huma 的 RFC 9457 problem JSON，额外带 `code` 字段（snake_case）和中文 `detail`，前端直接显示 `detail`。
- OpenAPI 3.1 导出到 `apps/roomark/api/openapi.json`（`wails3 task openapi`），前端用 openapi-typescript 生成 `apps/roomark/frontend/src/api/schema.d.ts`。

### 4.1 数据结构

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

### 4.2 接口

无需鉴权（限流）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/room-codes/resolve` | `{code}` → `{ slug, name }` |

房间范围（`X-Room-Token` 或管理员）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/rooms/{slug}` | `{ room, status, announcements }` |
| GET | `/api/rooms/{slug}/bookings?from&to` | 日期范围内已确认的预约（最多 62 天） |
| GET | `/api/rooms/{slug}/heatmap?week=YYYY-MM-DD` | 公开的会议热力图，取 `week` 所在的周一至周日（默认本周）：`{ weekStart, days: date[7], hours: int[]（开门小时到关门前最后一个小时）, cells: number[7][hours] }`，每格是当天该小时被预约的比例（0–1），包含不可预约时段 |
| POST | `/api/rooms/{slug}/check` | `{start,end,excludeBookingId?}` → `{ ok, violations, conflict? }`。不写入，用于表单实时反馈；`excludeBookingId` 用于修改时排除正在编辑的预约 |
| GET | `/api/people` | 预设和自行添加的人员 `{ id, name, role, hasPasscode }`（需要 `X-Room-Token` 和 `?room={slug}`） |

个人范围（需要会话；房间接口同时需要房间码）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/rooms/{slug}/bookings` | `{start,end,title,conflictEventId?,suggestedFrom?: {start,end}, onBehalfOf?（管理员）, kind?（管理员：block）}` → 201 Booking / 409 Conflict / 422 |
| POST | `/api/rooms/{slug}/quick` | `{minutes: 30\|60\|90\|120, title}`，截止到下一场预约或关门时间，返回 Booking |
| POST | `/api/rooms/{slug}/series/preview` | `{rule}` → `{ occurrences: Occurrence[] }` |
| POST | `/api/rooms/{slug}/series` | `{rule,title?,overrides,onBehalfOf?,kind?}` → `{ seriesId, created: Booking[], skipped: date[] }` / 409 `{ occurrences }` |
| PATCH | `/api/bookings/{id}` | `{start?,end?,title?,scope?}` |
| POST | `/api/bookings/{id}/cancel` | `{scope?: "this"\|"following"}` |
| POST | `/api/bookings/{id}/extend` | `{minutes: 15\|30\|60}` |
| POST | `/api/bookings/{id}/end` | 提前结束 |
| GET | `/api/me` | Person |
| GET | `/api/me/bookings?past=false` | `{ singles: Booking[], series: [{ id, roomSlug, title, ruleSummary, firstDate, lastDate, remaining, occurrences: Booking[] }] }` |
| GET | `/api/me/feeds` | `{ personFeedUrl }` |
| PUT | `/api/me/passcode` | `{current, next}` |
| DELETE | `/api/sessions/current` | 退出登录 |

创建会话（无需会话，限流）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/sessions` | `{personId?, name?, passcode}` → Session；未设置口令时 `409 passcode_not_set`；锁定时 `423 locked` 并返回 `lockedUntil` |
| POST | `/api/people/{id}/claim` | `{passcode}` → Session，仅限尚未设置口令的人，需要 `X-Room-Token` |
| POST | `/api/people` | `{name, passcode}` → Session（身份为 `other`）；重名时 `409 name_taken`；需要 `X-Room-Token` |

管理员（`isAdmin`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/admin/rooms` | 列表（含房间码）/ 新建 |
| PATCH | `/api/admin/rooms/{id}` | 修改信息和规则、归档 |
| GET | `/api/admin/rooms/{id}/qr` | `{ url, code }`，海报由前端绘制 |
| GET/POST | `/api/admin/people` | 列表 / 新建预设人员 |
| POST | `/api/admin/people/import` | `{ people: [{name, role, isAdmin?}] }` |
| PATCH/DELETE | `/api/admin/people/{id}` | 修改（姓名、身份、管理员）/ 软删除 |
| POST | `/api/admin/people/{id}/reset-passcode` | 重置口令 |
| GET | `/api/admin/bookings?room&from&to&personId&status` | 预约列表 |
| GET/POST/PATCH/DELETE | `/api/admin/announcements[/{id}]` | 公告 |
| GET | `/api/admin/stats?room&from&to&role` | 2.8 的全部统计，一次返回 |
| GET | `/api/admin/stats/export.csv?...` | CSV 导出 |

非 API：`GET /ical/{slug}.ics?k=`、`GET /ical/person/{feedToken}.ics`。其他路径都返回前端的 `index.html`。

## 5. 前端页面与流程

三档布局分别设计，不是简单拉伸：

| 档位 | 视口 | 使用场景 |
| --- | --- | --- |
| 手机 | < 768 px | 手机浏览器和 Android 应用 |
| 窄屏 | 768–1279 px | 较小窗口的 PC 应用和网页 |
| 宽屏 | ≥ 1280 px | 最大化的 PC 应用和网页 |

- 支持浅色和深色主题，颜色使用 T3 Soft 配色（`docs/design/t3-soft.json`，深色为 `colors`，浅色为 `variants.light`）。字体、字号、间距、图标和弹窗规则见 [视觉规范](design/visual-system.md)。
- 页面铺满窗口，不留大块空白。手机上除日历翻页外，任何内容都不需要左右滑动，宽表格改为卡片。
- 日期和时间选择器免滚动、紧凑。
- 文案简短自然；必要的解释放在标题右侧的 `?` 提示里，不写副标题。

| 路由 | 内容 |
| --- | --- |
| `/` | 没有已绑定的房间：6 格房间码输入框（可粘贴房间码或完整二维码链接），Android 另有「扫码绑定」。一个房间：直接跳转。多个房间：房间卡片和实时状态 |
| `/r/$slug` | 会议室概况：状态（「空闲到 22:00」/「王五正在使用」及结束时间）、「预约」按钮、「马上使用」（30/60/90/120 分钟，超出空闲时长的选项禁用）、下一场（不是今天时显示日期：明天、后天或「11月14日 周五」）、今天的时间线、公告、本周会议热力图（可切换上周、下周）。自己进行中的预约可以续时或提前结束。标签页顺序：概况 · 预约 · 日历 |
| `/r/$slug/book` | 预约表单：日期、时间（15 分钟步长）、用途、重复开关。通过 `/check` 实时检查，冲突时显示推荐时段（点一下只改表单时间）。重复预约显示逐次预览 |
| `/r/$slug/calendar` | 手机为三日视图（左右滑动），≥ 768 px 为周视图；翻页有滑动动画并保持纵向滚动位置。点空白处打开预约表单并预填时间，点预约块查看详情 |
| `/me` | 我的预约：即将开始 / 已结束；重复预约合并成一张卡片（如「组会 · 每周三 14:00–16:00 · 11/19–1/7 · 还剩 6 次」），可展开；个人 iCal 订阅链接 |
| `/admin/*` | 房间（信息、规则、房间码、导出二维码）、名单（增删改、导入、重置口令、管理员）、预约（筛选表格、修改或取消、代人预约、不可预约时段，含重复）、公告、统计 |
| `/settings` | 仅应用：服务器地址；PC 另有开机自启 |

账户菜单在右上角（宽屏在侧栏底部）：身份、我的预约、修改口令、切换身份、管理后台（仅管理员）、主题、退出。退出后回到上次的会议室概况（没有则回首页）并提示「已退出」，不会弹出登录。

登录流程（弹窗，在没有会话时由任何写操作触发）：搜索名单 → 未认领的名字设置 6 位口令（输入两次）→ 完成；「我不在名单里」→ 输入名字 → 设置口令；已认领的名字输入口令；锁定时显示解锁时间。管理员登录页输入姓名和口令。

重复预约预览示意：

```
共 8 次 · 7 次可约 · 1 次有冲突
11月19日 周三 14:00–16:00   ✓
11月26日 周三 14:00–16:00   ✗ 14:00–15:00 已被李四约了
          [当天 15:00–17:00] [11月27日 周四 14:00–16:00] [跳过这次]
…                                        [预约 7 次]
```

冲突的那几次默认跳过；点推荐时段即改到该时段，提交按钮上的次数随之更新。修改或取消其中一次时询问「仅这一次 / 这次及以后」。删除类操作先确认。

二维码导出（管理后台 → 房间 → 导出二维码）：实时预览；版式有 A4 海报（房间名大字、二维码、房间码、「扫码查看空闲 · 预约」、小号链接）、A5 海报、仅二维码（方形）；格式为 PNG（300 dpi）和 PDF。房间码用等宽大字印在二维码下方（「房间码 K7M2XQ」）。网页直接下载，PC 弹出系统保存对话框，Android 通过分享或保存。

刷新：房间状态和日历每 30 秒以及窗口重新获得焦点时重新获取（TanStack Query），不使用 WebSocket。

返回：界面上没有返回按钮，依靠 Android 返回手势、浏览器后退、鼠标侧键和 Alt+←；返回先关闭弹窗。

## 6. 宿主服务（Wails 绑定）

所有构建中都注册。服务端构建中返回适合网页的值或 `ErrUnsupported`。

| 服务 | 方法 |
| --- | --- |
| `PlatformService` | `Info() → { platform: "web"\|"desktop"\|"android", version }`；`ServerURL() → string`（服务端构建为 `""`，即同源）；`SetServerURL(url)`（应用专用；PC 保存在程序同目录的 `data/server.json`，Android 保存在 `Mobile.StoragePath()`） |
| `FileService` | `SaveFile(suggestedName, mimeType, base64Data) → { saved: bool, path? }`。PC 弹出系统保存对话框，Android 分享或保存 |
| `ScanService` | `ScanQR() → string`。Android 通过 `Mobile.CapturePhoto` 拍照并在 Go 中识别二维码；其他平台返回 `ErrUnsupported` |
| `TrayService` | 仅 PC：`Update({ state, label, roomName })` 设置托盘图标（绿 / 红）和提示文字；托盘菜单「马上使用」「打开日历」「显示窗口」「退出」，前两项向前端发送 `tray:quick-use`、`tray:open-calendar` 事件。关闭窗口时隐藏到托盘 |
| `AutostartService` | 仅 PC：`Enabled() → bool`、`SetEnabled(bool)` |

PC 端的网页存储（WebView2 用户数据）放在程序同目录的 `data/webview/`，程序不向系统目录写入数据。
