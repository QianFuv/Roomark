/**
 * Booking form: date, start/end on the 15-minute grid, purpose, optional repeat. Single bookings
 * are checked live and conflicts offer one-tap suggestions; recurring bookings show a preview.
 *
 * @module
 */
import { Temporal } from "@js-temporal/polyfill";
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
  invalidateBookings,
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
import {
  GRID_MINUTES,
  ceilToGrid,
  clockToMinutes,
  dateRange,
  formatBookingWhen,
  formatClockRange,
  formatDuration,
  formatMonthDay,
  minutesOfDay,
  minutesToClock,
  nowZoned,
  parseDate,
  parseZoned,
  todayDate,
  toTimestamp,
  weekdayLabel,
} from "../../lib/time";
import { useSession } from "../../state/app-store";
import { colors, fonts, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Disclosure, SwitchRow } from "../../ui/controls";
import { SelectField, TextField, type SelectOption } from "../../ui/field";
import { Card, Notice, Row, Stack } from "../../ui/layout";
import { ChipGroup, Segmented } from "../../ui/segmented";
import { notify } from "../../ui/toast";
import { requestSession } from "../identity/identity";
import { askScope, bookSuggestion, createBooking, roomHeader } from "./booking-actions";
import { DateStrip } from "./date-strip";
import { RecurringPreview } from "./recurring-preview";

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
  title: z.string().max(60, "用途最多 60 个字"),
  isRepeat: z.boolean(),
  freq: z.enum(["weekly", "biweekly"]),
  weekdays: z.array(z.string()).min(1, "至少选择一天"),
  endMode: z.enum(["count", "until"]),
  count: z.string(),
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

const COUNT_OPTIONS: SelectOption<string>[] = Array.from({ length: 24 }, (_unused, index) => ({
  value: String(index + 2),
  label: `${index + 2} 次`,
}));

const styles = stylex.create({
  form: { display: "flex", flexDirection: "column", gap: 18 },
  times: { display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" },
  duration: { color: colors.textMuted, fontSize: fonts.sizeSm, fontVariantNumeric: "tabular-nums" },
  checkBox: { minHeight: 52 },
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
  repeatBox: { display: "flex", flexDirection: "column", gap: 14 },
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
    backgroundColor: colors.canvas,
    bottom: 0,
    paddingBottom: "max(8px, env(safe-area-inset-bottom))",
    paddingTop: 8,
    position: "sticky",
    zIndex: 2,
  },
});

/**
 * Start options on the grid; past times on today are disabled.
 *
 * @param room - The room.
 * @param date - Selected date.
 * @param now - Current time.
 * @returns Options.
 */
function startOptions(room: Room, date: string, now: Temporal.ZonedDateTime): SelectOption<string>[] {
  const isToday = date === now.toPlainDate().toString();
  const earliest = isToday ? ceilToGrid(minutesOfDay(now)) : 0;
  const options: SelectOption<string>[] = [];

  for (
    let minutes = clockToMinutes(room.rules.openTime);
    minutes < clockToMinutes(room.rules.closeTime);
    minutes += GRID_MINUTES
  ) {
    options.push({
      value: minutesToClock(minutes),
      label: minutesToClock(minutes),
      isDisabled: minutes < earliest,
    });
  }

  return options;
}

/**
 * End options after a start, limited by closing time and maximum duration.
 *
 * @param room - The room.
 * @param start - Start `HH:MM`.
 * @returns Options with durations.
 */
function endOptions(room: Room, start: string): SelectOption<string>[] {
  const startMinutes = clockToMinutes(start);
  const last = Math.min(clockToMinutes(room.rules.closeTime), startMinutes + room.rules.maxDurationMinutes);
  const options: SelectOption<string>[] = [];

  for (let minutes = startMinutes + GRID_MINUTES; minutes <= last; minutes += GRID_MINUTES) {
    options.push({
      value: minutesToClock(minutes),
      label: `${minutesToClock(minutes)}（${formatDuration(minutes - startMinutes)}）`,
    });
  }

  return options;
}

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
      : { count: Number(values.count) || DEFAULT_SERIES_COUNT }),
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
  const now = nowZoned();
  const today = todayDate();
  const [submitError, setSubmitError] = useState<string>();
  const [submitConflict, setSubmitConflict] = useState<Conflict>();

  const [seriesOverrides, setSeriesOverrides] = useState<{ overrides: SeriesOverride[]; willBook: number }>({
    overrides: [],
    willBook: 0,
  });

  const [isBusy, setIsBusy] = useState(false);
  const firstDate = parseDate(draft.date);
  const advanceDays = Math.max(room.rules.maxAdvanceDays, 1);
  const dates = dateRange(today, advanceDays + 1);

  if (!dates.some((date) => date.equals(firstDate))) dates.push(firstDate);

  dates.sort((left, right) => Temporal.PlainDate.compare(left, right));

  const defaults: FormValues = {
    date: draft.date,
    start: draft.start,
    end: draft.end,
    title: draft.title,
    isRepeat: draft.isRepeat,
    freq: "weekly",
    weekdays: [String(firstDate.dayOfWeek)],
    endMode: "count",
    count: String(DEFAULT_SERIES_COUNT),
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
  const [checkKey] = useDebouncedValue(`${values.date}|${values.start}|${values.end}`, { wait: 250 });
  const [checkDate = "", checkStart = "", checkEnd = ""] = checkKey.split("|");
  const isRangeValid = clockToMinutes(values.end) > clockToMinutes(values.start);

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
        title: value.title.trim() === "" ? undefined : value.title.trim(),
        overrides: seriesOverrides.overrides,
        kind: value.kind === "block" ? "block" : undefined,
        onBehalfOf: value.onBehalfOf === "" ? undefined : Number(value.onBehalfOf),
      },
    });

    await invalidateBookings();

    if (result.data !== undefined) {
      const created = result.data.created?.length ?? 0;
      const skipped = result.data.skipped?.length ?? 0;

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

    await invalidateBookings();

    if (result.data !== undefined) {
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
   * Book a suggestion right away.
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
  const durationMinutes = clockToMinutes(values.end) - clockToMinutes(values.start);

  const submitLabel =
    editing !== undefined
      ? "保存修改"
      : values.isRepeat
        ? `预约 ${seriesOverrides.willBook} 次`
        : values.kind === "block"
          ? "设为不可预约"
          : "预约";

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      {...stylex.props(styles.form)}
    >
      <form.Field name="date">
        {(field) => (
          <DateStrip
            label={values.isRepeat ? "从哪天开始" : "日期"}
            dates={dates}
            value={field.state.value}
            today={today}
            onValueChange={(next) => {
              field.handleChange(next);
              form.setFieldValue("weekdays", [String(parseDate(next).dayOfWeek)]);
            }}
          />
        )}
      </form.Field>

      <Stack gap="xs">
        <div {...stylex.props(styles.times)}>
          <form.Field name="start">
            {(field) => (
              <SelectField
                label="开始"
                value={field.state.value}
                options={startOptions(room, values.date, now)}
                onValueChange={(next) => {
                  const keep = Math.max(GRID_MINUTES, durationMinutes);
                  const close = clockToMinutes(room.rules.closeTime);

                  field.handleChange(next);
                  form.setFieldValue(
                    "end",
                    minutesToClock(
                      Math.min(
                        clockToMinutes(next) + keep,
                        close,
                        clockToMinutes(next) + room.rules.maxDurationMinutes,
                      ),
                    ),
                  );
                }}
              />
            )}
          </form.Field>
          <form.Field name="end">
            {(field) => (
              <SelectField
                label="结束"
                isValueCompact
                value={field.state.value}
                options={endOptions(room, values.start)}
                onValueChange={(next) => field.handleChange(next)}
              />
            )}
          </form.Field>
        </div>
        <span {...stylex.props(styles.duration)}>
          {isRangeValid ? `共 ${formatDuration(durationMinutes)}` : "结束时间需要晚于开始时间"} · 开放时间{" "}
          {room.rules.openTime}–{room.rules.closeTime}，单次最长{" "}
          {formatDuration(room.rules.maxDurationMinutes)}
        </span>
      </Stack>

      <form.Field name="title">
        {(field) => (
          <TextField
            label="用途（可选）"
            placeholder="例如：组会、答辩、面试"
            value={field.state.value}
            onValueChange={(next) => field.handleChange(next)}
            maxLength={60}
            error={field.state.meta.errors[0]?.message}
          />
        )}
      </form.Field>

      {isAdmin && editing === undefined ? (
        <AdminOptions
          values={values}
          onKindChange={(kind) => form.setFieldValue("kind", kind)}
          onBehalfChange={(personId) => form.setFieldValue("onBehalfOf", personId)}
        />
      ) : null}

      {editing === undefined ? (
        <form.Field name="isRepeat">
          {(field) => (
            <SwitchRow
              label="重复预约"
              hint="例如每周三的组会"
              isChecked={field.state.value}
              onCheckedChange={(next) => field.handleChange(next)}
            />
          )}
        </form.Field>
      ) : null}

      {values.isRepeat && editing === undefined ? (
        <Card>
          <div {...stylex.props(styles.repeatBox)}>
            <form.Field name="freq">
              {(field) => (
                <Segmented
                  label="重复频率"
                  value={field.state.value}
                  isFullWidth
                  options={[
                    { value: "weekly", label: "每周" },
                    { value: "biweekly", label: "每两周" },
                  ]}
                  onValueChange={(next) => field.handleChange(next)}
                />
              )}
            </form.Field>
            <form.Field name="weekdays">
              {(field) => (
                <Stack gap="xs">
                  <ChipGroup
                    label="在星期几"
                    values={field.state.value}
                    options={WEEKDAY_OPTIONS}
                    onValuesChange={(next) => field.handleChange(next)}
                  />
                  {field.state.value.length === 0 ? <Notice tone="warning">至少选择一天</Notice> : null}
                </Stack>
              )}
            </form.Field>
            <form.Field name="endMode">
              {(field) => (
                <Segmented
                  label="结束方式"
                  value={field.state.value}
                  isFullWidth
                  options={[
                    { value: "count", label: "按次数" },
                    { value: "until", label: "截止日期" },
                  ]}
                  onValueChange={(next) => field.handleChange(next)}
                />
              )}
            </form.Field>
            {values.endMode === "count" ? (
              <form.Field name="count">
                {(field) => (
                  <SelectField
                    label="重复次数"
                    value={field.state.value}
                    options={COUNT_OPTIONS}
                    onValueChange={(next) => field.handleChange(next)}
                  />
                )}
              </form.Field>
            ) : (
              <form.Field name="untilDate">
                {(field) => (
                  <TextField
                    label="截止日期"
                    type="date"
                    min={values.date}
                    value={field.state.value}
                    onValueChange={(next) => field.handleChange(next)}
                    description={`最长 ${room.rules.recurringMaxWeeks} 周`}
                  />
                )}
              </form.Field>
            )}
          </div>
        </Card>
      ) : null}

      {values.isRepeat && editing === undefined ? (
        values.weekdays.length === 0 || !isRangeValid ? null : (
          <RecurringPreview
            slug={room.slug}
            rule={ruleFromValues(values)}
            onChoicesChange={setSeriesOverrides}
          />
        )
      ) : (
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
        isDefaultOpen={values.kind === "block"}
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
