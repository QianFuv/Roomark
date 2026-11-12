/**
 * Visible back control. It goes back in history when there is in-app history and otherwise to
 * the page's logical parent (room overview, or the start page). Root pages without history show
 * none. Phones and narrow windows show it in the top bar; wide windows, where the side navigation
 * covers top-level pages, show it above sub-pages only (QR export, editing a booking).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { appStore } from "../state/app-store";
import { colors, fonts, media, radii } from "../styles/tokens.stylex";

const styles = stylex.create({
  button: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderRadius: radii.medium,
    borderWidth: 0,
    color: colors.text,
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
  },
  wide: {
    alignSelf: "flex-start",
    display: { default: "none", [media.wide]: "inline-flex" },
    marginBottom: -8,
    marginInlineStart: -8,
    paddingInline: 8,
  },
});

/** Where back leads, and whether to show it. */
interface BackTarget {
  isVisible: boolean;
  isSubPage: boolean;
  goBack: () => void;
}

/**
 * The logical parent of a path, used when there is no in-app history to go back to.
 *
 * @param pathname - Current path.
 * @returns Parent path.
 */
function parentOf(pathname: string): string {
  const room = /^\/r\/([^/]+)\/(book|calendar)\/?$/.exec(pathname);

  if (room !== null) return `/r/${room[1] ?? ""}`;

  const qr = /^\/admin\/rooms\/[^/]+\/qr\/?$/.exec(pathname);

  if (qr !== null) return "/admin/rooms";

  const slug = appStore.state.lastRoomSlug;

  if (pathname.startsWith("/r/") || slug === undefined || appStore.state.rooms[slug] === undefined)
    return "/";

  return `/r/${slug}`;
}

/**
 * Back target of the current page.
 *
 * @returns The target.
 */
function useBackTarget(): BackTarget {
  const router = useRouter();
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const canGoBack = router.history.canGoBack();
  const isRoot = pathname === "/" || /^\/r\/[^/]+$/.test(pathname);
  // JUSTIFICATION: validated search of the booking route; only the presence of `edit` matters here.
  const search = location.search as { edit?: unknown };

  const isSubPage =
    /^\/admin\/rooms\/[^/]+\/qr$/.test(pathname) || (pathname.endsWith("/book") && search.edit !== undefined);

  return {
    isVisible: !isRoot || canGoBack,
    isSubPage,
    goBack: () => {
      if (canGoBack) router.history.back();
      else void navigate({ to: parentOf(pathname), replace: true });
    },
  };
}

/**
 * Back arrow for the top bar.
 *
 * @returns The button, or nothing on a root page without history.
 */
export function BackButton() {
  const target = useBackTarget();

  if (!target.isVisible) return null;

  return (
    <button type="button" aria-label="返回" onClick={target.goBack} {...stylex.props(styles.button)}>
      <ArrowLeft size={22} aria-hidden />
    </button>
  );
}

/**
 * Back control above sub-pages in the wide tier.
 *
 * @returns The button, or nothing.
 */
export function WideBack() {
  const target = useBackTarget();

  if (!target.isSubPage) return null;

  return (
    <button type="button" onClick={target.goBack} {...stylex.props(styles.button, styles.wide)}>
      <ArrowLeft size={18} aria-hidden />
      返回
    </button>
  );
}
