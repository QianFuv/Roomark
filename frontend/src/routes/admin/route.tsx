/**
 * Admin layout: admin login gate and section navigation.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { ADMIN_SECTIONS } from "../../app/shell";
import { ManualLogin, switchIdentity } from "../../features/identity/identity";
import { useSession } from "../../state/app-store";
import { colors, media, radii, sizes, space } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { ICON_SIZE } from "../../ui/icon";
import { Card, EmptyState, PageHeader, Stack } from "../../ui/layout";
import { notify } from "../../ui/toast";
import { text } from "../../ui/typography";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

const styles = stylex.create({
  nav: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: { default: "flex", [media.wide]: "none" },
    gap: space.xxs,
    padding: space.xxs,
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
    gap: space.sm,
    justifyContent: "center",
    minHeight: sizes.control,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: { default: space.sm, [media.narrow]: space.md },
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
          <PageHeader title="管理员登录" />
          <Card>
            <ManualLogin onSuccess={(next) => notify("success", `你好，${next.person.name}`)} />
          </Card>
        </Stack>
      </div>
    );
  }

  if (!session.person.isAdmin) {
    return (
      <EmptyState icon={<ShieldAlert size={ICON_SIZE.empty} aria-hidden />} title="需要管理员权限">
        <p>{session.person.name}不是管理员</p>
        <Button
          variant="primary"
          onClick={() => {
            void switchIdentity();
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
          <Link key={section.to} to={section.to} {...stylex.props(text.label, styles.tab)}>
            <span {...stylex.props(styles.icon)}>{section.icon}</span>
            {section.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </Stack>
  );
}
