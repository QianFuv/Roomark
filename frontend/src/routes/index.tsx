/**
 * Home route: room-code entry when no room is bound (or with `?add`), redirect to the only room,
 * or cards for several rooms.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

import { isRoomTokenError } from "../api/client";
import { statusSummary } from "../features/room/room-home";
import { ScanRoomActions } from "../features/room/scan-room";
import { useRoomDetail } from "../features/room/room-data";
import { forgetRoom, useRememberedRooms } from "../state/app-store";
import { colors, media, radii, space } from "../styles/tokens.stylex";
import { PageHeader, Skeleton, Stack } from "../ui/layout";
import { text } from "../ui/typography";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ add: z.boolean().optional() }),
  component: HomePage,
});

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: space.md,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [media.narrow]: "repeat(2, minmax(0, 1fr))",
      [media.wide]: "repeat(3, minmax(0, 1fr))",
    },
  },
  card: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    display: "flex",
    gap: space.md,
    minHeight: 72,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: space.md,
    paddingInline: space.cardPadding,
    textDecoration: "none",
  },
  dot: { borderRadius: radii.pill, flexShrink: 0, height: 10, width: 10 },
  free: { backgroundColor: colors.free },
  busy: { backgroundColor: colors.busySolid },
  unknown: { backgroundColor: colors.textSubtle },
  body: { display: "flex", flexDirection: "column", flexGrow: 1, gap: space.xxs, minWidth: 0 },
  summary: { color: colors.textMuted },
  chevron: { color: colors.textSubtle, flexShrink: 0 },
  addCard: { borderStyle: "dashed", color: colors.primaryText, justifyContent: "center" },
  bind: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    paddingBlock: space.xl,
  },
});

/**
 * Home page.
 *
 * @returns The page.
 */
function HomePage() {
  const rooms = useRememberedRooms();
  const { add } = Route.useSearch();
  const [onlyRoom] = rooms;

  if (rooms.length === 0 || add === true) {
    return (
      <div {...stylex.props(styles.bind)}>
        <PageHeader title={rooms.length === 0 ? "绑定会议室" : "添加会议室"} />
        <ScanRoomActions isAutoFocus />
      </div>
    );
  }

  if (rooms.length === 1 && onlyRoom !== undefined) {
    return <Navigate to="/r/$slug" params={{ slug: onlyRoom.slug }} replace />;
  }

  return (
    <Stack gap="lg">
      <PageHeader title="会议室" />
      <ul aria-label="会议室列表" {...stylex.props(styles.grid)}>
        {rooms.map((room) => (
          <li key={room.slug}>
            <RoomCard slug={room.slug} fallbackName={room.name ?? room.slug} />
          </li>
        ))}
        <li>
          <Link to="/" search={{ add: true }} {...stylex.props(text.label, styles.card, styles.addCard)}>
            <Plus aria-hidden />
            添加会议室
          </Link>
        </li>
      </ul>
    </Stack>
  );
}

/**
 * Card with live status for one room.
 *
 * @param props - Card props.
 * @param props.slug - Room slug.
 * @param props.fallbackName - Name shown before data loads.
 * @returns The card.
 */
function RoomCard({ slug, fallbackName }: { slug: string; fallbackName: string }) {
  const detail = useRoomDetail(slug);
  const data = detail.data;
  const state = data?.status.state;
  const isTokenRejected = detail.isError && isRoomTokenError(detail.error);

  useEffect(() => {
    if (isTokenRejected) forgetRoom(slug);
  }, [isTokenRejected, slug]);

  return (
    <Link to="/r/$slug" params={{ slug }} {...stylex.props(styles.card)}>
      <span
        aria-hidden
        {...stylex.props(
          styles.dot,
          state === "free" ? styles.free : state === "busy" ? styles.busy : styles.unknown,
        )}
      />
      <span {...stylex.props(styles.body)}>
        <span {...stylex.props(text.title)}>{data?.room.name ?? fallbackName}</span>
        {data === undefined ? (
          detail.isError ? (
            <span {...stylex.props(text.body, styles.summary)}>
              {isTokenRejected ? "房间码已失效" : "状态加载失败"}
            </span>
          ) : (
            <Skeleton height={22} width="60%" />
          )
        ) : (
          <span {...stylex.props(text.body, styles.summary)}>{statusSummary(data.room, data.status)}</span>
        )}
      </span>
      <ChevronRight aria-hidden {...stylex.props(styles.chevron)} />
    </Link>
  );
}
