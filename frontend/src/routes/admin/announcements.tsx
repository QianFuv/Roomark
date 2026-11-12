/**
 * Admin announcements: create, edit, delete; active ones show as banners on room pages.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { api, errorMessage, fetchClient, type Announcement } from "../../api/client";
import {
  formatClock,
  formatMonthDay,
  minutesToClock,
  minutesOfDay,
  nowZoned,
  parseZoned,
  todayDate,
} from "../../lib/time";
import { colors, fonts } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { ClockPicker } from "../../ui/clock-picker";
import { SwitchRow } from "../../ui/controls";
import { DatePicker } from "../../ui/date-picker";
import { confirmAction } from "../../ui/dialogs";
import { SelectField, TextAreaField, TextField } from "../../ui/field";
import { Badge, Card, EmptyState, Notice, PageHeader, Row, Skeleton, Stack } from "../../ui/layout";
import { Sheet } from "../../ui/sheet";
import { notify } from "../../ui/toast";

export const Route = createFileRoute("/admin/announcements")({ component: AdminAnnouncementsPage });

const announcementSchema = z
  .object({
    roomSlug: z.string(),
    title: z.string().trim().min(1, "请填写标题").max(60, "最多 60 个字"),
    body: z.string().max(1000, "最多 1000 个字"),
    startsAt: z.string().min(1, "请选择开始时间"),
    endsAt: z.string().min(1, "请选择结束时间"),
    pinned: z.boolean(),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: "结束时间需要晚于开始时间",
    path: ["endsAt"],
  });

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: 12 },
  title: { fontSize: fonts.sizeLg, fontWeight: 700 },
  body: { color: colors.textMuted, fontSize: fonts.sizeMd, lineHeight: 1.6, whiteSpace: "pre-wrap" },
  meta: { color: colors.textSubtle, fontSize: fonts.sizeSm, fontVariantNumeric: "tabular-nums" },
  pair: { display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  error: { color: colors.busy, fontSize: fonts.sizeXs, lineHeight: 1.5 },
});

/**
 * Convert an RFC 3339 timestamp to a `datetime-local` value.
 *
 * @param value - Timestamp.
 * @returns `YYYY-MM-DDTHH:MM`.
 */
function toLocalInput(value: string): string {
  const zoned = parseZoned(value);

  return `${zoned.toPlainDate().toString()}T${minutesToClock(minutesOfDay(zoned))}`;
}

/**
 * Convert a `datetime-local` value to RFC 3339 in Asia/Shanghai.
 *
 * @param value - `YYYY-MM-DDTHH:MM`.
 * @returns Timestamp.
 */
function fromLocalInput(value: string): string {
  return `${value}:00+08:00`;
}

/**
 * Admin announcements page.
 *
 * @returns The page.
 */
function AdminAnnouncementsPage() {
  const announcements = api.useQuery("get", "/api/admin/announcements");
  const rooms = api.useQuery("get", "/api/admin/rooms");
  const [editing, setEditing] = useState<Announcement | "new">();
  const roomNames = new Map((rooms.data ?? []).map((room) => [room.slug, room.name]));
  const now = nowZoned().epochMilliseconds;

  /**
   * Delete after confirmation.
   *
   * @param item - The announcement.
   */
  async function remove(item: Announcement): Promise<void> {
    if (!(await confirmAction(`删除公告「${item.title}」？`, "删除"))) return;

    const result = await fetchClient.DELETE("/api/admin/announcements/{id}", {
      params: { path: { id: item.id } },
    });

    await announcements.refetch();

    if (result.data === undefined) notify("error", "删除失败", errorMessage(result.error));
    else notify("success", "已删除公告");
  }

  const items = [...(announcements.data ?? [])].sort((left, right) =>
    right.startsAt.localeCompare(left.startsAt),
  );

  return (
    <Stack gap="lg">
      <Row gap="md" isSpread>
        <PageHeader title="公告" subtitle="生效期间显示在会议室页面顶部。" />
        <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setEditing("new")}>
          发布公告
        </Button>
      </Row>
      {announcements.data === undefined ? (
        announcements.isError ? (
          <Notice tone="busy">{errorMessage(announcements.error)}</Notice>
        ) : (
          <Skeleton height={160} />
        )
      ) : items.length === 0 ? (
        <EmptyState icon={<Megaphone size={32} aria-hidden />} title="还没有公告" />
      ) : (
        <ul {...stylex.props(styles.list)}>
          {items.map((item) => {
            const starts = parseZoned(item.startsAt);
            const ends = parseZoned(item.endsAt);

            const state =
              now < starts.epochMilliseconds ? "未开始" : now >= ends.epochMilliseconds ? "已结束" : "生效中";

            return (
              <Card key={item.id} as="li">
                <Row gap="sm">
                  {item.pinned ? <Pin size={16} aria-label="置顶" /> : null}
                  <span {...stylex.props(styles.title)}>{item.title}</span>
                  <Badge tone={state === "生效中" ? "free" : "neutral"}>{state}</Badge>
                  <Badge>
                    {item.roomSlug === undefined || item.roomSlug === ""
                      ? "全部房间"
                      : (roomNames.get(item.roomSlug) ?? item.roomSlug)}
                  </Badge>
                </Row>
                {item.body === "" ? null : <p {...stylex.props(styles.body)}>{item.body}</p>}
                <span {...stylex.props(styles.meta)}>
                  {formatMonthDay(starts.toPlainDate())} {formatClock(starts)} –{" "}
                  {formatMonthDay(ends.toPlainDate())} {formatClock(ends)}
                </span>
                <Row gap="sm">
                  <Button size="sm" icon={<Pencil size={16} aria-hidden />} onClick={() => setEditing(item)}>
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={16} aria-hidden />}
                    onClick={() => void remove(item)}
                  >
                    删除
                  </Button>
                </Row>
              </Card>
            );
          })}
        </ul>
      )}
      <Sheet
        isOpen={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={editing === "new" ? "发布公告" : "编辑公告"}
      >
        {editing === undefined ? null : (
          <AnnouncementForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? undefined : editing}
            roomOptions={[
              { value: "", label: "全部房间" },
              ...(rooms.data ?? []).map((room) => ({ value: room.slug, label: room.name })),
            ]}
            onDone={() => {
              setEditing(undefined);
              void announcements.refetch();
            }}
          />
        )}
      </Sheet>
    </Stack>
  );
}

/**
 * Create / edit an announcement.
 *
 * @param props - Form props.
 * @param props.item - Announcement to edit, or `undefined`.
 * @param props.roomOptions - Room choices.
 * @param props.onDone - Called after saving.
 * @returns The form.
 */
function AnnouncementForm({
  item,
  roomOptions,
  onDone,
}: {
  item: Announcement | undefined;
  roomOptions: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const now = nowZoned();

  const form = useForm({
    defaultValues: {
      roomSlug: item?.roomSlug ?? "",
      title: item?.title ?? "",
      body: item?.body ?? "",
      startsAt:
        item === undefined
          ? toLocalInput(now.toString({ timeZoneName: "never" }))
          : toLocalInput(item.startsAt),
      endsAt:
        item === undefined
          ? toLocalInput(now.add({ days: 7 }).toString({ timeZoneName: "never" }))
          : toLocalInput(item.endsAt),
      pinned: item?.pinned ?? false,
    },
    validators: { onSubmit: announcementSchema },
    onSubmit: async ({ value }) => {
      setError(undefined);

      const body = {
        roomSlug: value.roomSlug === "" ? undefined : value.roomSlug,
        title: value.title.trim(),
        body: value.body.trim(),
        startsAt: fromLocalInput(value.startsAt),
        endsAt: fromLocalInput(value.endsAt),
        pinned: value.pinned,
      };

      const result =
        item === undefined
          ? await fetchClient.POST("/api/admin/announcements", { body })
          : await fetchClient.PATCH("/api/admin/announcements/{id}", {
              params: { path: { id: item.id } },
              body,
            });

      if (result.data === undefined) {
        setError(errorMessage(result.error));

        return;
      }

      notify("success", item === undefined ? "已发布公告" : "已保存");
      onDone();
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Stack gap="lg">
        <form.Field name="roomSlug">
          {(field) => (
            <SelectField
              label="显示在"
              value={field.state.value}
              options={roomOptions}
              onValueChange={(next) => field.handleChange(next)}
            />
          )}
        </form.Field>
        <form.Field name="title">
          {(field) => (
            <TextField
              label="标题"
              value={field.state.value}
              onValueChange={(next) => field.handleChange(next)}
              error={field.state.meta.errors[0]?.message}
              placeholder="例如：周五下午消杀，暂停使用"
            />
          )}
        </form.Field>
        <form.Field name="body">
          {(field) => (
            <TextAreaField
              label="内容（可选）"
              value={field.state.value}
              onValueChange={(next) => field.handleChange(next)}
              rows={4}
            />
          )}
        </form.Field>
        <form.Field name="startsAt">
          {(field) => (
            <DateTimeField
              label="开始"
              value={field.state.value}
              onValueChange={(next) => field.handleChange(next)}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>
        <form.Field name="endsAt">
          {(field) => (
            <DateTimeField
              label="结束"
              value={field.state.value}
              onValueChange={(next) => field.handleChange(next)}
              error={field.state.meta.errors[0]?.message}
            />
          )}
        </form.Field>
        <form.Field name="pinned">
          {(field) => (
            <SwitchRow
              label="置顶"
              hint="置顶公告排在最前面"
              isChecked={field.state.value}
              onCheckedChange={(next) => field.handleChange(next)}
            />
          )}
        </form.Field>
        {error === undefined ? null : <Notice tone="busy">{error}</Notice>}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" variant="primary" size="lg" isFullWidth isLoading={isSubmitting}>
              {item === undefined ? "发布" : "保存"}
            </Button>
          )}
        </form.Subscribe>
      </Stack>
    </form>
  );
}

/**
 * Date and time of an announcement bound: a date field and a clock field side by side.
 *
 * @param props - Field props.
 * @param props.label - `开始` or `结束`.
 * @param props.value - `YYYY-MM-DDTHH:MM`, or empty.
 * @param props.onValueChange - Called with the combined value.
 * @param props.error - Validation message.
 * @returns The field pair.
 */
function DateTimeField({
  label,
  value,
  onValueChange,
  error,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error: string | undefined;
}) {
  const today = todayDate();
  const [date = "", clock = ""] = value.split("T");

  return (
    <Stack gap="xs">
      <div {...stylex.props(styles.pair)}>
        <DatePicker
          label={`${label}日期`}
          value={date}
          min={today.subtract({ years: 1 })}
          max={today.add({ years: 1 })}
          today={today}
          hasShortcuts={false}
          isPopoverOnly
          onValueChange={(next) => onValueChange(`${next}T${clock === "" ? "08:00" : clock}`)}
        />
        <ClockPicker
          label={`${label}时间`}
          value={clock}
          onValueChange={(next) => onValueChange(`${date === "" ? today.toString() : date}T${next}`)}
        />
      </div>
      {error === undefined ? null : (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
    </Stack>
  );
}
