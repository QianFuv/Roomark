/**
 * Admin bookings: filterable table with edit / cancel, plus entries for booking on behalf of
 * someone and for blocking time (both single and recurring, via the booking form).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData } from "@tanstack/react-query";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ban, Pencil, Repeat, Trash2, UserRoundPlus } from "lucide-react";
import { useState } from "react";

import { api, errorMessage, type Booking } from "../../api/client";
import { cancelBooking } from "../../features/booking/booking-actions";
import { isFinished } from "../../lib/schedule";
import { formatBookingWhen, nowZoned, parseZoned, todayDate } from "../../lib/time";
import { colors, fonts, media } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { CORE_FEATURES, DataTable } from "../../ui/data-table";
import { SelectField, TextField } from "../../ui/field";
import { Badge, Notice, PageHeader, Row, Skeleton, Stack } from "../../ui/layout";

export const Route = createFileRoute("/admin/bookings")({ component: AdminBookingsPage });

const columnHelper = createColumnHelper<typeof CORE_FEATURES, Booking>();

const styles = stylex.create({
  filters: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [media.desktop]: "repeat(5, minmax(0, 1fr))",
    },
  },
  title: {
    color: colors.textMuted,
    fontSize: fonts.sizeSm,
    maxWidth: 220,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
});

/**
 * Admin bookings page.
 *
 * @returns The page.
 */
function AdminBookingsPage() {
  const today = todayDate();
  const navigate = useNavigate();
  const rooms = api.useQuery("get", "/api/admin/rooms");
  const people = api.useQuery("get", "/api/admin/people");
  const [room, setRoom] = useState("");
  const [from, setFrom] = useState(today.toString());
  const [to, setTo] = useState(today.add({ days: 14 }).toString());
  const [personId, setPersonId] = useState("");
  const [status, setStatus] = useState<"" | "confirmed" | "cancelled">("confirmed");

  const bookings = api.useQuery(
    "get",
    "/api/admin/bookings",
    {
      params: {
        query: {
          ...(room === "" ? {} : { room }),
          from,
          to,
          ...(personId === "" ? {} : { personId: Number(personId) }),
          ...(status === "" ? {} : { status }),
        },
      },
    },
    { placeholderData: keepPreviousData },
  );

  const roomList = (rooms.data ?? []).filter((item) => !item.archived);
  const roomNames = new Map((rooms.data ?? []).map((item) => [item.slug, item.name]));
  const targetRoom = room === "" ? roomList[0]?.slug : room;
  const now = nowZoned();

  const columns = columnHelper.columns([
    columnHelper.accessor("start", {
      header: "时间",
      cell: (info) => formatBookingWhen(info.row.original.start, info.row.original.end),
    }),
    columnHelper.accessor("roomSlug", {
      header: "房间",
      cell: (info) => roomNames.get(info.getValue()) ?? info.getValue(),
    }),
    columnHelper.display({
      id: "person",
      header: "预约人",
      cell: (info) =>
        info.row.original.kind === "block" ? (
          <Badge tone="warning">不可预约</Badge>
        ) : (
          (info.row.original.person?.name ?? "—")
        ),
    }),
    columnHelper.accessor("title", {
      header: "用途",
      cell: (info) => (
        <span {...stylex.props(styles.title)}>
          {info.row.original.series === undefined ? null : <Repeat size={12} aria-label="周期预约" />}{" "}
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "状态",
      cell: (info) =>
        info.getValue() === "cancelled" ? (
          <Badge>已取消</Badge>
        ) : isFinished(info.row.original, now) ? (
          <Badge>已结束</Badge>
        ) : (
          <Badge tone="free">有效</Badge>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: "操作",
      cell: (info) => {
        const booking = info.row.original;
        const isEditable = booking.status === "confirmed" && !isFinished(booking, now);

        return isEditable ? (
          <Row gap="xs" isNoWrap>
            <Button
              size="sm"
              variant="ghost"
              aria-label="修改"
              icon={<Pencil size={16} aria-hidden />}
              onClick={() =>
                void navigate({
                  to: "/r/$slug/book",
                  params: { slug: booking.roomSlug },
                  search: { edit: booking.id, date: parseZoned(booking.start).toPlainDate().toString() },
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label="取消"
              icon={<Trash2 size={16} aria-hidden />}
              onClick={() => void cancelBooking(booking).then(() => bookings.refetch())}
            />
          </Row>
        ) : null;
      },
    }),
  ]);

  const table = useTable({ features: CORE_FEATURES, columns, data: bookings.data ?? EMPTY });

  return (
    <Stack gap="lg">
      <Row gap="md" isSpread>
        <PageHeader title="预约" />
        <Row gap="sm">
          <Button
            icon={<UserRoundPlus size={18} aria-hidden />}
            disabled={targetRoom === undefined}
            onClick={() => {
              if (targetRoom !== undefined)
                void navigate({ to: "/r/$slug/book", params: { slug: targetRoom } });
            }}
          >
            代人预约
          </Button>
          <Button
            icon={<Ban size={18} aria-hidden />}
            disabled={targetRoom === undefined}
            onClick={() => {
              if (targetRoom !== undefined) {
                void navigate({
                  to: "/r/$slug/book",
                  params: { slug: targetRoom },
                  search: { mode: "block" },
                });
              }
            }}
          >
            不可预约时段
          </Button>
        </Row>
      </Row>
      <div {...stylex.props(styles.filters)}>
        <SelectField
          label="房间"
          value={room}
          options={[
            { value: "", label: "全部房间" },
            ...(rooms.data ?? []).map((item) => ({ value: item.slug, label: item.name })),
          ]}
          onValueChange={setRoom}
        />
        <TextField label="从" type="date" value={from} onValueChange={setFrom} />
        <TextField label="到" type="date" value={to} min={from} onValueChange={setTo} />
        <SelectField
          label="预约人"
          value={personId}
          options={[
            { value: "", label: "所有人" },
            ...(people.data ?? []).map((person) => ({ value: String(person.id), label: person.name })),
          ]}
          onValueChange={setPersonId}
        />
        <SelectField
          label="状态"
          value={status}
          options={[
            { value: "confirmed", label: "有效" },
            { value: "cancelled", label: "已取消" },
            { value: "", label: "全部" },
          ]}
          onValueChange={setStatus}
        />
      </div>
      {bookings.data === undefined ? (
        bookings.isError ? (
          <Notice tone="busy">{errorMessage(bookings.error)}</Notice>
        ) : (
          <Skeleton height={320} />
        )
      ) : (
        <DataTable table={table} caption="预约列表" emptyText="这个范围内没有预约" />
      )}
      {targetRoom === undefined ? null : (
        <Notice tone="info">
          「代人预约」和「不可预约时段」会打开 {roomNames.get(targetRoom) ?? targetRoom}{" "}
          的预约表单（可在上方筛选中切换房间），在表单里打开「重复预约」即可设置周期性的不可预约时段。
        </Notice>
      )}
    </Stack>
  );
}

const EMPTY: Booking[] = [];
