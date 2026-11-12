/**
 * Room home: live status, quick use, next booking, today's agenda, announcements and the weekly
 * "会议热力图".
 *
 * @module
 */
import type { Temporal } from "@js-temporal/polyfill";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Pin,
  Repeat,
  Square,
  Timer,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Announcement, Booking, Room, RoomStatus } from "../../api/client";
import { dayAgenda, isFinished, isOngoing, quickUseOptions, type QuickUseOption } from "../../lib/schedule";
import { heatRows, heatSummary } from "../../lib/stats";
import {
  ceilToGrid,
  clockToMinutes,
  dateRange,
  formatClock,
  formatClockWithDay,
  formatDateLabel,
  formatDateSpan,
  formatDayPrefix,
  formatDuration,
  formatShortDuration,
  minutesBetween,
  minutesOfDay,
  minutesToClock,
  parseDate,
  parseZoned,
  startOfWeek,
  weekdayLabel,
} from "../../lib/time";
import { platform } from "../../platform/platform";
import { appStore } from "../../state/app-store";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Disclosure } from "../../ui/controls";
import { Card, EmptyState, Notice, Section, Skeleton, Stack } from "../../ui/layout";
import { Segmented } from "../../ui/segmented";
import { Sheet } from "../../ui/sheet";
import { useLayoutTier } from "../../ui/tier";
import { endBooking, extendBooking, quickUse } from "../booking/booking-actions";
import { BookingDetailSheet, bookingHeading } from "../booking/booking-detail";
import { PurposeField, TITLE_REQUIRED_MESSAGE } from "../booking/purpose-field";
import { requestSession } from "../identity/identity";
import { HeatmapGrid, type HeatmapRow } from "./heatmap";
import { RoomCalendar } from "./room-calendar";
import { useNow, useRoomBookings, useRoomDetail, useRoomHeatmap } from "./room-data";

const styles = stylex.create({
  layout: {
    alignItems: "start",
    display: "grid",
    gap: { default: 16, [media.wide]: 24 },
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [media.narrow]: "minmax(0, 1fr) minmax(0, 1fr)",
      [media.wide]: "minmax(320px, 360px) minmax(0, 1fr)",
    },
  },
  calendarColumn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.extraLarge,
    borderStyle: "solid",
    borderWidth: 1,
    minWidth: 0,
    padding: 16,
  },
  column: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 },
  hero: {
    borderRadius: radii.extraLarge,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 148,
    paddingBlock: 22,
    paddingInline: 22,
  },
  heroFree: { backgroundColor: colors.freeSoft },
  heroBusy: { backgroundColor: colors.busySoft },
  heroClosed: { backgroundColor: colors.surfaceMuted },
  stateLine: { alignItems: "center", display: "flex", gap: 10 },
  dot: { borderRadius: radii.pill, flexShrink: 0, height: 14, width: 14 },
  dotFree: {
    backgroundColor: colors.free,
    boxShadow: `0 0 0 5px color-mix(in srgb, ${colors.free} 22%, transparent)`,
  },
  dotBusy: {
    backgroundColor: colors.busy,
    boxShadow: `0 0 0 5px color-mix(in srgb, ${colors.busy} 22%, transparent)`,
  },
  dotClosed: { backgroundColor: colors.textSubtle },
  stateWord: { fontSize: fonts.sizeHero, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 },
  stateFree: { color: colors.freeStrong },
  stateBusy: { color: colors.busyStrong },
  stateClosed: { color: colors.textMuted },
  heroMain: {
    color: colors.text,
    fontSize: fonts.sizeXl,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1.35,
  },
  heroSub: {
    color: colors.text,
    opacity: 0.8,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.5,
  },
  quickArea: { containerType: "inline-size" },
  quickGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@container (min-width: 480px)": "repeat(4, minmax(0, 1fr))",
    },
  },
  quickButton: { flexDirection: "column", gap: 2, minHeight: 72, minWidth: 0, paddingInline: 8 },
  quickLabel: { maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" },
  quickHint: {
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  extendRow: { display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  sectionLabel: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontSize: fonts.sizeLg,
    fontWeight: 700,
    gap: 8,
  },
  agenda: { display: "flex", flexDirection: "column", gap: 6 },
  agendaRow: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontFamily: fonts.sans,
    gap: 12,
    minHeight: 56,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 8,
    paddingInline: 12,
    textAlign: "start",
    textDecoration: "none",
    width: "100%",
  },
  agendaFree: {
    backgroundColor: { default: "transparent", ":hover": colors.freeSoft },
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  agendaNow: { borderColor: colors.busy, borderWidth: 2 },
  agendaPast: { opacity: 0.55 },
  agendaTime: {
    color: colors.textMuted,
    flexShrink: 0,
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    width: 92,
  },
  agendaTimeDated: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 92,
    whiteSpace: "nowrap",
    width: "auto",
  },
  agendaDay: { color: colors.primaryText, fontWeight: 700 },
  agendaBody: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 2, minWidth: 0 },
  agendaTitle: {
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  agendaMeta: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontSize: fonts.sizeSm,
    gap: 4,
  },
  freeText: { color: colors.free, fontSize: fonts.sizeMd, fontWeight: 600 },
  freeAction: { color: colors.primaryText, flexShrink: 0, fontSize: fonts.sizeSm, fontWeight: 600 },
  announcement: {
    backgroundColor: colors.warningSoft,
    borderRadius: radii.medium,
    color: colors.text,
    display: "flex",
    gap: 10,
    paddingBlock: 12,
    paddingInline: 14,
  },
  announcementIcon: { color: colors.warning, flexShrink: 0, marginTop: 2 },
  announcementTitle: { fontSize: fonts.sizeMd, fontWeight: 700 },
  announcementBody: {
    color: colors.textMuted,
    fontSize: fonts.sizeSm,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  freeSummary: { color: colors.text, fontSize: fonts.sizeMd, lineHeight: 1.6 },
  heatmapBody: { display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 },
  heatmapData: { display: "flex", flexDirection: "column", gap: 12, transition: "opacity 160ms ease" },
  heatmapLoading: { opacity: 0.55 },
  weekBar: { alignItems: "center", display: "flex", gap: 6 },
  weekLabel: {
    color: colors.text,
    flexGrow: 1,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    minWidth: 0,
  },
});

/**
 * Room home page.
 *
 * @param props - Page props.
 * @param props.slug - Room slug.
 * @param props.isQuickRequested - Opened from the tray's 马上使用 item.
 * @returns The page.
 */
export function RoomHome({ slug, isQuickRequested }: { slug: string; isQuickRequested: boolean }) {
  const now = useNow();
  const detail = useRoomDetail(slug);
  const today = now.toPlainDate().toString();
  const tier = useLayoutTier();
  const bookings = useRoomBookings(slug, today, today, tier !== "wide");
  const [selected, setSelected] = useState<Booking>();
  const [calendarDate, setCalendarDate] = useState<string>();
  const [calendarFocus, setCalendarFocus] = useState<string>();
  const quickRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isQuickRequested || detail.data === undefined) return;

    quickRef.current?.scrollIntoView({ block: "center" });
    quickRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    void navigate({ to: "/r/$slug", params: { slug }, search: {}, replace: true });
  }, [detail.data, isQuickRequested, navigate, slug]);

  useTraySync(detail.data?.room, detail.data?.status, slug);

  if (detail.data === undefined) {
    return detail.isError ? (
      <EmptyState title="暂时无法加载会议室">
        <Button onClick={() => void detail.refetch()}>重试</Button>
      </EmptyState>
    ) : (
      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.column)}>
          <Skeleton height={148} />
          <Skeleton height={160} />
        </div>
        <div {...stylex.props(styles.column)}>
          <Skeleton height={280} />
        </div>
      </div>
    );
  }

  const { room, status, announcements } = detail.data;

  /**
   * Show a heatmap day or hour in the calendar: beside the page on wide windows, otherwise on the
   * calendar tab.
   *
   * @param date - The date.
   * @param clock - Optional `HH:MM` to scroll to.
   */
  function openInCalendar(date: string, clock?: string): void {
    if (tier === "wide") {
      setCalendarDate(date);
      setCalendarFocus(clock);

      return;
    }

    void navigate({ to: "/r/$slug/calendar", params: { slug }, search: { date, time: clock } });
  }

  const current = status.current;
  const isMineNow = current !== undefined && current.isMine && current.canEdit;

  return (
    <>
      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.column)}>
          <Announcements items={announcements ?? []} />
          <StatusHero room={room} status={status} now={now} />
          {isMineNow ? (
            <OngoingControls booking={current} />
          ) : (
            <div ref={quickRef}>
              <QuickUse room={room} status={status} now={now} />
            </div>
          )}
          {status.next === undefined ? null : (
            <Section title="下一场">
              <AgendaBookingRow booking={status.next} now={now} isDayNamed onSelect={setSelected} />
            </Section>
          )}
          {tier === "wide" ? <MeetingHeatmap slug={slug} now={now} onOpen={openInCalendar} /> : null}
        </div>
        {tier === "wide" ? (
          <section aria-label="日程" {...stylex.props(styles.calendarColumn)}>
            <RoomCalendar
              slug={slug}
              anchorDate={calendarDate}
              focusClock={calendarFocus}
              onAnchorChange={(date) => {
                setCalendarDate(date);
                setCalendarFocus(undefined);
              }}
            />
          </section>
        ) : (
          <div {...stylex.props(styles.column)}>
            <Section title="今天" aside={weekdayLabel(now.dayOfWeek)}>
              {bookings.data === undefined ? (
                <Stack gap="sm">
                  <Skeleton height={56} />
                  <Skeleton height={56} />
                  <Skeleton height={56} />
                </Stack>
              ) : (
                <TodayAgenda room={room} bookings={bookings.data ?? []} now={now} onSelect={setSelected} />
              )}
            </Section>
            <MeetingHeatmap slug={slug} now={now} onOpen={openInCalendar} />
          </div>
        )}
      </div>
      <BookingDetailSheet booking={selected} onClose={() => setSelected(undefined)} />
    </>
  );
}

/**
 * Push the live status to the desktop tray when this is the last viewed room.
 *
 * @param room - The room.
 * @param status - Live status.
 * @param slug - Room slug.
 */
function useTraySync(room: Room | undefined, status: RoomStatus | undefined, slug: string): void {
  const label = room === undefined || status === undefined ? undefined : statusSummary(room, status);

  useEffect(() => {
    const host = platform();

    if (!host.hasTray || room === undefined || status === undefined || label === undefined) return;

    if (appStore.state.lastRoomSlug !== slug) return;

    void host.updateTray({ state: status.state, label, roomName: room.name }).catch(() => undefined);
  }, [label, room, slug, status]);
}

/**
 * One-line status for the tray tooltip.
 *
 * @param room - The room.
 * @param status - Live status.
 * @returns E.g. `空闲至 16:00` or `使用中：张三 到 15:30`.
 */
export function statusSummary(room: Room, status: RoomStatus): string {
  if (status.state === "busy") {
    const who = status.current?.person?.name ?? (status.current?.kind === "block" ? "不可预约" : "有人");
    const until = status.busyUntil ?? status.current?.end;

    return until === undefined ? `使用中：${who}` : `使用中：${who} 到 ${formatClockWithDay(until)}`;
  }

  if (status.freeUntil !== undefined) return `空闲至 ${formatClockWithDay(status.freeUntil)}`;

  return `空闲至 ${room.rules.closeTime}`;
}

/**
 * Announcement banners, pinned first.
 *
 * @param props - Banner props.
 * @param props.items - Active announcements.
 * @returns The banners.
 */
function Announcements({ items }: { items: readonly Announcement[] }) {
  if (items.length === 0) return null;

  const sorted = [...items].sort((left, right) => Number(right.pinned) - Number(left.pinned));

  return (
    <Stack gap="sm">
      {sorted.map((item) => (
        <aside key={item.id} aria-label={`公告：${item.title}`} {...stylex.props(styles.announcement)}>
          <span {...stylex.props(styles.announcementIcon)}>
            {item.pinned ? <Pin size={18} aria-hidden /> : <Megaphone size={18} aria-hidden />}
          </span>
          <div>
            <p {...stylex.props(styles.announcementTitle)}>{item.title}</p>
            {item.body === "" ? null : <p {...stylex.props(styles.announcementBody)}>{item.body}</p>}
          </div>
        </aside>
      ))}
    </Stack>
  );
}

/**
 * Big status card.
 *
 * @param props - Hero props.
 * @param props.room - The room.
 * @param props.status - Live status.
 * @param props.now - Current time.
 * @returns The card.
 */
function StatusHero({ room, status, now }: { room: Room; status: RoomStatus; now: Temporal.ZonedDateTime }) {
  const nowMinutes = minutesOfDay(now);

  const isClosed =
    status.state === "free" &&
    (nowMinutes < clockToMinutes(room.rules.openTime) || nowMinutes >= clockToMinutes(room.rules.closeTime));

  if (status.state === "busy") {
    const current = status.current;
    const until = status.busyUntil ?? current?.end;

    const who =
      current?.kind === "block"
        ? bookingHeading(current)
        : `${current?.person?.name ?? "有人"}${current?.isMine === true ? "（我）" : ""}`;

    const purpose = current?.kind === "block" || current?.title === "" ? undefined : current?.title;

    return (
      <section aria-live="polite" aria-label="当前状态" {...stylex.props(styles.hero, styles.heroBusy)}>
        <div {...stylex.props(styles.stateLine)}>
          <span aria-hidden {...stylex.props(styles.dot, styles.dotBusy)} />
          <span {...stylex.props(styles.stateWord, styles.stateBusy)}>使用中</span>
        </div>
        <p {...stylex.props(styles.heroMain)}>
          {who}
          {until === undefined ? "" : ` 到 ${formatClockWithDay(until, now.toPlainDate())}`}
        </p>
        <p {...stylex.props(styles.heroSub)}>
          {purpose === undefined ? "" : `${purpose} · `}
          {until === undefined ? "" : `还有 ${formatDuration(Math.max(0, minutesBetween(now, until)))}结束`}
        </p>
      </section>
    );
  }

  if (isClosed) {
    return (
      <section aria-live="polite" aria-label="当前状态" {...stylex.props(styles.hero, styles.heroClosed)}>
        <div {...stylex.props(styles.stateLine)}>
          <span aria-hidden {...stylex.props(styles.dot, styles.dotClosed)} />
          <span {...stylex.props(styles.stateWord, styles.stateClosed)}>未开放</span>
        </div>
        <p {...stylex.props(styles.heroMain)}>
          开放时间 {room.rules.openTime}–{room.rules.closeTime}
        </p>
        <p {...stylex.props(styles.heroSub)}>可以提前预约之后的时段</p>
      </section>
    );
  }

  const freeUntil = status.freeUntil;
  const freeMinutes = freeUntil === undefined ? undefined : minutesBetween(now, freeUntil);

  return (
    <section aria-live="polite" aria-label="当前状态" {...stylex.props(styles.hero, styles.heroFree)}>
      <div {...stylex.props(styles.stateLine)}>
        <span aria-hidden {...stylex.props(styles.dot, styles.dotFree)} />
        <span {...stylex.props(styles.stateWord, styles.stateFree)}>空闲</span>
      </div>
      <p {...stylex.props(styles.heroMain)}>
        {freeUntil === undefined
          ? `今天剩余时间都空闲（至 ${room.rules.closeTime}）`
          : `空闲至 ${formatClockWithDay(freeUntil, now.toPlainDate())}`}
      </p>
      <p {...stylex.props(styles.heroSub)}>
        {freeMinutes === undefined
          ? "现在就可以使用"
          : `还有 ${formatDuration(Math.max(0, freeMinutes))}${status.next?.person === undefined ? "" : `，之后是 ${status.next.person.name}`}`}
      </p>
    </section>
  );
}

/**
 * Quick-use buttons for a free room, or a booking entry for a busy one. A duration button
 * identifies the user first, then asks for 用途 in a small sheet.
 *
 * @param props - Component props.
 * @param props.room - The room.
 * @param props.status - Live status.
 * @param props.now - Current time.
 * @returns The actions.
 */
function QuickUse({ room, status, now }: { room: Room; status: RoomStatus; now: Temporal.ZonedDateTime }) {
  const [minutes, setMinutes] = useState<QuickUseOption["minutes"]>();
  const [pending, setPending] = useState<number>();
  const nowMinutes = minutesOfDay(now);

  const isOpenNow =
    nowMinutes >= clockToMinutes(room.rules.openTime) && nowMinutes < clockToMinutes(room.rules.closeTime);

  const canQuickUse = status.state === "free" && isOpenNow;
  const options = quickUseOptions(now, status.freeUntil, room.rules.closeTime);

  return (
    <Card as="section" ariaLabel="使用会议室">
      {canQuickUse ? (
        <>
          <h2 {...stylex.props(styles.sectionLabel)}>
            <Zap size={20} aria-hidden />
            马上使用
          </h2>
          <div {...stylex.props(styles.quickArea)}>
            <div {...stylex.props(styles.quickGrid)}>
              {options.map((option) => (
                <Button
                  key={option.minutes}
                  variant="success"
                  size="lg"
                  xstyle={styles.quickButton}
                  disabled={!option.isEnabled || (pending !== undefined && pending !== option.minutes)}
                  isLoading={pending === option.minutes}
                  aria-label={`马上使用 ${formatDuration(option.minutes)}，到 ${option.endClock}`}
                  onClick={() => {
                    setPending(option.minutes);
                    void requestSession(room.slug)
                      .then((session) => {
                        if (session !== undefined) setMinutes(option.minutes);
                      })
                      .finally(() => setPending(undefined));
                  }}
                >
                  <span {...stylex.props(styles.quickLabel)}>{formatShortDuration(option.minutes)}</span>
                  <span {...stylex.props(styles.quickHint)}>至 {option.endClock}</span>
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <Button
        render={<Link to="/r/$slug/book" params={{ slug: room.slug }} />}
        nativeButton={false}
        variant={canQuickUse ? "secondary" : "primary"}
        size="lg"
        isFullWidth
        icon={<CalendarPlus size={18} aria-hidden />}
      >
        {canQuickUse ? "预约其他时间" : "预约"}
      </Button>
      <Sheet
        isOpen={minutes !== undefined}
        onOpenChange={(open) => {
          if (!open) setMinutes(undefined);
        }}
        title="马上使用"
        description="填写用途后即可开始，用完可以提前结束。"
      >
        {minutes === undefined ? null : (
          <QuickUseForm
            slug={room.slug}
            options={options}
            initialMinutes={minutes}
            onDone={() => setMinutes(undefined)}
          />
        )}
      </Sheet>
    </Card>
  );
}

/**
 * Duration and 用途 for quick use; starts in one tap.
 *
 * @param props - Form props.
 * @param props.slug - Room slug.
 * @param props.options - Duration options.
 * @param props.initialMinutes - Duration tapped on the room page.
 * @param props.onDone - Close the sheet after starting.
 * @returns The form.
 */
function QuickUseForm({
  slug,
  options,
  initialMinutes,
  onDone,
}: {
  slug: string;
  options: readonly QuickUseOption[];
  initialMinutes: QuickUseOption["minutes"];
  onDone: () => void;
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [title, setTitle] = useState("");
  const [hasTried, setHasTried] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const chosen = options.find((option) => option.minutes === minutes);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setHasTried(true);

        if (title.trim() === "") return;

        setIsSubmitting(true);
        void quickUse(slug, minutes, title).then((booking) => {
          setIsSubmitting(false);

          if (booking !== undefined) onDone();
        });
      }}
    >
      <Stack gap="lg">
        <Segmented
          label="使用时长"
          value={String(minutes)}
          isFullWidth
          size="lg"
          options={options.map((option) => ({
            value: String(option.minutes),
            label: formatShortDuration(option.minutes),
            hint: `至 ${option.endClock}`,
            isDisabled: !option.isEnabled,
          }))}
          onValueChange={(value) => {
            const next = options.find((option) => String(option.minutes) === value);

            if (next !== undefined) setMinutes(next.minutes);
          }}
        />
        <PurposeField
          value={title}
          onValueChange={setTitle}
          error={hasTried && title.trim() === "" ? TITLE_REQUIRED_MESSAGE : undefined}
          isAutoFocus
        />
        <Button
          type="submit"
          variant="primary"
          size="xl"
          isFullWidth
          isLoading={isSubmitting}
          icon={<Zap size={20} aria-hidden />}
        >
          开始使用{chosen === undefined ? "" : `，至 ${chosen.endClock}`}
        </Button>
      </Stack>
    </form>
  );
}

/**
 * Extend / end controls for the viewer's ongoing booking.
 *
 * @param props - Component props.
 * @param props.booking - The ongoing booking.
 * @returns The controls.
 */
function OngoingControls({ booking }: { booking: Booking }) {
  const [pending, setPending] = useState<string>();

  return (
    <Card as="section" ariaLabel="你正在使用">
      <h2 {...stylex.props(styles.sectionLabel)}>
        <Timer size={20} aria-hidden />
        你正在使用，到 {formatClock(booking.end)}
      </h2>
      <div {...stylex.props(styles.extendRow)}>
        {([15, 30, 60] as const).map((minutes) => (
          <Button
            key={minutes}
            variant="soft"
            size="lg"
            isLoading={pending === `extend-${minutes}`}
            disabled={pending !== undefined}
            aria-label={`续时 ${minutes} 分钟`}
            onClick={() => {
              setPending(`extend-${minutes}`);
              void extendBooking(booking, minutes).finally(() => setPending(undefined));
            }}
          >
            +{minutes} 分钟
          </Button>
        ))}
      </div>
      <Button
        variant="secondary"
        size="lg"
        isFullWidth
        icon={<Square size={16} aria-hidden />}
        isLoading={pending === "end"}
        disabled={pending !== undefined}
        onClick={() => {
          setPending("end");
          void endBooking(booking).finally(() => setPending(undefined));
        }}
      >
        提前结束
      </Button>
    </Card>
  );
}

/**
 * Agenda row for a booking.
 *
 * @param props - Row props.
 * @param props.booking - The booking.
 * @param props.now - Current time.
 * @param props.isDayNamed - Outside a day-scoped list: name the day when it is not today.
 * @param props.onSelect - Open details.
 * @returns The row.
 */
function AgendaBookingRow({
  booking,
  now,
  isDayNamed = false,
  onSelect,
}: {
  booking: Booking;
  now: Temporal.ZonedDateTime;
  isDayNamed?: boolean;
  onSelect: (booking: Booking) => void;
}) {
  const isNow = isOngoing(booking, now);
  const isPast = isFinished(booking, now);
  const who = booking.kind === "block" ? "不可预约" : (booking.person?.name ?? "");
  const day = isDayNamed ? formatDayPrefix(parseZoned(booking.start).toPlainDate(), now.toPlainDate()) : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(booking)}
      {...stylex.props(styles.agendaRow, isNow && styles.agendaNow, isPast && styles.agendaPast)}
    >
      <span {...stylex.props(styles.agendaTime, day !== "" && styles.agendaTimeDated)}>
        {day === "" ? null : <span {...stylex.props(styles.agendaDay)}>{day}</span>}
        <span>
          {formatClock(booking.start)}–{formatClock(booking.end)}
        </span>
      </span>
      <span {...stylex.props(styles.agendaBody)}>
        <span {...stylex.props(styles.agendaTitle)}>
          {who}
          {booking.isMine ? "（我）" : ""}
        </span>
        <span {...stylex.props(styles.agendaMeta)}>
          {booking.series === undefined ? null : <Repeat size={13} aria-label="周期预约" />}
          {booking.title === "" ? (booking.kind === "block" ? "" : "未填写用途") : booking.title}
          {isNow ? " · 进行中" : ""}
        </span>
      </span>
    </button>
  );
}

/**
 * Today's bookings with the free gaps between them.
 *
 * @param props - Agenda props.
 * @param props.room - The room.
 * @param props.bookings - Today's bookings.
 * @param props.now - Current time.
 * @param props.onSelect - Open a booking.
 * @returns The agenda.
 */
function TodayAgenda({
  room,
  bookings,
  now,
  onSelect,
}: {
  room: Room;
  bookings: readonly Booking[];
  now: Temporal.ZonedDateTime;
  onSelect: (booking: Booking) => void;
}) {
  const entries = dayAgenda(bookings, now.toPlainDate(), room.rules.openTime, room.rules.closeTime, now);
  const date = now.toPlainDate().toString();

  if (entries.length === 0) {
    return <Notice tone="info">今天已经没有可预约的时段了。</Notice>;
  }

  return (
    <ul {...stylex.props(styles.agenda)}>
      {entries.map((entry) => (
        <li key={entry.kind === "booking" ? `b${entry.item.id}` : `f${entry.startMinutes}`}>
          {entry.kind === "booking" ? (
            <AgendaBookingRow booking={entry.item} now={now} onSelect={onSelect} />
          ) : (
            <Link
              to="/r/$slug/book"
              params={{ slug: room.slug }}
              search={{
                date,
                start: minutesToClock(ceilToGrid(entry.startMinutes)),
                end: minutesToClock(Math.min(entry.endMinutes, ceilToGrid(entry.startMinutes) + 60)),
              }}
              aria-label={`空闲 ${minutesToClock(entry.startMinutes)} 到 ${minutesToClock(entry.endMinutes)}，预约这个时段`}
              {...stylex.props(styles.agendaRow, styles.agendaFree)}
            >
              <span {...stylex.props(styles.agendaTime)}>
                {minutesToClock(entry.startMinutes)}–{minutesToClock(entry.endMinutes)}
              </span>
              <span {...stylex.props(styles.agendaBody)}>
                <span {...stylex.props(styles.freeText)}>
                  空闲 {formatDuration(entry.endMinutes - entry.startMinutes)}
                </span>
              </span>
              <span {...stylex.props(styles.freeAction)}>预约</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Collapsible "会议热力图": the booked share of every hour of one week, current week first, with
 * week navigation. A day or a cell opens the calendar there.
 *
 * @param props - Panel props.
 * @param props.slug - Room slug.
 * @param props.now - Current time.
 * @param props.onOpen - Show a date (and an `HH:MM` time) in the calendar.
 * @returns The panel.
 */
function MeetingHeatmap({
  slug,
  now,
  onOpen,
}: {
  slug: string;
  now: Temporal.ZonedDateTime;
  onOpen: (date: string, clock?: string) => void;
}) {
  const today = now.toPlainDate();
  const thisWeek = startOfWeek(today);
  const [week, setWeek] = useState(thisWeek.toString());
  const heatmap = useRoomHeatmap(slug, week);
  const weekStart = parseDate(week);
  const days = dateRange(weekStart, 7);
  const weekLabel = formatDateSpan(weekStart, weekStart.add({ days: 6 }));
  const hours = heatmap.data?.hours ?? [];
  const summary = heatSummary(heatRows(heatmap.data?.cells, 7, hours));
  const isLoading = heatmap.isPlaceholderData;

  const rows: HeatmapRow[] = days.map((date) => ({
    label: weekdayLabel(date.dayOfWeek).replace("周", ""),
    name: weekdayLabel(date.dayOfWeek),
    actionLabel: `在日历中查看 ${formatDateLabel(date)}`,
    isHighlighted: date.equals(today),
  }));

  return (
    <Card as="section" ariaLabel="会议热力图">
      <Disclosure title="会议热力图" hint="一周各时段的预约">
        <div {...stylex.props(styles.heatmapBody)}>
          <div {...stylex.props(styles.weekBar)}>
            <span aria-live="polite" {...stylex.props(styles.weekLabel)}>
              {weekLabel}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={weekStart.equals(thisWeek)}
              onClick={() => setWeek(thisWeek.toString())}
            >
              本周
            </Button>
            <Button
              variant="ghost"
              aria-label="上一周"
              onClick={() => setWeek(weekStart.subtract({ weeks: 1 }).toString())}
              icon={<ChevronLeft size={20} aria-hidden />}
            />
            <Button
              variant="ghost"
              aria-label="下一周"
              onClick={() => setWeek(weekStart.add({ weeks: 1 }).toString())}
              icon={<ChevronRight size={20} aria-hidden />}
            />
          </div>
          {heatmap.data === undefined ? (
            heatmap.isError ? (
              <Notice tone="info">暂时无法加载热力图。</Notice>
            ) : (
              <Skeleton height={200} />
            )
          ) : (
            <div
              aria-busy={isLoading}
              {...stylex.props(styles.heatmapData, isLoading && styles.heatmapLoading)}
            >
              <p {...stylex.props(styles.freeSummary)}>
                {summary.busiestRow === undefined
                  ? "这一周没有预约"
                  : `共预约 ${formatDuration(summary.totalMinutes)}，最忙的是${weekdayLabel(summary.busiestRow + 1)}`}
              </p>
              <HeatmapGrid
                matrix={heatmap.data.cells}
                hours={hours}
                rows={rows}
                caption={`${weekLabel} 各时段的预约比例，颜色越深预约越满`}
                valueLabel="已预约"
                onSelect={(row, hour) => {
                  const date = days[row];

                  if (date === undefined) return;

                  onOpen(date.toString(), hour === undefined ? undefined : minutesToClock(hour * 60));
                }}
              />
            </div>
          )}
        </div>
      </Disclosure>
    </Card>
  );
}
