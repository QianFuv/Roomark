/**
 * Room layout: stores the room token from the QR link, shows the room header and sub-navigation.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarDays, CirclePlus, House, QrCode, Users } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

import { isRoomTokenError } from "../../../api/client";
import { ScanRoomActions } from "../../../features/room/scan-room";
import { useRoomDetail } from "../../../features/room/room-data";
import {
  forgetRoom,
  markLastRoom,
  rememberRoom,
  rememberRoomName,
  roomToken,
  useSession,
} from "../../../state/app-store";
import { colors, fonts, media, radii } from "../../../styles/tokens.stylex";
import { EmptyState, Skeleton, Stack } from "../../../ui/layout";

const searchSchema = z.object({
  k: z.string().optional(),
  quick: z.boolean().optional(),
});

export const Route = createFileRoute("/r/$slug")({
  validateSearch: searchSchema,
  beforeLoad: ({ params, search }) => {
    if (search.k !== undefined && search.k !== "") {
      rememberRoom(params.slug, search.k);
      throw redirect({ to: "/r/$slug", params, search: { quick: search.quick }, replace: true });
    }
  },
  component: RoomLayout,
});

const styles = stylex.create({
  top: {
    alignItems: { default: "stretch", [media.narrow]: "flex-end" },
    display: "flex",
    flexDirection: { default: "column", [media.narrow]: "row" },
    gap: { default: 14, [media.narrow]: 24 },
    justifyContent: "space-between",
  },
  header: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  name: { fontSize: { default: fonts.sizeXxl, [media.narrow]: 30 }, fontWeight: 800, lineHeight: 1.2 },
  meta: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: fonts.sizeSm,
    gap: 12,
  },
  metaItem: { alignItems: "center", display: "inline-flex", gap: 4 },
  tabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: "flex",
    flexShrink: 0,
    gap: 2,
    padding: 3,
    width: { default: "100%", [media.narrow]: 360 },
  },
  tab: {
    alignItems: "center",
    backgroundColor: { default: "transparent", '[data-status="active"]': colors.surfaceRaised },
    borderRadius: radii.small,
    boxShadow: { default: "none", '[data-status="active"]': `0 1px 3px ${colors.shadowStrong}` },
    color: { default: colors.textMuted, '[data-status="active"]': colors.primaryText },
    display: "flex",
    flexGrow: 1,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    textDecoration: "none",
  },
});

/**
 * Room layout component.
 *
 * @returns The layout.
 */
function RoomLayout() {
  const { slug } = Route.useParams();
  const session = useSession();
  const hasToken = roomToken(slug) !== undefined;
  const canView = hasToken || session?.person.isAdmin === true;

  if (!canView) {
    return (
      <EmptyState icon={<QrCode size={40} aria-hidden />} title="请扫描会议室门口的二维码">
        <p>为了保护预约信息，需要先扫描门口的二维码才能查看这间会议室。</p>
        <ScanRoomActions />
      </EmptyState>
    );
  }

  return <RoomFrame slug={slug} />;
}

/**
 * Header, tabs and outlet for a viewable room.
 *
 * @param props - Frame props.
 * @param props.slug - Room slug.
 * @returns The frame.
 */
function RoomFrame({ slug }: { slug: string }) {
  const detail = useRoomDetail(slug);
  const isTokenRejected = detail.isError && isRoomTokenError(detail.error);
  const room = detail.data?.room;

  useEffect(() => {
    markLastRoom(slug);
  }, [slug]);

  useEffect(() => {
    if (room !== undefined) rememberRoomName(slug, room.name);
  }, [room, slug]);

  useEffect(() => {
    if (isTokenRejected) forgetRoom(slug);
  }, [isTokenRejected, slug]);

  if (isTokenRejected) {
    return (
      <EmptyState icon={<QrCode size={40} aria-hidden />} title="二维码已更新">
        <p>这间会议室的二维码已经更换，请重新扫描门口的新二维码。</p>
        <ScanRoomActions />
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg">
      <div {...stylex.props(styles.top)}>
        <header {...stylex.props(styles.header)}>
          {room === undefined ? (
            <Skeleton height={36} width="50%" />
          ) : (
            <>
              <h1 {...stylex.props(styles.name)}>{room.name}</h1>
              <div {...stylex.props(styles.meta)}>
                {room.location === "" ? null : <span>{room.location}</span>}
                {room.capacity > 0 ? (
                  <span {...stylex.props(styles.metaItem)}>
                    <Users size={14} aria-hidden />
                    可容纳 {room.capacity} 人
                  </span>
                ) : null}
              </div>
            </>
          )}
        </header>
        <nav aria-label="会议室" {...stylex.props(styles.tabs)}>
          <Link
            to="/r/$slug"
            params={{ slug }}
            activeOptions={{ exact: true, includeSearch: false }}
            {...stylex.props(styles.tab)}
          >
            <House size={18} aria-hidden />
            概况
          </Link>
          <Link
            to="/r/$slug/book"
            params={{ slug }}
            activeOptions={{ includeSearch: false }}
            {...stylex.props(styles.tab)}
          >
            <CirclePlus size={18} aria-hidden />
            预约
          </Link>
          <Link
            to="/r/$slug/calendar"
            params={{ slug }}
            activeOptions={{ includeSearch: false }}
            {...stylex.props(styles.tab)}
          >
            <CalendarDays size={18} aria-hidden />
            日历
          </Link>
        </nav>
      </div>
      <Outlet />
    </Stack>
  );
}
