/**
 * Settings route (apps): server URL and, on desktop, start at login.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Server } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { queryClient, setServerBaseUrl } from "../api/client";
import { platform } from "../platform/platform";
import { colors, fonts } from "../styles/tokens.stylex";
import { Button } from "../ui/button";
import { SwitchRow } from "../ui/controls";
import { TextField } from "../ui/field";
import { Card, EmptyState, PageHeader, Section, Stack } from "../ui/layout";
import { notify } from "../ui/toast";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

const serverUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .refine((value) => /^https?:\/\/[^\s/]+/.test(value), "请输入以 http:// 或 https:// 开头的地址"),
});

const styles = stylex.create({
  version: { color: colors.textSubtle, fontSize: fonts.sizeSm },
});

/**
 * Settings page.
 *
 * @returns The page.
 */
function SettingsPage() {
  const host = platform();

  if (!host.isApp) {
    return (
      <EmptyState icon={<Server size={36} aria-hidden />} title="网页版无需设置">
        <p>服务器地址和开机自启只在电脑版和安卓版中可用。</p>
      </EmptyState>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader title="设置" />
      <ServerUrlForm initialUrl={host.serverUrl} />
      {host.hasAutostart ? <AutostartCard /> : null}
      <p {...stylex.props(styles.version)}>
        Roomark {host.kind === "desktop" ? "电脑版" : "安卓版"} {host.version}
      </p>
    </Stack>
  );
}

/**
 * Server URL form.
 *
 * @param props - Form props.
 * @param props.initialUrl - Current URL.
 * @returns The form.
 */
function ServerUrlForm({ initialUrl }: { initialUrl: string }) {
  const [saved, setSaved] = useState(initialUrl);

  const form = useForm({
    defaultValues: { url: initialUrl },
    validators: { onSubmit: serverUrlSchema },
    onSubmit: async ({ value }) => {
      const url = value.url.trim().replace(/\/+$/, "");

      try {
        await platform().setServerUrl(url);
        setServerBaseUrl(url);
        setSaved(url);
        await queryClient.resetQueries();
        notify("success", "已保存服务器地址");
      } catch {
        notify("error", "保存失败", "请稍后重试");
      }
    },
  });

  return (
    <Card as="section" ariaLabel="服务器">
      <Section title="服务器">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Stack gap="md">
            <form.Field name="url">
              {(field) => (
                <TextField
                  label="服务器地址"
                  type="url"
                  inputMode="url"
                  placeholder="https://rooms.example.com"
                  value={field.state.value}
                  onValueChange={(next) => field.handleChange(next)}
                  error={field.state.meta.errors[0]?.message}
                  description={saved === "" ? "尚未设置" : `当前：${saved}`}
                />
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  保存
                </Button>
              )}
            </form.Subscribe>
          </Stack>
        </form>
      </Section>
    </Card>
  );
}

/**
 * Start-at-login switch (desktop).
 *
 * @returns The card.
 */
function AutostartCard() {
  const enabled = useQuery({ queryKey: ["autostart"], queryFn: () => platform().autostartEnabled() });

  return (
    <Card>
      <SwitchRow
        label="开机自启"
        hint="登录电脑后自动在托盘中运行，随时查看会议室状态"
        isChecked={enabled.data === true}
        isDisabled={enabled.data === undefined}
        onCheckedChange={(isEnabled) => {
          void platform()
            .setAutostart(isEnabled)
            .then(() => enabled.refetch())
            .catch(() => notify("error", "设置失败"));
        }}
      />
    </Card>
  );
}
