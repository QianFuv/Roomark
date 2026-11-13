/**
 * Room layout: stores the room token from the QR link, shows the room header and sub-navigation.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { CalendarDays, CirclePlus, House, QrCode, Users } from "lucide-react";
import { useEffect } from "react";
import { useSelector } from "@tanstack/react-store";
import { z } from "zod";

import { isRoomTokenError, queryClient } from "../../../api/client";
import { ScanRoomActions } from "../../../features/room/scan-room";
import { useRoomDetail } from "../../../features/room/room-data";
import {
  forgetRoom,
  markLastRoom,
  rememberRoom,
  rememberRoomName,
  appStore,
  useSession,
} from "../../../state/app-store";
import { colors, media, radii, sizes, space } from "../../../styles/tokens.stylex";
import { ICON_SIZE } from "../../../ui/icon";
import { EmptyState, Skeleton, Stack } from "../../../ui/layout";
import { text } from "../../../ui/typography";

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
  page: { flexGrow: 1 },
  /** Height left for a room page under the top bar (narrow) or beside the side navigation (wide). */
  fillNarrow: {
    height: {
      default: "auto",
      [media.narrow]: `calc(100dvh - 57px - env(safe-area-inset-top) - ${space.pagePaddingNarrow} - max(${space.xxl}, env(safe-area-inset-bottom)))`,
      [media.wide]: `calc(100dvh - ${space.pagePaddingWide} - max(${space.xxl}, env(safe-area-inset-bottom)))`,
    },
    minHeight: { default: "auto", [media.narrow]: 520 },
  },
  top: {
    alignItems: { default: "stretch", [media.narrow]: "flex-end" },
    display: "flex",
    flexDirection: { default: "column", [media.narrow]: "row" },
    gap: { default: space.md, [media.narrow]: space.xl },
    justifyContent: "space-between",
  },
  header: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  meta: {
    alignItems: "center",
    color: colors.textMuted,
    columnGap: space.md,
    display: "flex",
    flexWrap: "wrap",
  },
  metaItem: { alignItems: "center", display: "inline-flex", gap: space.xs },
  tabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: "flex",
    flexShrink: 0,
    gap: space.xxs,
    padding: space.xxs,
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
    gap: space.sm,
    justifyContent: "center",
    minHeight: sizes.control,
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
  const hasToken = useSelector(appStore, (state) => state.rooms[slug]?.token) !== undefined;
  const canView = hasToken || session?.person.isAdmin === true;

  if (!canView) {
    return (
      <EmptyState icon={<QrCode size={ICON_SIZE.empty} aria-hidden />} title="输入房间码">
        <ScanRoomActions isAutoFocus />
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const page = pathname.replace(/\/+$/, "").split("/").at(-1);
  const isWorkspace = page === slug || page === "calendar";
  const isTokenRejected = detail.isError && isRoomTokenError(detail.error);
  const room = detail.data?.room;

  useEffect(() => {
    markLastRoom(slug);
  }, [slug]);

  useEffect(() => {
    if (room !== undefined) rememberRoomName(slug, room.name);
  }, [room, slug]);

  useEffect(() => {
    if (!isTokenRejected) return;

    forgetRoom(slug);
    queryClient.removeQueries({
      predicate: (query) => String(query.queryKey[1]).startsWith("/api/rooms/{slug}"),
    });
  }, [isTokenRejected, slug]);

  if (isTokenRejected) {
    return (
      <EmptyState icon={<QrCode size={ICON_SIZE.empty} aria-hidden />} title="输入房间码">
        <ScanRoomActions isAutoFocus />
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg" xstyle={[styles.page, isWorkspace && styles.fillNarrow]}>
      <div {...stylex.props(styles.top)}>
        <header {...stylex.props(styles.header)}>
          {room === undefined ? (
            <Skeleton height={32} width="50%" />
          ) : (
            <>
              <h1 {...stylex.props(text.display)}>{room.name}</h1>
              <div {...stylex.props(text.meta, styles.meta)}>
                {room.location === "" ? null : <span>{room.location}</span>}
                {room.capacity > 0 ? (
                  <span {...stylex.props(styles.metaItem)}>
                    <Users size={ICON_SIZE.meta} aria-hidden />
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
            {...stylex.props(text.label, styles.tab)}
          >
            <House size={ICON_SIZE.nav} aria-hidden />
            概况
          </Link>
          <Link
            to="/r/$slug/book"
            params={{ slug }}
            activeOptions={{ includeSearch: false }}
            {...stylex.props(text.label, styles.tab)}
          >
            <CirclePlus size={ICON_SIZE.nav} aria-hidden />
            预约
          </Link>
          <Link
            to="/r/$slug/calendar"
            params={{ slug }}
            activeOptions={{ includeSearch: false }}
            {...stylex.props(text.label, styles.tab)}
          >
            <CalendarDays size={ICON_SIZE.nav} aria-hidden />
            日历
          </Link>
        </nav>
      </div>
      <Outlet />
    </Stack>
  );
}
