/**
 * "我的" route: identity, my bookings (upcoming / past, series collapsed) and calendar feeds.
 *
 * @module
 */
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible";
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarX2,
  ChevronDown,
  Copy,
  KeyRound,
  LogOut,
  Repeat,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import { useState } from "react";

import { api, errorMessage, fetchClient, serverUrl, type Booking } from "../api/client";
import { cancelBooking } from "../features/booking/booking-actions";
import { BookingDetailSheet } from "../features/booking/booking-detail";
import { LengthChooser, NewPasscode, logout, requestSession } from "../features/identity/identity";
import type { components } from "../api/schema";
import { formatBookingWhen, formatMonthDay, nowZoned, parseZoned } from "../lib/time";
import { useRememberedRooms, useSession, type StoredSession } from "../state/app-store";
import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { Button } from "../ui/button";
import { TabView } from "../ui/controls";
import { Badge, Card, EmptyState, Notice, PageHeader, Row, Section, Skeleton, Stack } from "../ui/layout";
import { PasscodeInput, type PasscodeLength } from "../ui/passcode";
import { Sheet } from "../ui/sheet";
import { notify } from "../ui/toast";

export const Route = createFileRoute("/me")({ component: MePage });

type MySeries = components["schemas"]["MySeries"];

const ROLE_LABELS = { teacher: "老师", student: "学生", other: "其他" } as const;

const styles = stylex.create({
  layout: {
    alignItems: "start",
    display: "grid",
    gap: 16,
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.desktop]: "minmax(0, 1.6fr) minmax(0, 1fr)" },
  },
  name: { fontSize: fonts.sizeXl, fontWeight: 800 },
  aside: {
    gridColumnStart: { default: "auto", [media.desktop]: 2 },
    gridRowStart: { default: "auto", [media.desktop]: 1 },
    minWidth: 0,
  },
  mainColumn: {
    gridColumnStart: { default: "auto", [media.desktop]: 1 },
    gridRowStart: { default: "auto", [media.desktop]: 1 },
    minWidth: 0,
  },
  wideOnly: { display: { default: "none", [media.desktop]: "block" } },
  narrowOnly: { display: { default: "block", [media.desktop]: "none" } },
  identityActions: { display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
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
    gap: 12,
    minHeight: 60,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 10,
    paddingInline: 14,
    textAlign: "start",
    width: "100%",
  },
  itemBody: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 3, minWidth: 0 },
  itemTitle: {
    fontSize: fonts.sizeMd,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemMeta: { color: colors.textMuted, fontSize: fonts.sizeSm, fontVariantNumeric: "tabular-nums" },
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
    gap: 12,
    minHeight: 64,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 10,
    paddingInline: 14,
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
    gap: 6,
    padding: 10,
  },
  occurrence: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderRadius: radii.small,
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    minHeight: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 8,
    textAlign: "start",
  },
  feedRow: { alignItems: "center", display: "flex", gap: 8 },
  feedText: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 2, minWidth: 0 },
  feedLabel: { fontSize: fonts.sizeMd, fontWeight: 600 },
  feedUrl: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fonts.sizeXs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  hint: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.6 },
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
      <EmptyState icon={<UserRoundCog size={40} aria-hidden />} title="还不知道你是谁">
        <p {...stylex.props(styles.hint)}>选择你的名字并输入口令后，可以在这里管理自己的预约。</p>
        <Button variant="primary" size="lg" onClick={() => void requestSession()}>
          选择我的名字
        </Button>
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="我的" />
      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.aside)}>
          <Stack gap="lg">
            <IdentityCard session={session} />
            <div {...stylex.props(styles.wideOnly)}>
              <Feeds />
            </div>
          </Stack>
        </div>
        <div {...stylex.props(styles.mainColumn)}>
          <MyBookings />
        </div>
        <div {...stylex.props(styles.narrowOnly)}>
          <Feeds />
        </div>
      </div>
    </Stack>
  );
}

/**
 * Identity card with switch, logout and passcode change.
 *
 * @param props - Card props.
 * @param props.session - The session.
 * @returns The card.
 */
function IdentityCard({ session }: { session: StoredSession }) {
  const [isChangingPasscode, setIsChangingPasscode] = useState(false);

  return (
    <Card as="section" ariaLabel="身份">
      <Row gap="sm">
        <span {...stylex.props(styles.name)}>{session.person.name}</span>
        <Badge>{ROLE_LABELS[session.person.role]}</Badge>
        {session.person.isAdmin ? (
          <Badge tone="info">
            <ShieldCheck size={12} aria-hidden />
            管理员
          </Badge>
        ) : null}
      </Row>
      <div {...stylex.props(styles.identityActions)}>
        <Button
          variant="secondary"
          size="sm"
          icon={<UserRoundCog size={16} aria-hidden />}
          onClick={() => {
            void logout().then(() => requestSession());
          }}
        >
          切换身份
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<KeyRound size={16} aria-hidden />}
          onClick={() => setIsChangingPasscode(true)}
        >
          修改口令
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<LogOut size={16} aria-hidden />}
          onClick={() => {
            void logout().then(() => notify("info", "已退出"));
          }}
        >
          退出
        </Button>
      </div>
      <Sheet isOpen={isChangingPasscode} onOpenChange={setIsChangingPasscode} title="修改口令">
        {isChangingPasscode ? <ChangePasscode onDone={() => setIsChangingPasscode(false)} /> : null}
      </Sheet>
    </Card>
  );
}

/**
 * Passcode change: current passcode, then the new one twice.
 *
 * @param props - Component props.
 * @param props.onDone - Close the sheet.
 * @returns The form.
 */
function ChangePasscode({ onDone }: { onDone: () => void }) {
  const [length, setLength] = useState<PasscodeLength>(4);
  const [current, setCurrent] = useState("");
  const [isCurrentEntered, setIsCurrentEntered] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCurrentEntered) {
    return (
      <Stack gap="lg">
        <LengthChooser
          length={length}
          onLengthChange={(next) => {
            setLength(next);
            setCurrent("");
          }}
        />
        <PasscodeInput
          label="当前口令"
          length={length}
          value={current}
          onValueChange={setCurrent}
          error={error}
          isAutoFocus
        />
        <Button
          variant="primary"
          size="lg"
          isFullWidth
          disabled={current.length !== length}
          onClick={() => {
            setError(undefined);
            setIsCurrentEntered(true);
          }}
        >
          下一步
        </Button>
      </Stack>
    );
  }

  return (
    <NewPasscode
      isSubmitting={isSubmitting}
      submitError={error}
      onSubmit={(next) => {
        setIsSubmitting(true);
        void fetchClient.PUT("/api/me/passcode", { body: { current, next } }).then((result) => {
          setIsSubmitting(false);

          if (result.data !== undefined) {
            notify("success", "口令已修改");
            onDone();

            return;
          }

          setError(errorMessage(result.error));
          setCurrent("");
          setIsCurrentEntered(false);
        });
      }}
    />
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
    <Section title="我的预约">
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
    </Section>
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
        icon={<CalendarX2 size={32} aria-hidden />}
        title={isPast ? "还没有已结束的预约" : "没有即将开始的预约"}
      >
        {isPast ? null : <p {...stylex.props(styles.hint)}>扫描会议室门口的二维码就能预约。</p>}
      </EmptyState>
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
          <button type="button" onClick={() => onSelect(booking)} {...stylex.props(styles.item)}>
            <span {...stylex.props(styles.itemBody)}>
              <span {...stylex.props(styles.itemTitle)}>
                {booking.title === "" ? "会议室预约" : booking.title}
              </span>
              <span {...stylex.props(styles.itemMeta)}>
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
      <Collapsible.Trigger {...stylex.props(styles.seriesTrigger)}>
        <span aria-hidden {...stylex.props(styles.seriesIcon)}>
          <Repeat size={18} />
        </span>
        <span {...stylex.props(styles.itemBody)}>
          <span {...stylex.props(styles.itemTitle)}>{series.title === "" ? "周期预约" : series.title}</span>
          <span {...stylex.props(styles.itemMeta)}>{summary}</span>
        </span>
        <ChevronDown size={20} aria-hidden {...stylex.props(styles.chevron, isOpen && styles.chevronOpen)} />
      </Collapsible.Trigger>
      <Collapsible.Panel {...stylex.props(styles.seriesPanel)}>
        <div {...stylex.props(styles.seriesBody)}>
          {occurrences.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => onSelect(booking)}
              {...stylex.props(styles.occurrence)}
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
              取消预约（下一次 {formatMonthDay(parseZoned(nextOccurrence.start).toPlainDate())} 起）
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
      <Section title="日历订阅">
        <p {...stylex.props(styles.hint)}>
          把下面的链接添加到手机或电脑的日历应用（订阅日历 / iCal），预约会自动同步。
        </p>
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
        <span {...stylex.props(styles.feedLabel)}>{label}</span>
        <span {...stylex.props(styles.feedUrl)}>{url}</span>
      </span>
      <Button
        variant="soft"
        size="sm"
        aria-label={`复制「${label}」订阅链接`}
        icon={<Copy size={16} aria-hidden />}
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
