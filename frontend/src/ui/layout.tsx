/**
 * Layout and display primitives: cards, sections, badges, notices, skeletons and empty states.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { colors, fonts, media, radii } from "../styles/tokens.stylex";

const styles = stylex.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
    padding: { default: 16, [media.tablet]: 20 },
  },
  section: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
  sectionHeader: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 32,
  },
  sectionTitle: { color: colors.text, fontSize: fonts.sizeLg, fontWeight: 700 },
  sectionAside: { color: colors.textMuted, fontSize: fonts.sizeSm },
  pageHeader: { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 4 },
  pageTitle: {
    color: colors.text,
    fontSize: { default: fonts.sizeXxl, [media.tablet]: 30 },
    fontWeight: 800,
    lineHeight: 1.2,
  },
  pageSubtitle: { color: colors.textMuted, fontSize: fonts.sizeMd, lineHeight: 1.5 },
  badge: {
    alignItems: "center",
    borderRadius: radii.pill,
    display: "inline-flex",
    fontSize: fonts.sizeXs,
    fontWeight: 600,
    gap: 4,
    lineHeight: 1,
    paddingBlock: 4,
    paddingInline: 8,
    whiteSpace: "nowrap",
  },
  neutral: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  free: { backgroundColor: colors.freeSoft, color: colors.free },
  busy: { backgroundColor: colors.busySoft, color: colors.busy },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  info: { backgroundColor: colors.infoSoft, color: colors.info },
  notice: {
    alignItems: "flex-start",
    borderRadius: radii.medium,
    display: "flex",
    fontSize: fonts.sizeSm,
    gap: 10,
    lineHeight: 1.55,
    paddingBlock: 10,
    paddingInline: 12,
  },
  noticeIcon: { display: "inline-flex", flexShrink: 0, marginTop: 1 },
  noticeBody: { display: "flex", flexDirection: "column", flexGrow: 1, gap: 6, minWidth: 0 },
  noticeTitle: { fontWeight: 700 },
  noticeText: { color: colors.text },
  skeleton: {
    animationDirection: "alternate",
    animationDuration: { default: "900ms", [media.reducedMotion]: "0s" },
    animationIterationCount: "infinite",
    animationName: stylex.keyframes({ from: { opacity: 1 }, to: { opacity: 0.45 } }),
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
  },
  size: (height: number, width: string) => ({ height, width }),
  empty: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    flexDirection: "column",
    fontSize: fonts.sizeMd,
    gap: 10,
    lineHeight: 1.6,
    paddingBlock: 28,
    paddingInline: 16,
    textAlign: "center",
  },
  emptyIcon: { color: colors.textSubtle },
  emptyTitle: { color: colors.text, fontSize: fonts.sizeLg, fontWeight: 700 },
  stack: { display: "flex", flexDirection: "column", minWidth: 0 },
  row: { alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0 },
  spread: { justifyContent: "space-between" },
  noWrap: { flexWrap: "nowrap" },
  gapXs: { gap: 4 },
  gapSm: { gap: 8 },
  gapMd: { gap: 12 },
  gapLg: { gap: 16 },
  gapXl: { gap: 24 },
});

/** Tone of badges and notices. */
export type Tone = "neutral" | "free" | "busy" | "warning" | "info";

/** Gap size of stacks and rows. */
export type Gap = "xs" | "sm" | "md" | "lg" | "xl";

const GAP_STYLES = {
  xs: styles.gapXs,
  sm: styles.gapSm,
  md: styles.gapMd,
  lg: styles.gapLg,
  xl: styles.gapXl,
} as const;

/**
 * Surface card.
 *
 * @param props - Card props.
 * @param props.children - Content.
 * @param props.xstyle - Extra styles.
 * @param props.as - Element to render.
 * @param props.ariaLabel - Accessible name for a section-like card.
 * @returns The card.
 */
export function Card({
  children,
  xstyle,
  as: Element = "div",
  ariaLabel,
}: {
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
  as?: "div" | "section" | "article" | "li";
  ariaLabel?: string;
}) {
  return (
    <Element aria-label={ariaLabel} {...stylex.props(styles.card, xstyle)}>
      {children}
    </Element>
  );
}

/**
 * Titled section.
 *
 * @param props - Section props.
 * @param props.title - Heading.
 * @param props.aside - Content on the right of the heading.
 * @param props.children - Content.
 * @param props.xstyle - Extra styles.
 * @returns The section.
 */
export function Section({
  title,
  aside,
  children,
  xstyle,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <section {...stylex.props(styles.section, xstyle)}>
      <div {...stylex.props(styles.sectionHeader)}>
        <h2 {...stylex.props(styles.sectionTitle)}>{title}</h2>
        {aside === undefined ? null : <div {...stylex.props(styles.sectionAside)}>{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Page heading.
 *
 * @param props - Header props.
 * @param props.title - Page title.
 * @param props.subtitle - Line below the title.
 * @returns The header.
 */
export function PageHeader({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <header {...stylex.props(styles.pageHeader)}>
      <h1 {...stylex.props(styles.pageTitle)}>{title}</h1>
      {subtitle === undefined ? null : <p {...stylex.props(styles.pageSubtitle)}>{subtitle}</p>}
    </header>
  );
}

/**
 * Small pill label.
 *
 * @param props - Badge props.
 * @param props.tone - Color tone.
 * @param props.children - Text.
 * @returns The badge.
 */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span {...stylex.props(styles.badge, styles[tone])}>{children}</span>;
}

/**
 * Inline notice with an icon.
 *
 * @param props - Notice props.
 * @param props.tone - Color tone.
 * @param props.title - Bold first line.
 * @param props.children - Body.
 * @param props.isLive - Announce changes to screen readers.
 * @returns The notice.
 */
export function Notice({
  tone = "info",
  title,
  children,
  isLive = false,
}: {
  tone?: Exclude<Tone, "neutral" | "free">;
  title?: ReactNode;
  children?: ReactNode;
  isLive?: boolean;
}) {
  const icon =
    tone === "busy" ? (
      <CircleAlert size={18} aria-hidden />
    ) : tone === "warning" ? (
      <TriangleAlert size={18} aria-hidden />
    ) : (
      <Info size={18} aria-hidden />
    );

  return (
    <div role={isLive ? "status" : undefined} {...stylex.props(styles.notice, styles[tone])}>
      <span {...stylex.props(styles.noticeIcon)}>{icon}</span>
      <div {...stylex.props(styles.noticeBody)}>
        {title === undefined ? null : <span {...stylex.props(styles.noticeTitle)}>{title}</span>}
        {children === undefined ? null : <div {...stylex.props(styles.noticeText)}>{children}</div>}
      </div>
    </div>
  );
}

/**
 * Loading placeholder with a fixed size, so content does not jump when it arrives.
 *
 * @param props - Skeleton props.
 * @param props.height - Height in pixels.
 * @param props.width - CSS width.
 * @returns The placeholder.
 */
export function Skeleton({ height, width = "100%" }: { height: number; width?: string }) {
  return <div aria-hidden {...stylex.props(styles.skeleton, styles.size(height, width))} />;
}

/**
 * Empty or error state.
 *
 * @param props - Empty state props.
 * @param props.icon - Illustration icon.
 * @param props.title - Title.
 * @param props.children - Explanation and actions.
 * @returns The state.
 */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.empty)}>
      {icon === undefined ? null : <span {...stylex.props(styles.emptyIcon)}>{icon}</span>}
      <p {...stylex.props(styles.emptyTitle)}>{title}</p>
      {children}
    </div>
  );
}

/**
 * Vertical flex stack.
 *
 * @param props - Stack props.
 * @param props.gap - Gap size.
 * @param props.children - Content.
 * @param props.xstyle - Extra styles.
 * @returns The stack.
 */
export function Stack({
  gap = "md",
  children,
  xstyle,
}: {
  gap?: Gap;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}) {
  return <div {...stylex.props(styles.stack, GAP_STYLES[gap], xstyle)}>{children}</div>;
}

/**
 * Horizontal wrapping row.
 *
 * @param props - Row props.
 * @param props.gap - Gap size.
 * @param props.isSpread - Push the first and last children to the edges.
 * @param props.isNoWrap - Keep children on one line.
 * @param props.children - Content.
 * @param props.xstyle - Extra styles.
 * @returns The row.
 */
export function Row({
  gap = "sm",
  isSpread = false,
  isNoWrap = false,
  children,
  xstyle,
}: {
  gap?: Gap;
  isSpread?: boolean;
  isNoWrap?: boolean;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <div
      {...stylex.props(
        styles.row,
        GAP_STYLES[gap],
        isSpread && styles.spread,
        isNoWrap && styles.noWrap,
        xstyle,
      )}
    >
      {children}
    </div>
  );
}
