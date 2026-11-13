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
import { colors, fonts, media, radii, sizes, space } from "../styles/tokens.stylex";
import { Sheet } from "../ui/sheet";
import { notify } from "../ui/toast";
import { text } from "../ui/typography";
import { afterOverlayClosed, useOverlayHistory } from "./overlay-history";

const ROLE_LABELS = { teacher: "老师", student: "学生", other: "其他" } as const;

const THEME_OPTIONS = [
  { value: "system", label: "系统", icon: <Monitor aria-hidden /> },
  { value: "light", label: "浅色", icon: <Sun aria-hidden /> },
  { value: "dark", label: "深色", icon: <Moon aria-hidden /> },
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
    gap: space.sm,
    minHeight: sizes.control,
    minWidth: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.xs,
  },
  triggerWide: {
    borderRadius: radii.medium,
    paddingInline: space.sm,
    width: "100%",
  },
  triggerName: {
    display: { default: "none", [media.narrow]: "inline" },
    maxWidth: 120,
    overflow: "hidden",
    paddingInlineEnd: space.sm,
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
    gap: space.sm,
    justifyContent: "center",
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.lg,
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
    maxWidth: `calc(100vw - ${space.lg})`,
    outline: "none",
    padding: space.xs,
    width: 248,
  },
  who: { display: "flex", flexDirection: "column", paddingBlock: space.sm, paddingInline: space.md },
  whoName: { overflowWrap: "anywhere" },
  whoRole: { color: colors.textMuted },
  item: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    borderRadius: radii.small,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    gap: space.sm,
    minHeight: sizes.control,
    outline: "none",
    paddingInline: space.md,
  },
  itemIcon: { color: colors.textMuted, display: "inline-flex" },
  separator: { backgroundColor: colors.border, height: 1, marginBlock: space.xs },
  themeLabel: {
    color: colors.textMuted,
    paddingInline: space.md,
    paddingTop: space.xs,
  },
  themeRow: {
    display: "grid",
    gap: space.xs,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    padding: space.xs,
  },
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
    gap: space.xxs,
    justifyContent: "center",
    minHeight: sizes.controlLarge,
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
        {...stylex.props(text.label, styles.login, isWide && styles.loginWide)}
      >
        <LogIn aria-hidden />
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
          {...stylex.props(text.body, styles.trigger, isWide && styles.triggerWide)}
        >
          <span aria-hidden {...stylex.props(text.label, styles.avatar)}>
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
                <span {...stylex.props(text.title, styles.whoName)}>{person.name}</span>
                <span {...stylex.props(text.meta, styles.whoRole)}>
                  {ROLE_LABELS[person.role]}
                  {person.isAdmin ? " · 管理员" : ""}
                </span>
              </div>
              <div {...stylex.props(styles.separator)} />
              <Menu.Item
                onClick={() => afterOverlayClosed(() => void navigate({ to: "/me" }))}
                {...stylex.props(text.body, styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <CalendarCheck aria-hidden />
                </span>
                我的预约
              </Menu.Item>
              <Menu.Item
                onClick={() => afterOverlayClosed(() => setIsChangingPasscode(true))}
                {...stylex.props(text.body, styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <KeyRound aria-hidden />
                </span>
                修改口令
              </Menu.Item>
              <Menu.Item
                onClick={() => afterOverlayClosed(() => void switchIdentity())}
                {...stylex.props(text.body, styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <UserRoundCog aria-hidden />
                </span>
                切换身份
              </Menu.Item>
              {person.isAdmin ? (
                <Menu.Item
                  onClick={() => afterOverlayClosed(() => void navigate({ to: "/admin" }))}
                  {...stylex.props(text.body, styles.item)}
                >
                  <span {...stylex.props(styles.itemIcon)}>
                    <ShieldCheck aria-hidden />
                  </span>
                  管理后台
                </Menu.Item>
              ) : null}
              <div {...stylex.props(styles.separator)} />
              <Menu.Group>
                <Menu.GroupLabel {...stylex.props(text.meta, styles.themeLabel)}>主题</Menu.GroupLabel>
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
                      {...stylex.props(text.meta, styles.themeItem)}
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
                {...stylex.props(text.body, styles.item)}
              >
                <span {...stylex.props(styles.itemIcon)}>
                  <LogOut aria-hidden />
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
