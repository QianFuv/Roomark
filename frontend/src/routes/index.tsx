/**
 * Home route: scan prompt, redirect to the only room, or cards for several rooms.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, QrCode } from "lucide-react";

import { isRoomTokenError } from "../api/client";
import { statusSummary } from "../features/room/room-home";
import { ScanRoomActions } from "../features/room/scan-room";
import { useRoomDetail } from "../features/room/room-data";
import { platform } from "../platform/platform";
import { useRememberedRooms } from "../state/app-store";
import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { EmptyState, PageHeader, Skeleton, Stack } from "../ui/layout";

export const Route = createFileRoute("/")({ component: HomePage });

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
  hint: { color: colors.textMuted, fontSize: fonts.sizeMd, lineHeight: 1.7, maxWidth: 420 },
});

/**
 * Home page.
 *
 * @returns The page.
 */
function HomePage() {
  const rooms = useRememberedRooms();
  const [onlyRoom] = rooms;

  if (rooms.length === 1 && onlyRoom !== undefined) {
    return <Navigate to="/r/$slug" params={{ slug: onlyRoom.slug }} replace />;
  }

  if (rooms.length === 0) {
    return (
      <EmptyState icon={<QrCode size={48} aria-hidden />} title="请扫描会议室门口的二维码">
        <p {...stylex.props(styles.hint)}>
          {platform().isApp
            ? "扫码绑定会议室后，就能在这里查看空闲情况并预约。"
            : "用手机相机扫描门口的二维码，就能查看会议室是否空闲并预约。"}
        </p>
        {platform().isApp ? <ScanRoomActions /> : null}
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="会议室" subtitle="这台设备上扫过的会议室" />
      <ul aria-label="会议室列表" {...stylex.props(styles.grid)}>
        {rooms.map((room) => (
          <li key={room.slug}>
            <RoomCard slug={room.slug} fallbackName={room.name ?? room.slug} />
          </li>
        ))}
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
            <span {...stylex.props(styles.summary)}>
              {isRoomTokenError(detail.error) ? "二维码已更新，请重新扫描" : "暂时无法获取状态"}
            </span>
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
