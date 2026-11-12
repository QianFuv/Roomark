/**
 * Booking detail sheet with the actions the viewer may take.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, Pencil, Repeat, Square, Timer, Trash2, UserRound } from "lucide-react";
import { useState } from "react";

import type { Booking } from "../../api/client";
import { isFinished, isOngoing } from "../../lib/schedule";
import { formatClock, formatDuration, formatRelativeDate, minutesBetween, parseZoned } from "../../lib/time";
import { colors, fonts, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Badge, Row, Stack } from "../../ui/layout";
import { Sheet } from "../../ui/sheet";
import { useNow } from "../room/room-data";
import { cancelBooking, endBooking, extendBooking } from "./booking-actions";

const styles = stylex.create({
  facts: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
  },
  fact: { alignItems: "center", color: colors.text, display: "flex", fontSize: fonts.sizeMd, gap: 10 },
  factIcon: { color: colors.textSubtle, display: "inline-flex", flexShrink: 0 },
  muted: { color: colors.textMuted },
  time: { fontVariantNumeric: "tabular-nums", fontWeight: 700 },
  actionsLabel: { color: colors.textMuted, fontSize: fonts.sizeSm, fontWeight: 600 },
});

/** Props of {@link BookingDetailSheet}. */
export interface BookingDetailSheetProps {
  booking: Booking | undefined;
  onClose: () => void;
}

/**
 * Sheet showing one booking.
 *
 * @param props - Sheet props.
 * @returns The sheet.
 */
export function BookingDetailSheet({ booking, onClose }: BookingDetailSheetProps) {
  return (
    <Sheet
      isOpen={booking !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={booking === undefined ? "" : bookingHeading(booking)}
    >
      {booking === undefined ? null : <BookingDetail key={booking.id} booking={booking} onClose={onClose} />}
    </Sheet>
  );
}

/**
 * Title of a booking for headings.
 *
 * @param booking - The booking.
 * @returns E.g. `组会` or `不可预约`.
 */
export function bookingHeading(booking: Booking): string {
  if (booking.kind === "block") return booking.title === "" ? "不可预约" : `不可预约 · ${booking.title}`;

  return booking.title === "" ? "会议室预约" : booking.title;
}

/**
 * Detail body.
 *
 * @param props - Body props.
 * @param props.booking - The booking as opened; extending updates the shown copy.
 * @param props.onClose - Close the sheet.
 * @returns The body.
 */
function BookingDetail({ booking: initial, onClose }: { booking: Booking; onClose: () => void }) {
  const [booking, setBooking] = useState(initial);
  const now = useNow();
  const navigate = useNavigate();
  const isNow = isOngoing(booking, now);
  const isPast = isFinished(booking, now);
  const start = parseZoned(booking.start);

  return (
    <Stack gap="lg">
      <div {...stylex.props(styles.facts)}>
        <div {...stylex.props(styles.fact)}>
          <span {...stylex.props(styles.factIcon)}>
            <CalendarClock size={18} aria-hidden />
          </span>
          <span>
            {formatRelativeDate(start.toPlainDate())}{" "}
            <span {...stylex.props(styles.time)}>
              {formatClock(booking.start)}–{formatClock(booking.end)}
            </span>{" "}
            <span {...stylex.props(styles.muted)}>
              （{formatDuration(minutesBetween(booking.start, booking.end))}）
            </span>
          </span>
        </div>
        {booking.person === undefined ? null : (
          <div {...stylex.props(styles.fact)}>
            <span {...stylex.props(styles.factIcon)}>
              <UserRound size={18} aria-hidden />
            </span>
            <span>
              {booking.person.name}
              {booking.isMine ? "（我）" : ""}
            </span>
          </div>
        )}
        {booking.series === undefined ? null : (
          <div {...stylex.props(styles.fact)}>
            <span {...stylex.props(styles.factIcon)}>
              <Repeat size={18} aria-hidden />
            </span>
            <span>
              {booking.series.ruleSummary} ·{" "}
              <span {...stylex.props(styles.muted)}>
                第 {booking.series.index}/{booking.series.total} 次
              </span>
            </span>
          </div>
        )}
        <Row gap="xs">
          {isNow ? <Badge tone="busy">进行中</Badge> : null}
          {isPast ? <Badge>已结束</Badge> : null}
          {booking.kind === "block" ? <Badge tone="warning">不可预约时段</Badge> : null}
          {booking.releasedMinutes > 0 ? (
            <Badge tone="free">提前释放 {booking.releasedMinutes} 分钟</Badge>
          ) : null}
        </Row>
      </div>
      {booking.canEdit && !isPast ? (
        <Stack gap="sm">
          {isNow ? (
            <>
              <span {...stylex.props(styles.actionsLabel)}>续时</span>
              <Row gap="sm">
                {([15, 30, 60] as const).map((minutes) => (
                  <Button
                    key={minutes}
                    variant="soft"
                    icon={<Timer size={16} aria-hidden />}
                    onClick={() => {
                      void extendBooking(booking, minutes).then((updated) => {
                        if (updated !== undefined) setBooking(updated);
                      });
                    }}
                  >
                    +{minutes} 分钟
                  </Button>
                ))}
              </Row>
              <Button
                variant="secondary"
                size="lg"
                isFullWidth
                icon={<Square size={16} aria-hidden />}
                onClick={() => {
                  void endBooking(booking).then((hasEnded) => {
                    if (hasEnded) onClose();
                  });
                }}
              >
                提前结束
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="lg"
                isFullWidth
                icon={<Pencil size={16} aria-hidden />}
                onClick={() => {
                  onClose();
                  void navigate({
                    to: "/r/$slug/book",
                    params: { slug: booking.roomSlug },
                    search: { edit: booking.id, date: start.toPlainDate().toString() },
                  });
                }}
              >
                修改时间或用途
              </Button>
              <Button
                variant="danger"
                size="lg"
                isFullWidth
                icon={<Trash2 size={16} aria-hidden />}
                onClick={() => {
                  void cancelBooking(booking).then((isCancelled) => {
                    if (isCancelled) onClose();
                  });
                }}
              >
                取消预约
              </Button>
            </>
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}
