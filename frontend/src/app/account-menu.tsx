/**
 * Account control at the top right (top bar) or the sidebar foot (wide tier): signed in, an
 * avatar button opening a compact menu with who you are, 我的预约, 修改口令, 切换身份, 管理后台
 * (admins), 主题 and 退出; signed out, a single 登录 entry.
 *
 * @module
 */
import { Menu } from "@animate-ui/react/primitives/base-ui/menu";
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  KeyRound,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRoundCog,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { ChangePasscodeForm, logout, requestSession, switchIdentity } from "../features/identity/identity";
import { appStore, useSession } from "../state/app-store";
import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { Sheet } from "../ui/sheet";
import { notify } from "../ui/toast";
import { afterOverlayClosed, useOverlayHistory } from "./overlay-history";

const ROLE_LABELS = { teacher: "老师", student: "学生", other: "其他" } as const;

const THEME_OPTIONS = [
  { value: "system", label: "系统", icon: <Monitor size={16} aria-hidden /> },
  { value: "light", label: "浅色", icon: <Sun size={16} aria-hidden /> },
  { value: "dark", label: "深色", icon: <Moon size={16} aria-hidden /> },
] as const;

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceHover,
      "[data-popup-open]": colors.surfaceHover,
    },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    gap: 8,
    minHeight: 44,
    minWidth: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: { default: 4, [media.narrow]: 6 },
  },
  triggerWide: {
    borderRadius: radii.medium,
    paddingInline: 8,
    width: "100%",
  },
  triggerName: {
    display: { default: "none", [media.narrow]: "inline" },
    maxWidth: 120,
    overflow: "hidden",
    paddingInlineEnd: 6,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triggerNameWide: { display: "inline", flexGrow: 1, maxWidth: "none", textAlign: "start" },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    color: colors.primaryText,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: fonts.sizeMd,
    fontWeight: 700,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  login: {
    alignItems: "center",
    backgroundColor: { default: colors.primary, ":hover": colors.primaryHover },
    borderRadius: radii.pill,
    borderWidth: 0,
    color: colors.onPrimary,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 16,
  },
  loginWide: { borderRadius: radii.medium, width: "100%" },
  positioner: { outline: "none", zIndex: 80 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: `0 12px 32px ${colors.shadowStrong}`,
    color: colors.text,
    fontFamily: fonts.sans,
    maxWidth: "calc(100vw - 16px)",
    outline: "none",
    padding: 6,
    width: 248,
  },
  who: { display: "flex", flexDirection: "column", gap: 2, paddingBlock: 8, paddingInline: 10 },
  whoName: { fontSize: fonts.sizeLg, fontWeight: 700, overflowWrap: "anywhere" },
  whoRole: { color: colors.textMuted, fontSize: fonts.sizeSm },
  item: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    borderRadius: radii.small,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontSize: fonts.sizeMd,
    gap: 10,
    minHeight: 44,
    outline: "none",
    paddingInline: 10,
  },
  itemIcon: { color: colors.textMuted, display: "inline-flex" },
  separator: { backgroundColor: colors.border, height: 1, marginBlock: 4 },
  themeLabel: {
    color: colors.textMuted,
    fontSize: fonts.sizeXs,
    fontWeight: 600,
    paddingInline: 10,
    paddingTop: 4,
  },
  themeRow: { display: "grid", gap: 4, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: 4 },
  themeItem: {
    alignItems: "center",
    backgroundColor: {
      default: colors.surfaceMuted,
      "[data-highlighted]": colors.surfaceHover,
      "[data-checked]": colors.primarySoft,
    },
    borderRadius: radii.small,
    color: { default: colors.text, "[data-checked]": colors.primaryText },
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    fontSize: fonts.sizeXs,
    fontWeight: 600,
    gap: 2,
    justifyContent: "center",
    minHeight: 48,
    outline: { default: "none", "[data-highlighted]": `2px solid ${colors.focusRing}` },
  },
});

/** Pages that only make sense with a session. */
const SESSION_PAGES = ["/me", "/admin"];

/**
 * The account control.
 *
 * @param props - Control props.
 * @param props.isWide - Full-width row for the sidebar foot.
 * @returns The control.
 */
export function AccountMenu({ isWide = false }: { isWide?: boolean }) {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isChangingPasscode, setIsChangingPasscode] = useState(false);

  useOverlayHistory(isOpen, () => setIsOpen(false));

  if (session === undefined) {
    return (
      <button
        type="button"
        onClick={() => void requestSession()}
        {...stylex.props(styles.login, isWide && styles.loginWide)}
      >
        <LogIn size={18} aria-hidden />
        登录
      </button>
    );
  }

  const { person } = session;

  /** Sign out, then leave pages that need a session for the room overview (or the start page). */
  async function signOut(): Promise<void> {
    await logout();
    notify("info", "已退出");

    if (!SESSION_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) return;

    const slug = appStore.state.lastRoomSlug;

    if (slug !== undefined && appStore.state.rooms[slug] !== undefined) {
      void navigate({ to: "/r/$slug", params: { slug } });
    } else {
      void navigate({ to: "/" });
    }
  }

  return (
    <>
      <Menu.Root open={isOpen} onOpenChange={(open: boolean) => setIsOpen(open)}>
        <Menu.Trigger
          aria-label={`账户：${person.name}`}
          {...stylex.props(styles.trigger, isWide && styles.triggerWide)}
        >
          <span aria-hidden {...stylex.props(styles.avatar)}>
            {person.name.slice(0, 1)}
          </span>
          <span aria-hidden {...stylex.props(styles.triggerName, isWide && styles.triggerNameWide)}>
            {person.name}
          </span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            sideOffset={6}
            align={isWide ? "start" : "end"}
            side={isWide ? "top" : "bottom"}
            {...stylex.props(styles.positioner)}
          >
            <Menu.Popup {...stylex.props(styles.popup)}>
              <div {...stylex.props(styles.who)}>
                <span {...stylex.props(styles.whoName)}>{person.name}</span>
                <span {...stylex.props(styles.whoRole)}>
                  {ROLE_LABELS[person.role]}
                  {person.isAdmin ? " · 管理员" : ""}
                </span>
              </div>
              <div {...stylex.props(styles.separator)} />
              <Menu.Item
                onClick={() => afterOverlayClosed(() => void navigate({ to: "/me" }))}
                {...stylex.props(styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <CalendarCheck size={18} aria-hidden />
                </span>
                我的预约
              </Menu.Item>
              <Menu.Item
                onClick={() => afterOverlayClosed(() => setIsChangingPasscode(true))}
                {...stylex.props(styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <KeyRound size={18} aria-hidden />
                </span>
                修改口令
              </Menu.Item>
              <Menu.Item
                onClick={() => afterOverlayClosed(() => void switchIdentity())}
                {...stylex.props(styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <UserRoundCog size={18} aria-hidden />
                </span>
                切换身份
              </Menu.Item>
              {person.isAdmin ? (
                <Menu.Item
                  onClick={() => afterOverlayClosed(() => void navigate({ to: "/admin" }))}
                  {...stylex.props(styles.item)}
                >
                  <span {...stylex.props(styles.itemIcon)}>
                    <ShieldCheck size={18} aria-hidden />
                  </span>
                  管理后台
                </Menu.Item>
              ) : null}
              <div {...stylex.props(styles.separator)} />
              <Menu.Group>
                <Menu.GroupLabel {...stylex.props(styles.themeLabel)}>主题</Menu.GroupLabel>
                <Menu.RadioGroup
                  value={theme ?? "system"}
                  onValueChange={(value: string) => setTheme(value)}
                  {...stylex.props(styles.themeRow)}
                >
                  {THEME_OPTIONS.map((option) => (
                    <Menu.RadioItem
                      key={option.value}
                      value={option.value}
                      closeOnClick={false}
                      aria-label={`主题：${option.label === "系统" ? "跟随系统" : option.label}`}
                      {...stylex.props(styles.themeItem)}
                    >
                      {option.icon}
                      {option.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Group>
              <div {...stylex.props(styles.separator)} />
              <Menu.Item
                onClick={() => afterOverlayClosed(() => void signOut())}
                {...stylex.props(styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <LogOut size={18} aria-hidden />
                </span>
                退出
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <Sheet isOpen={isChangingPasscode} onOpenChange={setIsChangingPasscode} title="修改口令">
        {isChangingPasscode ? <ChangePasscodeForm onDone={() => setIsChangingPasscode(false)} /> : null}
      </Sheet>
    </>
  );
}
