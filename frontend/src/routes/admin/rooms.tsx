/**
 * Admin rooms: list with each room's code, create, edit info and rules, archive, export the QR code.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Archive, Copy, Plus, QrCode, Settings2, Users } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { api, errorMessage, fetchClient, refreshBookings, type AdminRoom } from "../../api/client";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { SwitchRow } from "../../ui/controls";
import { ClockPicker } from "../../ui/clock-picker";
import { TextAreaField, TextField } from "../../ui/field";
import { Badge, Card, EmptyState, Notice, PageHeader, Row, Skeleton, Stack } from "../../ui/layout";
import { Sheet } from "../../ui/sheet";
import { notify } from "../../ui/toast";

export const Route = createFileRoute("/admin/rooms")({ component: AdminRoomsPage });

const roomSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,32}$/, "只能用字母、数字、- 和 _，最多 32 个字符"),
    name: z.string().trim().min(1, "请填写名称"),
    location: z.string(),
    capacity: z.string().regex(/^\d{0,4}$/, "请输入数字"),
    description: z.string(),
    openTime: z.string(),
    closeTime: z.string(),
    maxDurationMinutes: z.string().regex(/^\d+$/, "请输入分钟数"),
    maxAdvanceDays: z.string().regex(/^\d+$/, "请输入天数"),
    maxActivePerPerson: z.string().regex(/^\d+$/, "请输入数字，0 表示不限"),
    recurringMaxWeeks: z.string().regex(/^\d+$/, "请输入周数"),
    archived: z.boolean(),
  })
  .refine((value) => value.closeTime > value.openTime, {
    message: "关门要晚于开门",
    path: ["closeTime"],
  });

type RoomValues = z.infer<typeof roomSchema>;

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [media.narrow]: "repeat(2, minmax(0, 1fr))",
      [media.wide]: "repeat(3, minmax(0, 1fr))",
    },
  },
  roomName: { fontSize: fonts.sizeLg, fontWeight: 700 },
  meta: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.6 },
  rules: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    color: colors.textMuted,
    display: "grid",
    fontSize: fonts.sizeSm,
    gap: 4,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    paddingBlock: 10,
    paddingInline: 12,
  },
  rule: { fontVariantNumeric: "tabular-nums" },
  pair: { display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  codeRow: { alignItems: "center", display: "flex", gap: 10, minWidth: 0 },
  codeLabel: { color: colors.textMuted, fontSize: fonts.sizeSm },
  code: {
    color: colors.text,
    flexGrow: 1,
    fontFamily: fonts.mono,
    fontSize: fonts.sizeXl,
    fontWeight: 700,
    letterSpacing: "0.18em",
  },
  formTitle: { color: colors.text, fontSize: fonts.sizeMd, fontWeight: 700 },
});

/**
 * Form values for a room.
 *
 * @param room - Existing room, or `undefined` for a new one.
 * @returns Values.
 */
function roomValues(room: AdminRoom | undefined): RoomValues {
  return {
    slug: room?.slug ?? "",
    name: room?.name ?? "",
    location: room?.location ?? "",
    capacity: String(room?.capacity ?? ""),
    description: room?.description ?? "",
    openTime: room?.rules.openTime ?? "08:00",
    closeTime: room?.rules.closeTime ?? "22:00",
    maxDurationMinutes: String(room?.rules.maxDurationMinutes ?? 240),
    maxAdvanceDays: String(room?.rules.maxAdvanceDays ?? 14),
    maxActivePerPerson: String(room?.rules.maxActivePerPerson ?? 0),
    recurringMaxWeeks: String(room?.rules.recurringMaxWeeks ?? 20),
    archived: room?.archived ?? false,
  };
}

/**
 * Admin rooms page.
 *
 * @returns The page.
 */
function AdminRoomsPage() {
  const rooms = api.useQuery("get", "/api/admin/rooms");
  const [editing, setEditing] = useState<AdminRoom | "new">();

  /**
   * Copy a room code.
   *
   * @param room - The room.
   */
  function copyCode(room: AdminRoom): void {
    void navigator.clipboard
      .writeText(room.code)
      .then(() => notify("success", `已复制房间码 ${room.code}`))
      .catch(() => notify("error", "复制失败", room.code));
  }

  return (
    <Stack gap="lg">
      <Row gap="md" isSpread>
        <PageHeader title="房间" />
        <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setEditing("new")}>
          新建房间
        </Button>
      </Row>
      {rooms.data === undefined ? (
        rooms.isError ? (
          <Notice tone="busy">{errorMessage(rooms.error)}</Notice>
        ) : (
          <div {...stylex.props(styles.grid)}>
            <Skeleton height={220} />
            <Skeleton height={220} />
          </div>
        )
      ) : (rooms.data ?? []).length === 0 ? (
        <EmptyState title="还没有房间" />
      ) : (
        <ul {...stylex.props(styles.grid)}>
          {(rooms.data ?? []).map((room) => (
            <Card key={room.id} as="li">
              <Row gap="sm">
                <span {...stylex.props(styles.roomName)}>{room.name}</span>
                <Badge>{room.slug}</Badge>
                {room.archived ? (
                  <Badge tone="warning">
                    <Archive size={12} aria-hidden />
                    已归档
                  </Badge>
                ) : null}
              </Row>
              <p {...stylex.props(styles.meta)}>
                {room.location === "" ? "未填写位置" : room.location}
                {room.capacity > 0 ? (
                  <>
                    {" · "}
                    <Users size={13} aria-hidden /> {room.capacity} 人
                  </>
                ) : null}
              </p>
              <div {...stylex.props(styles.rules)}>
                <span {...stylex.props(styles.rule)}>
                  开放 {room.rules.openTime}–{room.rules.closeTime}
                </span>
                <span {...stylex.props(styles.rule)}>单次最长 {room.rules.maxDurationMinutes} 分钟</span>
                <span {...stylex.props(styles.rule)}>最多提前 {room.rules.maxAdvanceDays} 天</span>
                <span {...stylex.props(styles.rule)}>
                  每人 {room.rules.maxActivePerPerson === 0 ? "不限" : `${room.rules.maxActivePerPerson} 个`}
                </span>
                <span {...stylex.props(styles.rule)}>重复最长 {room.rules.recurringMaxWeeks} 周</span>
              </div>
              <div {...stylex.props(styles.codeRow)}>
                <span {...stylex.props(styles.codeLabel)}>房间码</span>
                <span {...stylex.props(styles.code)}>{room.code}</span>
                <Button
                  variant="soft"
                  size="sm"
                  aria-label={`复制「${room.name}」的房间码`}
                  icon={<Copy size={16} aria-hidden />}
                  onClick={() => copyCode(room)}
                >
                  复制
                </Button>
              </div>
              <Row gap="sm">
                <Button
                  variant="primary"
                  icon={<QrCode size={18} aria-hidden />}
                  render={<Link to="/admin/rooms/$roomId/qr" params={{ roomId: String(room.id) }} />}
                  nativeButton={false}
                >
                  导出二维码
                </Button>
                <Button icon={<Settings2 size={18} aria-hidden />} onClick={() => setEditing(room)}>
                  编辑
                </Button>
              </Row>
            </Card>
          ))}
        </ul>
      )}
      <Sheet
        isOpen={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={editing === "new" ? "新建房间" : "编辑房间"}
        isWide
      >
        {editing === undefined ? null : (
          <RoomForm
            key={editing === "new" ? "new" : editing.id}
            room={editing === "new" ? undefined : editing}
            onDone={() => {
              setEditing(undefined);
              void rooms.refetch();
              void refreshBookings();
            }}
          />
        )}
      </Sheet>
    </Stack>
  );
}

/**
 * Create / edit form for a room.
 *
 * @param props - Form props.
 * @param props.room - Room to edit, or `undefined` to create.
 * @param props.onDone - Called after saving.
 * @returns The form.
 */
function RoomForm({ room, onDone }: { room: AdminRoom | undefined; onDone: () => void }) {
  const [error, setError] = useState<string>();

  const form = useForm({
    defaultValues: roomValues(room),
    validators: { onSubmit: roomSchema },
    onSubmit: async ({ value }) => {
      setError(undefined);

      const rules = {
        openTime: value.openTime,
        closeTime: value.closeTime,
        maxDurationMinutes: Number(value.maxDurationMinutes),
        maxAdvanceDays: Number(value.maxAdvanceDays),
        maxActivePerPerson: Number(value.maxActivePerPerson),
        recurringMaxWeeks: Number(value.recurringMaxWeeks),
      };

      const info = {
        slug: value.slug.trim(),
        name: value.name.trim(),
        location: value.location.trim(),
        capacity: Number(value.capacity || "0"),
        description: value.description.trim(),
        rules,
      };

      const result =
        room === undefined
          ? await fetchClient.POST("/api/admin/rooms", { body: info })
          : await fetchClient.PATCH("/api/admin/rooms/{id}", {
              params: { path: { id: room.id } },
              body: { ...info, archived: value.archived },
            });

      if (result.data === undefined) {
        setError(errorMessage(result.error));

        return;
      }

      notify("success", room === undefined ? "已新建房间" : "已保存");
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
        <span {...stylex.props(styles.formTitle)}>基本信息</span>
        <div {...stylex.props(styles.pair)}>
          <form.Field name="name">
            {(field) => (
              <TextField
                label="名称"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
                placeholder="如：9070 会议室"
              />
            )}
          </form.Field>
          <form.Field name="slug">
            {(field) => (
              <TextField
                label="短名（用于链接）"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
                description={room === undefined ? undefined : "改了以后要重新打印二维码"}
                placeholder="9070"
              />
            )}
          </form.Field>
          <form.Field name="location">
            {(field) => (
              <TextField
                label="位置"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                placeholder="如：九号楼 7 层"
              />
            )}
          </form.Field>
          <form.Field name="capacity">
            {(field) => (
              <TextField
                label="容纳人数"
                inputMode="numeric"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>
        </div>
        <form.Field name="description">
          {(field) => (
            <TextAreaField
              label="说明"
              value={field.state.value}
              onValueChange={(next) => field.handleChange(next)}
              rows={3}
              placeholder="设备、注意事项等"
            />
          )}
        </form.Field>
        <span {...stylex.props(styles.formTitle)}>预约规则</span>
        <div {...stylex.props(styles.pair)}>
          <form.Field name="openTime">
            {(field) => (
              <ClockPicker
                label="开门时间"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
              />
            )}
          </form.Field>
          <form.Field name="closeTime">
            {(field) => (
              <Stack gap="xs">
                <ClockPicker
                  label="关门时间"
                  value={field.state.value}
                  onValueChange={(next) => field.handleChange(next)}
                />
                {field.state.meta.errors[0] === undefined ? null : (
                  <Notice tone="busy">{field.state.meta.errors[0].message}</Notice>
                )}
              </Stack>
            )}
          </form.Field>
          <form.Field name="maxDurationMinutes">
            {(field) => (
              <TextField
                label="单次最长（分钟）"
                inputMode="numeric"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>
          <form.Field name="maxAdvanceDays">
            {(field) => (
              <TextField
                label="最多提前（天）"
                inputMode="numeric"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>
          <form.Field name="maxActivePerPerson">
            {(field) => (
              <TextField
                label="每人同时有效预约"
                inputMode="numeric"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
                description="0 表示不限；一组重复预约算 1 个"
              />
            )}
          </form.Field>
          <form.Field name="recurringMaxWeeks">
            {(field) => (
              <TextField
                label="重复预约最长（周）"
                inputMode="numeric"
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next)}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>
        </div>
        {room === undefined ? null : (
          <form.Field name="archived">
            {(field) => (
              <SwitchRow
                label="归档"
                hint="不再接受新预约，统计里也不再列出"
                isChecked={field.state.value}
                onCheckedChange={(next) => field.handleChange(next)}
              />
            )}
          </form.Field>
        )}
        {error === undefined ? null : <Notice tone="busy">{error}</Notice>}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" variant="primary" size="lg" isFullWidth isLoading={isSubmitting}>
              {room === undefined ? "新建房间" : "保存"}
            </Button>
          )}
        </form.Subscribe>
      </Stack>
    </form>
  );
}
