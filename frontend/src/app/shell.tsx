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
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

import { IdentitySheet } from "../features/identity/identity";
import { platform } from "../platform/platform";
import { appStore, useRememberedRooms, useSession } from "../state/app-store";
import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { DialogHost } from "../ui/dialogs";

/** Admin sections, shared by the side navigation and the admin tabs. */
export const ADMIN_SECTIONS = [
  { to: "/admin/rooms", label: "房间", icon: <DoorOpen size={18} aria-hidden /> },
  { to: "/admin/people", label: "名单", icon: <Users size={18} aria-hidden /> },
  { to: "/admin/bookings", label: "预约", icon: <ListChecks size={18} aria-hidden /> },
  { to: "/admin/announcements", label: "公告", icon: <Megaphone size={18} aria-hidden /> },
  { to: "/admin/stats", label: "统计", icon: <ChartColumn size={18} aria-hidden /> },
] as const;

const SIDEBAR_WIDTH = 248;

const styles = stylex.create({
  page: {
    backgroundColor: colors.canvas,
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    minHeight: "100dvh",
    paddingInlineStart: { default: 0, [media.wide]: SIDEBAR_WIDTH },
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
    gap: 4,
    height: 56,
    marginInline: "auto",
    maxWidth: 1040,
    paddingInline: { default: 8, [media.narrow]: 24 },
  },
  brand: {
    alignItems: "center",
    borderRadius: radii.medium,
    color: colors.text,
    display: "flex",
    fontSize: fonts.sizeLg,
    fontWeight: 800,
    gap: 8,
    letterSpacing: "-0.01em",
    marginInlineEnd: "auto",
    minHeight: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 8,
    textDecoration: "none",
  },
  logo: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    color: colors.onPrimary,
    display: "inline-flex",
    fontSize: 15,
    fontWeight: 900,
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
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: { default: 10, [media.narrow]: 12 },
    textDecoration: "none",
  },
  navLabel: { display: { default: "none", [media.narrow]: "inline" } },
  sidebar: {
    backgroundColor: colors.sidebar,
    borderInlineEndColor: colors.border,
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    display: { default: "none", [media.wide]: "flex" },
    flexDirection: "column",
    gap: 18,
    insetBlock: 0,
    insetInlineStart: 0,
    overflowY: "auto",
    paddingBlock: 16,
    paddingInline: 12,
    position: "fixed",
    width: SIDEBAR_WIDTH,
    zIndex: 20,
  },
  sideGroup: { display: "flex", flexDirection: "column", gap: 2 },
  sideHeading: {
    color: colors.textMuted,
    fontSize: fonts.sizeXs,
    fontWeight: 600,
    letterSpacing: "0.04em",
    paddingBottom: 4,
    paddingInline: 10,
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
    fontSize: fonts.sizeMd,
    fontWeight: { default: 500, '[data-status="active"]': 600 },
    gap: 10,
    minHeight: 38,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    overflow: "hidden",
    paddingInline: 10,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  sideItemText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  sideFooter: { display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" },
  themeRow: { alignItems: "center", display: "flex", justifyContent: "space-between", paddingInline: 4 },
  themeLabel: { color: colors.textMuted, fontSize: fonts.sizeSm, paddingInline: 6 },
  main: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: 16,
    marginInline: "auto",
    maxWidth: { default: 1040, [media.wide]: 1480 },
    paddingBottom: "max(32px, env(safe-area-inset-bottom))",
    paddingInline: { default: 16, [media.narrow]: 24, [media.wide]: 36 },
    paddingTop: { default: 16, [media.narrow]: 24, [media.wide]: 32 },
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
    padding: 4,
  },
  menuItem: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    borderRadius: radii.small,
    cursor: "pointer",
    display: "flex",
    fontSize: fonts.sizeMd,
    gap: 10,
    minHeight: 44,
    outline: "none",
    paddingInline: 10,
  },
  menuCheck: { color: colors.primary, display: "inline-flex", marginInlineStart: "auto" },
});

const THEME_OPTIONS = [
  { value: "system", label: "跟随系统", icon: <Monitor size={18} aria-hidden /> },
  { value: "light", label: "浅色", icon: <Sun size={18} aria-hidden /> },
  { value: "dark", label: "深色", icon: <Moon size={18} aria-hidden /> },
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
      <Menu.Trigger aria-label={`主题：${current.label}`} {...stylex.props(styles.navItem)}>
        {resolvedTheme === "dark" ? <Moon size={20} aria-hidden /> : <Sun size={20} aria-hidden />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" {...stylex.props(styles.menuPositioner)}>
          <Menu.Popup {...stylex.props(styles.menuPopup)}>
            <Menu.RadioGroup value={current.value} onValueChange={(value: string) => setTheme(value)}>
              {THEME_OPTIONS.map((option) => (
                <Menu.RadioItem key={option.value} value={option.value} {...stylex.props(styles.menuItem)}>
                  {option.icon}
                  {option.label}
                  <Menu.RadioItemIndicator {...stylex.props(styles.menuCheck)}>
                    <Check size={16} aria-hidden />
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
    <nav aria-label="侧边导航" {...stylex.props(styles.sidebar)}>
      <Link to="/" {...stylex.props(styles.brand)}>
        <span aria-hidden {...stylex.props(styles.logo)}>
          R
        </span>
        会议室
      </Link>
      {rooms.length === 0 ? null : (
        <div {...stylex.props(styles.sideGroup)}>
          <span {...stylex.props(styles.sideHeading)}>会议室</span>
          {rooms.map((room) => (
            <Link
              key={room.slug}
              to="/r/$slug"
              params={{ slug: room.slug }}
              {...stylex.props(styles.sideItem)}
            >
              <DoorOpen size={18} aria-hidden />
              <span {...stylex.props(styles.sideItemText)}>{room.name ?? room.slug}</span>
            </Link>
          ))}
        </div>
      )}
      <div {...stylex.props(styles.sideGroup)}>
        <span {...stylex.props(styles.sideHeading)}>个人</span>
        <Link to="/me" {...stylex.props(styles.sideItem)}>
          <UserRound size={18} aria-hidden />
          <span {...stylex.props(styles.sideItemText)}>
            {session === undefined ? "我的" : `我的 · ${session.person.name}`}
          </span>
        </Link>
        {platform().isApp ? (
          <Link to="/settings" {...stylex.props(styles.sideItem)}>
            <Settings size={18} aria-hidden />
            设置
          </Link>
        ) : null}
      </div>
      {isAdmin ? (
        <div {...stylex.props(styles.sideGroup)}>
          <span {...stylex.props(styles.sideHeading)}>管理</span>
          {ADMIN_SECTIONS.map((section) => (
            <Link key={section.to} to={section.to} {...stylex.props(styles.sideItem)}>
              {section.icon}
              {section.label}
            </Link>
          ))}
        </div>
      ) : null}
      <div {...stylex.props(styles.sideFooter)}>
        <div {...stylex.props(styles.themeRow)}>
          <span {...stylex.props(styles.themeLabel)}>主题</span>
          <ThemeMenu />
        </div>
      </div>
    </nav>
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
  const isAdmin = session?.person.isAdmin === true;
  const isApp = platform().isApp;

  useTrayNavigation();

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.bar)}>
        <nav aria-label="主导航" {...stylex.props(styles.barInner)}>
          <Link to="/" {...stylex.props(styles.brand)}>
            <span aria-hidden {...stylex.props(styles.logo)}>
              R
            </span>
            会议室
          </Link>
          <Link
            to="/me"
            aria-label={session === undefined ? "我的" : `我的（${session.person.name}）`}
            {...stylex.props(styles.navItem)}
          >
            <UserRound size={20} aria-hidden />
            <span {...stylex.props(styles.navLabel)}>
              {session === undefined ? "我的" : session.person.name}
            </span>
          </Link>
          {isAdmin ? (
            <Link to="/admin" aria-label="管理" {...stylex.props(styles.navItem)}>
              <ShieldCheck size={20} aria-hidden />
              <span {...stylex.props(styles.navLabel)}>管理</span>
            </Link>
          ) : null}
          {isApp ? (
            <Link to="/settings" aria-label="设置" {...stylex.props(styles.navItem)}>
              <Settings size={20} aria-hidden />
              <span {...stylex.props(styles.navLabel)}>设置</span>
            </Link>
          ) : null}
          <ThemeMenu />
        </nav>
      </header>
      <Sidebar />
      <main {...stylex.props(styles.main)}>{children}</main>
      <IdentitySheet />
      <DialogHost />
    </div>
  );
}
