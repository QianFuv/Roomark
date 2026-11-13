/**
 * Application shell for the three layout tiers. Mobile and narrow windows get a top bar (icons
 * only on mobile, labelled on narrow); wide windows get a side navigation with the rooms on this
 * device, 我的, the admin sections and the theme menu, next to a wider content area.
 *
 * @module
 */
import { Menu } from "@animate-ui/react/primitives/base-ui/menu";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChartColumn,
  Check,
  DoorOpen,
  ListChecks,
  Megaphone,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

import { IdentitySheet } from "../features/identity/identity";
import { AccountMenu } from "./account-menu";
import { ThemeResync } from "./theme-resync";
import { platform } from "../platform/platform";
import { appStore, useRememberedRooms, useSession } from "../state/app-store";
import { colors, fonts, media, radii, sizes, space } from "../styles/tokens.stylex";
import { DialogHost } from "../ui/dialogs";
import { ICON_SIZE } from "../ui/icon";
import { text } from "../ui/typography";

/** Admin sections, shared by the side navigation and the admin tabs. */
export const ADMIN_SECTIONS = [
  { to: "/admin/rooms", label: "房间", icon: <DoorOpen size={ICON_SIZE.nav} aria-hidden /> },
  { to: "/admin/people", label: "名单", icon: <Users size={ICON_SIZE.nav} aria-hidden /> },
  { to: "/admin/bookings", label: "预约", icon: <ListChecks size={ICON_SIZE.nav} aria-hidden /> },
  { to: "/admin/announcements", label: "公告", icon: <Megaphone size={ICON_SIZE.nav} aria-hidden /> },
  { to: "/admin/stats", label: "统计", icon: <ChartColumn size={ICON_SIZE.nav} aria-hidden /> },
] as const;

const SIDEBAR_WIDTH = 248;

const styles = stylex.create({
  page: {
    backgroundColor: colors.canvas,
    color: colors.text,
    display: "flex",
    flexDirection: { default: "column", [media.wide]: "row" },
    fontFamily: fonts.sans,
    minHeight: "100dvh",
  },
  bar: {
    backdropFilter: "saturate(1.4) blur(12px)",
    backgroundColor: `color-mix(in srgb, ${colors.canvas} 85%, transparent)`,
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: { default: "block", [media.wide]: "none" },
    paddingTop: "env(safe-area-inset-top)",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },
  barInner: {
    alignItems: "center",
    display: "flex",
    gap: space.xs,
    height: 56,
    marginInline: "auto",
    maxWidth: 1040,
    paddingInline: { default: space.sm, [media.narrow]: space.pagePaddingNarrow },
  },
  brand: {
    alignItems: "center",
    borderRadius: radii.medium,
    color: colors.text,
    display: "flex",
    gap: space.sm,
    marginInlineEnd: "auto",
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.sm,
    textDecoration: "none",
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    color: colors.onPrimary,
    display: "inline-flex",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  navItem: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceHover,
      '[data-status="active"]': colors.primarySoft,
    },
    borderRadius: radii.medium,
    borderWidth: 0,
    color: { default: colors.textMuted, '[data-status="active"]': colors.primaryText },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fonts.sans,
    gap: space.sm,
    justifyContent: "center",
    minHeight: sizes.control,
    minWidth: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.md,
    textDecoration: "none",
  },
  navLabel: { display: { default: "none", [media.narrow]: "inline" } },
  sidebarRail: {
    backgroundColor: colors.sidebar,
    borderInlineEndColor: colors.border,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    boxSizing: "border-box",
    display: { default: "none", [media.wide]: "block" },
    flexShrink: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 20,
  },
  sidebar: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    height: "100dvh",
    overflowY: "auto",
    paddingBlock: space.lg,
    paddingInline: space.md,
    position: "sticky",
    top: 0,
  },
  sideGroup: { display: "flex", flexDirection: "column", gap: space.xxs },
  sideHeading: {
    color: colors.textMuted,
    paddingBottom: space.xs,
    paddingInline: space.md,
  },
  sideItem: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.sidebarHover,
      '[data-status="active"]': colors.sidebarActive,
    },
    borderRadius: radii.medium,
    color: { default: colors.textMuted, ":hover": colors.text, '[data-status="active"]': colors.text },
    display: "flex",
    gap: space.sm,
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    overflow: "hidden",
    paddingInline: space.md,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  sideItemText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  sideFooter: { display: "flex", flexDirection: "column", gap: space.xs, marginTop: "auto" },
  themeRow: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingInline: space.xs,
  },
  themeLabel: { color: colors.textMuted, paddingInline: space.sm },
  main: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: space.sectionGap,
    marginInline: "auto",
    minWidth: 0,
    maxWidth: { default: 1040, [media.wide]: 1480 },
    paddingBottom: `max(${space.xxl}, env(safe-area-inset-bottom))`,
    paddingInline: {
      default: space.pagePadding,
      [media.narrow]: space.pagePaddingNarrow,
      [media.wide]: space.pagePaddingWide,
    },
    paddingTop: {
      default: space.pagePadding,
      [media.narrow]: space.pagePaddingNarrow,
      [media.wide]: space.pagePaddingWide,
    },
    width: "100%",
  },
  menuPositioner: { outline: "none", zIndex: 80 },
  menuPopup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 12px 32px ${colors.shadowStrong}`,
    color: colors.text,
    fontFamily: fonts.sans,
    minWidth: 168,
    outline: "none",
    padding: space.xs,
  },
  menuItem: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    borderRadius: radii.small,
    cursor: "pointer",
    display: "flex",
    gap: space.sm,
    minHeight: sizes.control,
    outline: "none",
    paddingInline: space.md,
  },
  menuCheck: { color: colors.primary, display: "inline-flex", marginInlineStart: "auto" },
});

const THEME_OPTIONS = [
  { value: "system", label: "跟随系统", icon: <Monitor aria-hidden /> },
  { value: "light", label: "浅色", icon: <Sun aria-hidden /> },
  { value: "dark", label: "深色", icon: <Moon aria-hidden /> },
] as const;

/**
 * Theme selection menu.
 *
 * @returns The menu.
 */
function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const current = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0];

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={`主题：${current.label}`} {...stylex.props(text.label, styles.navItem)}>
        {resolvedTheme === "dark" ? (
          <Moon size={ICON_SIZE.nav} aria-hidden />
        ) : (
          <Sun size={ICON_SIZE.nav} aria-hidden />
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" {...stylex.props(styles.menuPositioner)}>
          <Menu.Popup {...stylex.props(styles.menuPopup)}>
            <Menu.RadioGroup value={current.value} onValueChange={(value: string) => setTheme(value)}>
              {THEME_OPTIONS.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  {...stylex.props(text.body, styles.menuItem)}
                >
                  {option.icon}
                  {option.label}
                  <Menu.RadioItemIndicator {...stylex.props(styles.menuCheck)}>
                    <Check aria-hidden />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * Navigate on tray menu events (desktop app).
 */
function useTrayNavigation(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const host = platform();

    if (!host.hasTray) return undefined;

    const openRoom = (target: "home" | "calendar") => {
      const slug = appStore.state.lastRoomSlug;

      if (slug === undefined) {
        void navigate({ to: "/" });

        return;
      }

      if (target === "calendar") void navigate({ to: "/r/$slug/calendar", params: { slug } });
      else void navigate({ to: "/r/$slug", params: { slug }, search: { quick: true } });
    };

    const stopQuick = host.onHostEvent("tray:quick-use", () => openRoom("home"));
    const stopCalendar = host.onHostEvent("tray:open-calendar", () => openRoom("calendar"));

    return () => {
      stopQuick();
      stopCalendar();
    };
  }, [navigate]);
}

/**
 * Side navigation for wide windows.
 *
 * @returns The sidebar.
 */
function Sidebar() {
  const session = useSession();
  const rooms = useRememberedRooms();
  const isAdmin = session?.person.isAdmin === true;

  return (
    <div {...stylex.props(styles.sidebarRail)}>
      <nav aria-label="侧边导航" {...stylex.props(styles.sidebar)}>
        <Link to="/" {...stylex.props(text.title, styles.brand)}>
          <span aria-hidden {...stylex.props(text.label, styles.logo)}>
            R
          </span>
          会议室
        </Link>
        <div {...stylex.props(styles.sideGroup)}>
          <span {...stylex.props(text.meta, styles.sideHeading)}>会议室</span>
          {rooms.map((room) => (
            <Link
              key={room.slug}
              to="/r/$slug"
              params={{ slug: room.slug }}
              {...stylex.props(text.body, styles.sideItem)}
            >
              <DoorOpen size={ICON_SIZE.nav} aria-hidden />
              <span {...stylex.props(styles.sideItemText)}>{room.name ?? room.slug}</span>
            </Link>
          ))}
          <Link
            to="/"
            search={{ add: true }}
            activeOptions={{ includeSearch: true }}
            {...stylex.props(text.body, styles.sideItem)}
          >
            <Plus size={ICON_SIZE.nav} aria-hidden />
            添加会议室
          </Link>
        </div>
        {isAdmin ? (
          <div {...stylex.props(styles.sideGroup)}>
            <span {...stylex.props(text.meta, styles.sideHeading)}>管理</span>
            {ADMIN_SECTIONS.map((section) => (
              <Link key={section.to} to={section.to} {...stylex.props(text.body, styles.sideItem)}>
                {section.icon}
                {section.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div {...stylex.props(styles.sideFooter)}>
          {platform().isApp ? (
            <Link to="/settings" {...stylex.props(text.body, styles.sideItem)}>
              <Settings size={ICON_SIZE.nav} aria-hidden />
              设置
            </Link>
          ) : null}
          {session === undefined ? (
            <div {...stylex.props(styles.themeRow)}>
              <span {...stylex.props(text.meta, styles.themeLabel)}>主题</span>
              <ThemeMenu />
            </div>
          ) : null}
          <AccountMenu isWide />
        </div>
      </nav>
    </div>
  );
}

/**
 * Page frame with the top bar (mobile, narrow) or side navigation (wide).
 *
 * @param props - Shell props.
 * @param props.children - Page content.
 * @returns The shell.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const isApp = platform().isApp;

  useTrayNavigation();

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.bar)}>
        <nav aria-label="主导航" {...stylex.props(styles.barInner)}>
          <Link to="/" {...stylex.props(text.title, styles.brand)}>
            <span aria-hidden {...stylex.props(text.label, styles.logo)}>
              R
            </span>
            会议室
          </Link>
          {isApp ? (
            <Link to="/settings" aria-label="设置" {...stylex.props(text.label, styles.navItem)}>
              <Settings size={ICON_SIZE.nav} aria-hidden />
              <span {...stylex.props(styles.navLabel)}>设置</span>
            </Link>
          ) : null}
          {session === undefined ? <ThemeMenu /> : null}
          <AccountMenu />
        </nav>
      </header>
      <Sidebar />
      <main {...stylex.props(styles.main)}>{children}</main>
      <IdentitySheet />
      <DialogHost />
      <ThemeResync />
    </div>
  );
}
