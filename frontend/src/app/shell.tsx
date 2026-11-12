/**
 * Application shell: top bar with navigation and theme menu, page container and global hosts.
 *
 * @module
 */
import { Menu } from "@animate-ui/react/primitives/base-ui/menu";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Monitor, Moon, Settings, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

import { IdentitySheet } from "../features/identity/identity";
import { platform } from "../platform/platform";
import { appStore, useSession } from "../state/app-store";
import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { DialogHost } from "../ui/dialogs";

const styles = stylex.create({
  page: {
    backgroundColor: colors.canvas,
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    minHeight: "100dvh",
  },
  bar: {
    backdropFilter: "saturate(1.4) blur(12px)",
    backgroundColor: `color-mix(in srgb, ${colors.canvas} 85%, transparent)`,
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
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
    maxWidth: 1120,
    paddingInline: { default: 8, [media.tablet]: 20 },
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
    borderRadius: 9,
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
    paddingInline: { default: 10, [media.tablet]: 12 },
    textDecoration: "none",
  },
  navLabel: { display: { default: "none", [media.tablet]: "inline" } },
  main: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: 16,
    marginInline: "auto",
    maxWidth: 1120,
    paddingBottom: "max(32px, env(safe-area-inset-bottom))",
    paddingInline: { default: 16, [media.tablet]: 24 },
    paddingTop: { default: 16, [media.tablet]: 24 },
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
 * Page frame with the top bar.
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
      <main {...stylex.props(styles.main)}>{children}</main>
      <IdentitySheet />
      <DialogHost />
    </div>
  );
}
