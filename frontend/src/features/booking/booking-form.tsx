/**
 * Booking form: date picker, start / duration picker, required purpose and optional repeat.
 * Single bookings are checked live and conflicts offer one-tap suggestions; recurring bookings
 * show a preview. In a container at least 640 px wide the date and time sit side by side.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData } from "@tanstack/react-query";
import { useForm, useStore } from "@tanstack/react-form";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { CalendarCheck, Check, CircleAlert, LoaderCircle, Repeat } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import {
  api,
  errorMessage,
  fetchClient,
  refreshBookings,
  type Booking,
  type Conflict,
  type Room,
} from "../../api/client";
import {
  DEFAULT_SERIES_COUNT,
  describeRule,
  suggestionLabel,
  type SeriesOverride,
  type SeriesRule,
} from "../../lib/recurring";
import { dayAvailability, slotState } from "../../lib/schedule";
import {
  GRID_MINUTES,
  clockToMinutes,
  formatBookingWhen,
  formatClockRange,
  formatDuration,
  formatMonthDay,
  minutesOfDay,
  minutesToClock,
  parseDate,
  parseZoned,
  toTimestamp,
  weekdayLabel,
} from "../../lib/time";
import { rememberTitle, useSession } from "../../state/app-store";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Disclosure, Stepper, SwitchRow } from "../../ui/controls";
import { DatePicker } from "../../ui/date-picker";
import { SelectField, type SelectOption } from "../../ui/field";
import { Card, Notice, Row, Stack } from "../../ui/layout";
import { ChipGroup, Segmented } from "../../ui/segmented";
import { notify } from "../../ui/toast";
import { requestSession } from "../identity/identity";
import { useNow, useRoomBookings } from "../room/room-data";
import { askScope, bookSuggestion, createBooking, roomHeader } from "./booking-actions";
import { PurposeField, TITLE_MAX_LENGTH, TITLE_REQUIRED_MESSAGE } from "./purpose-field";
import { RecurringPreview } from "./recurring-preview";
import { TimePicker } from "./time-picker";

/** Initial values of the form. */
export interface BookingDraft {
  date: string;
  start: string;
  end: string;
  title: string;
  isRepeat: boolean;
}

/** What the form produced. */
type BookingResult = { kind: "single"; booking: Booking } | { kind: "series"; count: number };

/** Props of {@link BookingForm}. */
export interface BookingFormProps {
  room: Room;
  draft: BookingDraft;
  editing?: Booking | undefined;
  initialKind?: "normal" | "block";
  onDone: (result: BookingResult) => void;
}

const formSchema = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string(),
  title: z.string().max(TITLE_MAX_LENGTH, `用途最多 ${TITLE_MAX_LENGTH} 个字`),
  isRepeat: z.boolean(),
  freq: z.enum(["weekly", "biweekly"]),
  weekdays: z.array(z.string()).min(1, "至少选择一天"),
  endMode: z.enum(["count", "until"]),
  count: z.number(),
  untilDate: z.string(),
  kind: z.enum(["normal", "block"]),
  onBehalfOf: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  value: String(weekday),
  label: weekdayLabel(weekday).replace("周", ""),
  ariaLabel: weekdayLabel(weekday),
}));

/** Days a block (admin "不可预约") may be placed ahead; blocks ignore the booking rules. */
const BLOCK_HORIZON_DAYS = 366;

const styles = stylex.create({
  form: { containerType: "inline-size", display: "flex", flexDirection: "column", gap: 20 },
  when: {
    alignItems: "start",
    display: "grid",
    gap: 20,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [media.formTwoColumn]: "minmax(260px, 320px) minmax(0, 1fr)",
    },
  },
  timeColumn: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 },
  rules: { color: colors.textMuted, fontSize: fonts.sizeXs, lineHeight: 1.5 },
  checkBox: { minHeight: 48 },
  check: {
    alignItems: "flex-start",
    borderRadius: radii.medium,
    display: "flex",
    fontSize: fonts.sizeMd,
    gap: 8,
    lineHeight: 1.5,
    paddingBlock: 12,
    paddingInline: 14,
  },
  checkOk: { backgroundColor: colors.freeSoft, color: colors.freeStrong },
  checkBad: { backgroundColor: colors.busySoft, color: colors.busyStrong },
  checkWarn: { backgroundColor: colors.warningSoft, color: colors.warning },
  checkPending: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  checkIcon: { display: "inline-flex", flexShrink: 0, marginTop: 2 },
  checkBody: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
  suggestionsLabel: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  suggestionChip: { borderRadius: radii.pill },
  repeatBox: { display: "flex", flexDirection: "column", gap: 16 },
  spin: {
    animationDuration: "800ms",
    animationIterationCount: "infinite",
    animationName: stylex.keyframes({
      from: { transform: "rotate(0deg)" },
      to: { transform: "rotate(360deg)" },
    }),
    animationTimingFunction: "linear",
  },
  sticky: {
    backgroundColor: colors.surface,
    bottom: 0,
    paddingBottom: "max(8px, env(safe-area-inset-bottom))",
    paddingTop: 8,
    position: "sticky",
    zIndex: 2,
  },
});

/**
 * Build the series rule from form values.
 *
 * @param values - Form values.
 * @returns The rule.
 */
function ruleFromValues(values: FormValues): SeriesRule {
  return {
    freq: values.freq,
    weekdays: values.weekdays.map(Number).sort((left, right) => left - right),
    startDate: values.date,
    startTime: values.start,
    endTime: values.end,
    ...(values.endMode === "until" && values.untilDate !== ""
      ? { untilDate: values.untilDate }
      : { count: values.count || DEFAULT_SERIES_COUNT }),
  };
}

/**
 * The booking form.
 *
 * @param props - Form props.
 * @returns The form.
 */
export function BookingForm({ room, draft, editing, initialKind = "normal", onDone }: BookingFormProps) {
  const session = useSession();
  const isAdmin = session?.person.isAdmin === true;
  const now = useNow(30_000);
  const today = now.toPlainDate();
  const [submitError, setSubmitError] = useState<string>();
  const [submitConflict, setSubmitConflict] = useState<Conflict>();
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  const [seriesOverrides, setSeriesOverrides] = useState<{ overrides: SeriesOverride[]; willBook: number }>({
    overrides: [],
    willBook: 0,
  });

  const [isBusy, setIsBusy] = useState(false);
  const firstDate = parseDate(draft.date);

  const defaults: FormValues = {
    date: draft.date,
    start: draft.start,
    end: draft.end,
    title: draft.title,
    isRepeat: draft.isRepeat,
    freq: "weekly",
    weekdays: [String(firstDate.dayOfWeek)],
    endMode: "count",
    count: DEFAULT_SERIES_COUNT,
    untilDate: "",
    kind: editing?.kind ?? initialKind,
    onBehalfOf: "",
  };

  const form = useForm({
    defaultValues: defaults,
    validators: { onChange: formSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined);
      setSubmitConflict(undefined);
      setHasTriedSubmit(true);

      if (value.title.trim() === "") return;

      if ((await requestSession(room.slug)) === undefined) return;

      setIsBusy(true);

      try {
        if (editing !== undefined) await submitEdit(value);
        else if (value.isRepeat) await submitSeries(value);
        else await submitSingle(value);
      } finally {
        setIsBusy(false);
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const isBlock = values.kind === "block";
  const selectedDate = parseDate(values.date);

  const advanceMax = today.add({
    days: isBlock ? BLOCK_HORIZON_DAYS : Math.max(room.rules.maxAdvanceDays, 0),
  });

  const maxDate = firstDate.until(advanceMax).days < 0 ? firstDate : advanceMax;

  const maxDuration = isBlock
    ? clockToMinutes(room.rules.closeTime) - clockToMinutes(room.rules.openTime)
    : room.rules.maxDurationMinutes;

  const dayBookings = useRoomBookings(room.slug, values.date, values.date);

  const availability = dayAvailability(
    (dayBookings.data ?? []).filter((booking) => booking.id !== editing?.id),
    selectedDate,
    room.rules.openTime,
    room.rules.closeTime,
    now,
  );

  const [checkKey] = useDebouncedValue(`${values.date}|${values.start}|${values.end}`, { wait: 250 });
  const [checkDate = "", checkStart = "", checkEnd = ""] = checkKey.split("|");
  const isRangeValid = clockToMinutes(values.end) > clockToMinutes(values.start);
  const titleError = hasTriedSubmit && values.title.trim() === "" ? TITLE_REQUIRED_MESSAGE : undefined;

  const check = api.useQuery(
    "post",
    "/api/rooms/{slug}/check",
    {
      params: { path: { slug: room.slug } },
      body: {
        start: toTimestamp(checkDate, checkStart),
        end: toTimestamp(checkDate, checkEnd),
        excludeBookingId: editing?.id,
      },
    },
    {
      enabled: !values.isRepeat && clockToMinutes(checkEnd) > clockToMinutes(checkStart),
      placeholderData: keepPreviousData,
      staleTime: 0,
    },
  );

  const isCheckStale = checkKey !== `${values.date}|${values.start}|${values.end}` || check.isFetching;

  /**
   * Change the date; on today a start that has already passed moves to the next grid step.
   *
   * @param next - New `YYYY-MM-DD`.
   */
  function changeDate(next: string): void {
    form.setFieldValue("date", next);
    form.setFieldValue("weekdays", [String(parseDate(next).dayOfWeek)]);

    const nextAvailability = dayAvailability(
      [],
      parseDate(next),
      room.rules.openTime,
      room.rules.closeTime,
      now,
    );

    const startMinutes = clockToMinutes(values.start);

    if (slotState(nextAvailability, startMinutes) !== "past") return;

    const earliest = Math.max(nextAvailability.earliestMinutes, nextAvailability.openMinutes);
    const duration = Math.max(clockToMinutes(values.end) - startMinutes, GRID_MINUTES);
    const end = Math.min(earliest + duration, nextAvailability.closeMinutes);

    if (end - earliest < GRID_MINUTES) return;

    form.setFieldValue("start", minutesToClock(earliest));
    form.setFieldValue("end", minutesToClock(end));
  }

  /**
   * Submit a single booking.
   *
   * @param value - Form values.
   */
  async function submitSingle(value: FormValues): Promise<void> {
    const outcome = await createBooking(room.slug, {
      start: toTimestamp(value.date, value.start),
      end: toTimestamp(value.date, value.end),
      title: value.title,
      kind: value.kind === "block" ? "block" : undefined,
      onBehalfOf: value.onBehalfOf === "" ? undefined : Number(value.onBehalfOf),
    });

    if (outcome.kind === "created") onDone({ kind: "single", booking: outcome.booking });
    else if (outcome.kind === "conflict") setSubmitConflict(outcome.conflict);
    else if (outcome.kind === "invalid") setSubmitError(outcome.message);
  }

  /**
   * Submit a recurring series with the preview choices.
   *
   * @param value - Form values.
   */
  async function submitSeries(value: FormValues): Promise<void> {
    const result = await fetchClient.POST("/api/rooms/{slug}/series", {
      params: { path: { slug: room.slug } },
      body: {
        rule: ruleFromValues(value),
        title: value.title.trim(),
        overrides: seriesOverrides.overrides,
        kind: value.kind === "block" ? "block" : undefined,
        onBehalfOf: value.onBehalfOf === "" ? undefined : Number(value.onBehalfOf),
      },
    });

    await refreshBookings({ updated: result.data?.created ?? [] });

    if (result.data !== undefined) {
      const created = result.data.created?.length ?? 0;
      const skipped = result.data.skipped?.length ?? 0;

      rememberTitle(value.title);
      notify(
        "success",
        `已预约 ${created} 次`,
        skipped > 0 ? `跳过了 ${skipped} 次` : describeRule(ruleFromValues(value)),
      );
      onDone({ kind: "series", count: created });

      return;
    }

    if (result.error.status === 409) {
      setSubmitError("有时段刚刚被别人预约了，预览已更新，请确认后再提交。");

      return;
    }

    setSubmitError(errorMessage(result.error));
  }

  /**
   * Save changes to an existing booking.
   *
   * @param value - Form values.
   */
  async function submitEdit(value: FormValues): Promise<void> {
    if (editing === undefined) return;

    const scope = await askScope(editing, "修改");

    if (scope === undefined) return;

    const result = await fetchClient.PATCH("/api/bookings/{id}", {
      params: { path: { id: editing.id }, header: roomHeader(editing.roomSlug) },
      body: {
        start: toTimestamp(value.date, value.start),
        end: toTimestamp(value.date, value.end),
        title: value.title.trim(),
        scope: editing.series === undefined ? undefined : scope,
      },
    });

    await refreshBookings({ updated: result.data === undefined ? [] : [result.data] });

    if (result.data !== undefined) {
      rememberTitle(result.data.title);
      notify("success", "已保存修改", formatBookingWhen(result.data.start, result.data.end));
      onDone({ kind: "single", booking: result.data });

      return;
    }

    if (result.error.status === 409 && result.error.conflictWith !== undefined) {
      setSubmitConflict({
        conflictWith: result.error.conflictWith,
        suggestions: result.error.suggestions ?? [],
        conflictEventId: result.error.conflictEventId ?? 0,
      });

      return;
    }

    setSubmitError(errorMessage(result.error));
  }

  /**
   * Book a suggestion right away (or, when editing, move the form to it).
   *
   * @param conflict - The conflict.
   * @param index - Suggestion index.
   */
  async function takeSuggestion(conflict: Conflict, index: number): Promise<void> {
    const suggestion = conflict.suggestions?.[index];

    if (suggestion === undefined) return;

    if (editing !== undefined) {
      const start = parseZoned(suggestion.start);

      form.setFieldValue("date", start.toPlainDate().toString());
      form.setFieldValue("start", minutesToClock(minutesOfDay(start)));
      form.setFieldValue("end", minutesToClock(minutesOfDay(parseZoned(suggestion.end))));
      setSubmitConflict(undefined);

      return;
    }

    if (values.title.trim() === "") {
      setHasTriedSubmit(true);

      return;
    }

    setIsBusy(true);

    const outcome = await bookSuggestion(room.slug, suggestion, conflict.conflictEventId, values.title);

    setIsBusy(false);

    if (outcome.kind === "created") onDone({ kind: "single", booking: outcome.booking });
    else if (outcome.kind === "conflict") setSubmitConflict(outcome.conflict);
    else if (outcome.kind === "invalid") setSubmitError(outcome.message);
  }

  const visibleConflict = submitConflict ?? check.data?.conflict;
  const violations = check.data?.violations ?? [];
  const isCheckOk = check.data !== undefined && visibleConflict === undefined && violations.length === 0;

  const submitLabel =
    editing !== undefined
      ? "保存修改"
      : values.isRepeat
        ? `预约 ${seriesOverrides.willBook} 次`
        : isBlock
          ? "设为不可预约"
          : "预约";

  const repeatHorizon = selectedDate.add({ days: room.rules.recurringMaxWeeks * 7 - 1 });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      {...stylex.props(styles.form)}
    >
      <div {...stylex.props(styles.when)}>
        <DatePicker
          label={values.isRepeat ? "从哪天开始" : "日期"}
          value={values.date}
          min={today}
          max={maxDate}
          today={today}
          onValueChange={changeDate}
        />
        <div {...stylex.props(styles.timeColumn)}>
          <TimePicker
            availability={availability}
            start={values.start}
            end={values.end}
            maxDurationMinutes={maxDuration}
            onChange={(start, end) => {
              form.setFieldValue("start", start);
              form.setFieldValue("end", end);
              setSubmitConflict(undefined);
              setSubmitError(undefined);
            }}
          />
          <p {...stylex.props(styles.rules)}>
            开放时间 {room.rules.openTime}–{room.rules.closeTime}
            {isBlock
              ? ""
              : `，单次最长 ${formatDuration(maxDuration)}，最多提前 ${room.rules.maxAdvanceDays} 天预约`}
          </p>
          {values.isRepeat && editing === undefined ? null : (
            <div aria-live="polite" {...stylex.props(styles.checkBox)}>
              {submitError !== undefined ? (
                <div {...stylex.props(styles.check, styles.checkBad)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <CircleAlert size={18} aria-hidden />
                  </span>
                  <span>{submitError}</span>
                </div>
              ) : visibleConflict !== undefined ? (
                <ConflictPanel
                  conflict={visibleConflict}
                  isEditing={editing !== undefined}
                  isBusy={isBusy}
                  onTake={(index) => void takeSuggestion(visibleConflict, index)}
                />
              ) : violations.length > 0 ? (
                <div {...stylex.props(styles.check, styles.checkWarn)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <CircleAlert size={18} aria-hidden />
                  </span>
                  <span>{violations.map((violation) => violation.message).join("；")}</span>
                </div>
              ) : isCheckOk && !isCheckStale ? (
                <div {...stylex.props(styles.check, styles.checkOk)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <Check size={18} aria-hidden />
                  </span>
                  <span>
                    {formatMonthDay(values.date)} {values.start}–{values.end} 可以预约
                  </span>
                </div>
              ) : isRangeValid ? (
                <div {...stylex.props(styles.check, styles.checkPending)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <LoaderCircle size={18} aria-hidden {...stylex.props(styles.spin)} />
                  </span>
                  <span>正在检查这个时段…</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <PurposeField
        value={values.title}
        onValueChange={(next) => form.setFieldValue("title", next)}
        error={titleError}
        placeholder={isBlock ? "例如：消杀、考试" : undefined}
      />

      {isAdmin && editing === undefined ? (
        <AdminOptions
          values={values}
          onKindChange={(kind) => form.setFieldValue("kind", kind)}
          onBehalfChange={(personId) => form.setFieldValue("onBehalfOf", personId)}
        />
      ) : null}

      {editing === undefined ? (
        <SwitchRow
          label="重复预约"
          hint="例如每周三的组会"
          isChecked={values.isRepeat}
          onCheckedChange={(next) => form.setFieldValue("isRepeat", next)}
        />
      ) : null}

      {values.isRepeat && editing === undefined ? (
        <Card>
          <div {...stylex.props(styles.repeatBox)}>
            <Segmented
              label="重复频率"
              value={values.freq}
              isFullWidth
              options={[
                { value: "weekly", label: "每周" },
                { value: "biweekly", label: "每两周" },
              ]}
              onValueChange={(next) => form.setFieldValue("freq", next)}
            />
            <Stack gap="xs">
              <ChipGroup
                label="在星期几"
                values={values.weekdays}
                options={WEEKDAY_OPTIONS}
                onValuesChange={(next) => form.setFieldValue("weekdays", next)}
              />
              {values.weekdays.length === 0 ? <Notice tone="warning">至少选择一天</Notice> : null}
            </Stack>
            <Segmented
              label="结束方式"
              value={values.endMode}
              isFullWidth
              options={[
                { value: "count", label: "按次数" },
                { value: "until", label: "截止日期" },
              ]}
              onValueChange={(next) => form.setFieldValue("endMode", next)}
            />
            {values.endMode === "count" ? (
              <Stepper
                label="重复次数"
                value={values.count}
                min={2}
                max={Math.max(2, room.rules.recurringMaxWeeks)}
                unit="次"
                onValueChange={(next) => form.setFieldValue("count", next)}
              />
            ) : (
              <DatePicker
                label={`截止日期（最长 ${room.rules.recurringMaxWeeks} 周）`}
                value={values.untilDate}
                min={selectedDate}
                max={repeatHorizon}
                today={today}
                hasShortcuts={false}
                isPopoverOnly
                onValueChange={(next) => form.setFieldValue("untilDate", next)}
              />
            )}
          </div>
        </Card>
      ) : null}

      {values.isRepeat && editing === undefined && values.weekdays.length > 0 && isRangeValid ? (
        <RecurringPreview
          slug={room.slug}
          rule={ruleFromValues(values)}
          onChoicesChange={setSeriesOverrides}
        />
      ) : null}

      {values.isRepeat && submitError !== undefined ? <Notice tone="busy">{submitError}</Notice> : null}

      <div {...stylex.props(styles.sticky)}>
        <Button
          type="submit"
          variant="primary"
          size="xl"
          isFullWidth
          isLoading={isBusy}
          icon={values.isRepeat ? <Repeat size={20} aria-hidden /> : <CalendarCheck size={20} aria-hidden />}
          disabled={
            !isRangeValid ||
            (values.isRepeat
              ? seriesOverrides.willBook === 0 || values.weekdays.length === 0
              : violations.length > 0 || visibleConflict !== undefined)
          }
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Conflict message with one-tap suggestions.
 *
 * @param props - Panel props.
 * @param props.conflict - The conflict.
 * @param props.isEditing - Suggestions fill the form instead of booking.
 * @param props.isBusy - A booking is in flight.
 * @param props.onTake - Take suggestion by index.
 * @returns The panel.
 */
function ConflictPanel({
  conflict,
  isEditing,
  isBusy,
  onTake,
}: {
  conflict: Conflict;
  isEditing: boolean;
  isBusy: boolean;
  onTake: (index: number) => void;
}) {
  const other = conflict.conflictWith;
  const suggestions = conflict.suggestions ?? [];

  return (
    <div {...stylex.props(styles.check, styles.checkBad)}>
      <span {...stylex.props(styles.checkIcon)}>
        <CircleAlert size={18} aria-hidden />
      </span>
      <div {...stylex.props(styles.checkBody)}>
        <span>
          {other.name === "" ? "该时段" : other.name} {formatClockRange(other.start, other.end)}
          {other.title === "" ? "" : `「${other.title}」`} 已占用
        </span>
        {suggestions.length === 0 ? (
          <span>附近没有同样长度的空闲时段，试试换一天或缩短时长。</span>
        ) : (
          <>
            <span {...stylex.props(styles.suggestionsLabel)}>
              {isEditing ? "改到这些时间：" : "一键预约这些时间："}
            </span>
            <Row gap="sm">
              {suggestions.map((suggestion, index) => (
                <Button
                  key={`${suggestion.start}-${suggestion.end}`}
                  variant="secondary"
                  xstyle={styles.suggestionChip}
                  disabled={isBusy}
                  onClick={() => onTake(index)}
                >
                  {suggestionLabel(suggestion.start, suggestion.end, suggestion.kind)}
                </Button>
              ))}
            </Row>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Admin-only options: book on behalf of someone, or mark the time as not bookable.
 *
 * @param props - Options props.
 * @param props.values - Current values.
 * @param props.onKindChange - Set the booking kind.
 * @param props.onBehalfChange - Set the person booked for (`""` = myself).
 * @returns The options.
 */
function AdminOptions({
  values,
  onKindChange,
  onBehalfChange,
}: {
  values: FormValues;
  onKindChange: (kind: "normal" | "block") => void;
  onBehalfChange: (personId: string) => void;
}) {
  const people = api.useQuery("get", "/api/admin/people");

  const options: SelectOption<string>[] = [
    { value: "", label: "我自己" },
    ...(people.data ?? []).map((person) => ({ value: String(person.id), label: person.name })),
  ];

  return (
    <Card>
      <Disclosure
        title="管理员选项"
        hint={values.kind === "block" ? "不可预约时段" : values.onBehalfOf === "" ? undefined : "代人预约"}
        isDefaultOpen={values.kind === "block" || values.onBehalfOf !== ""}
      >
        <Stack gap="md">
          <SwitchRow
            label="设为不可预约时段"
            hint="例如消杀、考试；只检查冲突，不受其他规则限制"
            isChecked={values.kind === "block"}
            onCheckedChange={(isChecked) => onKindChange(isChecked ? "block" : "normal")}
          />
          {values.kind === "block" ? null : (
            <SelectField
              label="代人预约"
              value={values.onBehalfOf}
              options={options}
              onValueChange={onBehalfChange}
            />
          )}
        </Stack>
      </Disclosure>
    </Card>
  );
}
