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
import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { PageHeader, Skeleton, Stack } from "../ui/layout";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ add: z.boolean().optional() }),
  component: HomePage,
});

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: 12,
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
    gap: 14,
    minHeight: 84,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingBlock: 14,
    paddingInline: 16,
    textDecoration: "none",
  },
  dot: { borderRadius: radii.pill, flexShrink: 0, height: 12, width: 12 },
  free: { backgroundColor: colors.free },
  busy: { backgroundColor: colors.busy },
  unknown: { backgroundColor: colors.textSubtle },
  body: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 4, minWidth: 0 },
  name: { fontSize: fonts.sizeLg, fontWeight: 700 },
  summary: { color: colors.textMuted, fontSize: fonts.sizeSm, fontVariantNumeric: "tabular-nums" },
  summaryFree: { color: colors.free, fontWeight: 600 },
  summaryBusy: { color: colors.busy, fontWeight: 600 },
  chevron: { color: colors.textSubtle, flexShrink: 0 },
  addCard: { borderStyle: "dashed", color: colors.primaryText, fontWeight: 600, justifyContent: "center" },
  bind: { alignItems: "center", display: "flex", flexDirection: "column", gap: 20, paddingBlock: 24 },
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
          <Link to="/" search={{ add: true }} {...stylex.props(styles.card, styles.addCard)}>
            <Plus size={20} aria-hidden />
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
        <span {...stylex.props(styles.name)}>{data?.room.name ?? fallbackName}</span>
        {data === undefined ? (
          detail.isError ? (
            <span {...stylex.props(styles.summary)}>{isTokenRejected ? "房间码已失效" : "状态加载失败"}</span>
          ) : (
            <Skeleton height={16} width="60%" />
          )
        ) : (
          <span {...stylex.props(styles.summary, state === "free" ? styles.summaryFree : styles.summaryBusy)}>
            {statusSummary(data.room, data.status)}
          </span>
        )}
      </span>
      <ChevronRight size={20} aria-hidden {...stylex.props(styles.chevron)} />
    </Link>
  );
}
