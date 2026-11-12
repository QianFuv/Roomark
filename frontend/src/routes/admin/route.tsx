/**
 * Admin layout: admin login gate and section navigation.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { ADMIN_SECTIONS } from "../../app/shell";
import { ManualLogin, logout, requestSession } from "../../features/identity/identity";
import { useSession } from "../../state/app-store";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Card, EmptyState, PageHeader, Stack } from "../../ui/layout";
import { notify } from "../../ui/toast";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const styles = stylex.create({
  nav: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: { default: "flex", [media.wide]: "none" },
    gap: 2,
    padding: 3,
  },
  tab: {
    alignItems: "center",
    backgroundColor: { default: "transparent", '[data-status="active"]': colors.surfaceRaised },
    borderRadius: radii.small,
    boxShadow: { default: "none", '[data-status="active"]': `0 1px 3px ${colors.shadowStrong}` },
    color: { default: colors.textMuted, '[data-status="active"]': colors.primaryText },
    display: "flex",
    flexBasis: 0,
    flexGrow: 1,
    fontSize: { default: fonts.sizeSm, [media.narrow]: fonts.sizeMd },
    fontWeight: 600,
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: { default: 8, [media.narrow]: 12 },
    textDecoration: "none",
  },
  icon: { display: { default: "none", [media.narrow]: "inline-flex" } },
  login: { marginInline: "auto", maxWidth: 440, width: "100%" },
});

/**
 * Admin layout.
 *
 * @returns The layout.
 */
function AdminLayout() {
  const session = useSession();

  if (session === undefined) {
    return (
      <div {...stylex.props(styles.login)}>
        <Stack gap="lg">
          <PageHeader title="管理员登录" subtitle="输入管理员的姓名和个人口令" />
          <Card>
            <ManualLogin onSuccess={(next) => notify("success", `你好，${next.person.name}`)} />
          </Card>
        </Stack>
      </div>
    );
  }

  if (!session.person.isAdmin) {
    return (
      <EmptyState icon={<ShieldAlert size={40} aria-hidden />} title="需要管理员权限">
        <p>当前身份「{session.person.name}」不是管理员。</p>
        <Button
          variant="primary"
          onClick={() => {
            void logout().then(() => requestSession());
          }}
        >
          切换身份
        </Button>
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg">
      <nav aria-label="管理" {...stylex.props(styles.nav)}>
        {ADMIN_SECTIONS.map((section) => (
          <Link key={section.to} to={section.to} {...stylex.props(styles.tab)}>
            <span {...stylex.props(styles.icon)}>{section.icon}</span>
            {section.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </Stack>
  );
}
