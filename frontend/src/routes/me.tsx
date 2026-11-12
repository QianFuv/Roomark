/**
 * "我的" route: identity, my bookings (upcoming / past, series collapsed) and calendar feeds.
 *
 * @module
 */
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible";
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarX2, ChevronDown, Copy, Repeat, UserRoundCog } from "lucide-react";
import { useState } from "react";

import { api, errorMessage, serverUrl, type Booking } from "../api/client";
import { cancelBooking } from "../features/booking/booking-actions";
import { BookingDetailSheet } from "../features/booking/booking-detail";
import { requestSession } from "../features/identity/identity";
import type { components } from "../api/schema";
import { formatBookingWhen, formatMonthDay, nowZoned, parseZoned } from "../lib/time";
import { useRememberedRooms, useSession } from "../state/app-store";
import { colors, fonts, radii, sizes, space } from "../styles/tokens.stylex";
import { Button } from "../ui/button";
import { TabView } from "../ui/controls";
import { HelpHint } from "../ui/help-hint";
import { ICON_SIZE } from "../ui/icon";
import { Badge, Card, EmptyState, Notice, PageHeader, Section, Skeleton, Stack } from "../ui/layout";
import { notify } from "../ui/toast";
import { text } from "../ui/typography";

export const Route = createFileRoute("/me")({ component: MePage });

type MySeries = components["schemas"]["MySeries"];

const styles = stylex.create({
  page: { marginInline: "auto", maxWidth: 880, width: "100%" },
  list: { display: "flex", flexDirection: "column", gap: space.sm },
  item: {
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
    gap: space.md,
    minHeight: sizes.controlLarge,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: space.rowPaddingBlock,
    paddingInline: space.rowPaddingInline,
    textAlign: "start",
    width: "100%",
  },
  itemBody: { display: "flex", flexDirection: "column", flexGrow: 1, gap: space.xxs, minWidth: 0 },
  itemTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemMeta: { color: colors.textMuted },
  seriesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  seriesTrigger: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontFamily: fonts.sans,
    gap: space.md,
    minHeight: sizes.controlLarge,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: space.rowPaddingBlock,
    paddingInline: space.rowPaddingInline,
    textAlign: "start",
    width: "100%",
  },
  seriesIcon: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.medium,
    color: colors.primaryText,
    display: "inline-flex",
    flexShrink: 0,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  chevron: {
    color: colors.textSubtle,
    flexShrink: 0,
    transitionDuration: "200ms",
    transitionProperty: "transform",
  },
  chevronOpen: { transform: "rotate(180deg)" },
  seriesPanel: { overflow: "hidden" },
  seriesBody: {
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
    padding: space.sm,
  },
  occurrence: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderRadius: radii.small,
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    fontFamily: fonts.sans,
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.sm,
    textAlign: "start",
  },
  feedRow: { alignItems: "center", display: "flex", gap: space.sm },
  feedText: { display: "flex", flexDirection: "column", flexGrow: 1, gap: space.xxs, minWidth: 0 },
  feedUrl: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/**
 * "我的" page.
 *
 * @returns The page.
 */
function MePage() {
  const session = useSession();

  if (session === undefined) {
    return (
      <EmptyState icon={<UserRoundCog size={ICON_SIZE.empty} aria-hidden />} title="登录后查看你的预约">
        <Button variant="primary" onClick={() => void requestSession()}>
          登录
        </Button>
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg" xstyle={styles.page}>
      <PageHeader title="我的预约" />
      <MyBookings />
      <Feeds />
    </Stack>
  );
}

/**
 * Upcoming / past tabs.
 *
 * @returns The bookings section.
 */
function MyBookings() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [selected, setSelected] = useState<Booking>();

  return (
    <Stack gap="md">
      <TabView
        label="预约时间"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: "upcoming",
            label: "即将开始",
            content: <BookingList isPast={false} onSelect={setSelected} />,
          },
          { value: "past", label: "已结束", content: <BookingList isPast onSelect={setSelected} /> },
        ]}
      />
      <BookingDetailSheet booking={selected} onClose={() => setSelected(undefined)} />
    </Stack>
  );
}

/**
 * Singles and series for one tab.
 *
 * @param props - List props.
 * @param props.isPast - Show finished bookings.
 * @param props.onSelect - Open a booking.
 * @returns The list.
 */
function BookingList({ isPast, onSelect }: { isPast: boolean; onSelect: (booking: Booking) => void }) {
  const query = api.useQuery(
    "get",
    "/api/me/bookings",
    { params: { query: { past: isPast } } },
    { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  );

  const rooms = useRememberedRooms();
  const roomName = (slug: string) => rooms.find((room) => room.slug === slug)?.name ?? slug;

  if (query.data === undefined) {
    return query.isError ? (
      <Notice tone="busy">{errorMessage(query.error)}</Notice>
    ) : (
      <Stack gap="sm">
        <Skeleton height={60} />
        <Skeleton height={60} />
        <Skeleton height={60} />
      </Stack>
    );
  }

  const singles = query.data.singles ?? [];
  const series = query.data.series ?? [];

  if (singles.length === 0 && series.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX2 size={ICON_SIZE.empty} aria-hidden />}
        title={isPast ? "还没有已结束的预约" : "没有即将开始的预约"}
      ></EmptyState>
    );
  }

  return (
    <ul {...stylex.props(styles.list)}>
      {series.map((item) => (
        <li key={`s${item.id}`}>
          <SeriesCard series={item} roomName={roomName(item.roomSlug)} isPast={isPast} onSelect={onSelect} />
        </li>
      ))}
      {singles.map((booking) => (
        <li key={booking.id}>
          <button type="button" onClick={() => onSelect(booking)} {...stylex.props(text.body, styles.item)}>
            <span {...stylex.props(styles.itemBody)}>
              <span {...stylex.props(text.label, styles.itemTitle)}>
                {booking.title === "" ? "会议室预约" : booking.title}
              </span>
              <span {...stylex.props(text.meta, styles.itemMeta)}>
                {formatBookingWhen(booking.start, booking.end)} · {roomName(booking.roomSlug)}
              </span>
            </span>
            {booking.status === "cancelled" ? <Badge>已取消</Badge> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Collapsed series card that expands to its occurrences.
 *
 * @param props - Card props.
 * @param props.series - The series.
 * @param props.roomName - Room display name.
 * @param props.isPast - Past tab.
 * @param props.onSelect - Open an occurrence.
 * @returns The card.
 */
function SeriesCard({
  series,
  roomName,
  isPast,
  onSelect,
}: {
  series: MySeries;
  roomName: string;
  isPast: boolean;
  onSelect: (booking: Booking) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const occurrences = series.occurrences ?? [];
  const now = nowZoned();

  const nextOccurrence = occurrences.find(
    (booking) => parseZoned(booking.start).epochMilliseconds > now.epochMilliseconds,
  );

  const summary = [
    series.ruleSummary,
    `${formatMonthDay(series.firstDate)}–${formatMonthDay(series.lastDate)}`,
    isPast ? `共 ${occurrences.length} 次` : `还剩 ${series.remaining} 次`,
    roomName,
  ].join(" · ");

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={(open) => setIsOpen(open)}
      {...stylex.props(styles.seriesCard)}
    >
      <Collapsible.Trigger {...stylex.props(text.body, styles.seriesTrigger)}>
        <span aria-hidden {...stylex.props(styles.seriesIcon)}>
          <Repeat />
        </span>
        <span {...stylex.props(styles.itemBody)}>
          <span {...stylex.props(text.label, styles.itemTitle)}>
            {series.title === "" ? "周期预约" : series.title}
          </span>
          <span {...stylex.props(text.meta, styles.itemMeta)}>{summary}</span>
        </span>
        <ChevronDown aria-hidden {...stylex.props(styles.chevron, isOpen && styles.chevronOpen)} />
      </Collapsible.Trigger>
      <Collapsible.Panel {...stylex.props(styles.seriesPanel)}>
        <div {...stylex.props(styles.seriesBody)}>
          {occurrences.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => onSelect(booking)}
              {...stylex.props(text.body, styles.occurrence)}
            >
              {formatBookingWhen(booking.start, booking.end)}
            </button>
          ))}
          {isPast || nextOccurrence === undefined || !nextOccurrence.canEdit ? null : (
            <Button
              variant="danger"
              isFullWidth
              onClick={() => {
                void cancelBooking(nextOccurrence);
              }}
            >
              从 {formatMonthDay(parseZoned(nextOccurrence.start).toPlainDate())} 起取消
            </Button>
          )}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

/**
 * Calendar subscription links with copy buttons.
 *
 * @returns The feeds section.
 */
function Feeds() {
  const feeds = api.useQuery("get", "/api/me/feeds", {}, { staleTime: Number.POSITIVE_INFINITY });
  const rooms = useRememberedRooms();
  const origin = serverUrl("") === "" ? globalThis.location.origin : serverUrl("");

  return (
    <Card as="section" ariaLabel="日历订阅">
      <Section
        title="日历订阅"
        help={
          <HelpHint topic="日历订阅">
            把链接添加到手机或电脑日历的「订阅日历」（iCal），预约会自动同步过去。
          </HelpHint>
        }
      >
        {feeds.data === undefined ? (
          <Skeleton height={48} />
        ) : (
          <FeedRow label="我的预约" url={feeds.data.personFeedUrl} />
        )}
        {rooms.map((room) => (
          <FeedRow
            key={room.slug}
            label={`${room.name ?? room.slug} 全部预约`}
            url={`${origin}/ical/${encodeURIComponent(room.slug)}.ics?k=${encodeURIComponent(room.token)}`}
          />
        ))}
      </Section>
    </Card>
  );
}

/**
 * One feed with a copy button.
 *
 * @param props - Row props.
 * @param props.label - Feed name.
 * @param props.url - Feed URL.
 * @returns The row.
 */
function FeedRow({ label, url }: { label: string; url: string }) {
  return (
    <div {...stylex.props(styles.feedRow)}>
      <span {...stylex.props(styles.feedText)}>
        <span {...stylex.props(text.label)}>{label}</span>
        <span {...stylex.props(text.meta, styles.feedUrl)}>{url}</span>
      </span>
      <Button
        variant="soft"
        size="sm"
        aria-label={`复制「${label}」订阅链接`}
        icon={<Copy aria-hidden />}

        onClick={() => {
          void navigator.clipboard
            .writeText(url)
            .then(() => notify("success", "已复制订阅链接"))
            .catch(() => notify("error", "复制失败", url));
        }}
      >
        复制
      </Button>
    </div>
  );
}
