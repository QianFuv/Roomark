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
import { useBlocker, useRouter } from "@tanstack/react-router";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { CalendarCheck, Check, CircleAlert, LoaderCircle, Repeat } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";

import {
  api,
  errorMessage,
  fetchClient,
  refreshBookings,
  type Booking,
  type Conflict,
  type Room,
  type Suggestion,
  type TimeRange,
} from "../../api/client";
import {
  DEFAULT_SERIES_COUNT,
  describeRule,
  type SeriesOverride,
  type SeriesRule,
} from "../../lib/recurring";
import { dayAvailability, slotState } from "../../lib/schedule";
import {
  GRID_MINUTES,
  clockToMinutes,
  formatBookingWhen,
  formatMonthDay,
  minutesOfDay,
  minutesToClock,
  parseDate,
  parseZoned,
  toTimestamp,
  weekdayLabel,
} from "../../lib/time";
import { rememberTitle, useSession } from "../../state/app-store";
import { colors, lineHeights, media, radii, sizes, space } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Disclosure, Stepper, SwitchRow } from "../../ui/controls";
import { DatePicker } from "../../ui/date-picker";
import { ComboboxField, type SelectOption } from "../../ui/field";
import { HelpHint } from "../../ui/help-hint";
import { Card, Notice, Stack } from "../../ui/layout";
import { ChipGroup, Segmented } from "../../ui/segmented";
import { confirmAction } from "../../ui/dialogs";
import { notify } from "../../ui/toast";
import { text } from "../../ui/typography";
import { overlayDepth } from "../../app/overlay-history";
import { requestSession } from "../identity/identity";
import { useNow, useRoomBookings } from "../room/room-data";
import { askScope, createBooking, roomHeader } from "./booking-actions";
import { PurposeField, TITLE_MAX_LENGTH, TITLE_REQUIRED_MESSAGE } from "./purpose-field";
import { RecurringPreview } from "./recurring-preview";
import { ConflictSuggestions } from "./suggestion-list";
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
  weekdays: z.array(z.string()).min(1, "至少选一天"),
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
  form: { containerType: "inline-size", display: "flex", flexDirection: "column", gap: space.sectionGap },
  when: {
    alignItems: "start",
    display: "grid",
    gap: space.lg,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [media.formTwoColumn]: "minmax(260px, 320px) minmax(0, 1fr)",
    },
  },
  timeColumn: { display: "flex", flexDirection: "column", gap: space.md, minWidth: 0 },
  checkBox: { minHeight: sizes.controlLarge },
  check: {
    alignItems: "flex-start",
    borderRadius: radii.medium,
    display: "flex",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
  },
  checkOk: { backgroundColor: colors.freeSoft, color: colors.freeStrong },
  checkBad: { backgroundColor: colors.busySoft, color: colors.busyStrong },
  checkWarn: { backgroundColor: colors.warningSoft, color: colors.warning },
  checkPending: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
  checkIcon: { alignItems: "center", display: "inline-flex", flexShrink: 0, height: lineHeights.body },
  panelStatus: {
    alignItems: "flex-start",
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    gap: space.sm,
    paddingTop: space.md,
  },
  panelStatusOk: { color: colors.freeStrong },
  panelStatusWarn: { color: colors.warning },
  panelStatusPending: { color: colors.textMuted },
  panelStatusIcon: { alignItems: "center", display: "inline-flex", flexShrink: 0, height: lineHeights.body },
  repeatBox: { display: "flex", flexDirection: "column", gap: space.lg },
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
    paddingBottom: `max(${space.sm}, env(safe-area-inset-bottom))`,
    paddingTop: space.sm,
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

/** Date and clock times of the form, as `YYYY-MM-DD` and `HH:MM`. */
interface FormSlot {
  date: string;
  start: string;
  end: string;
}

/**
 * Form date and clock times of a suggested window.
 *
 * @param suggestion - The suggestion.
 * @returns `date`, `start` and `end` as form values.
 */
function suggestionSlot(suggestion: Suggestion): FormSlot {
  const start = parseZoned(suggestion.start);

  return {
    date: start.toPlainDate().toString(),
    start: minutesToClock(minutesOfDay(start)),
    end: minutesToClock(minutesOfDay(parseZoned(suggestion.end))),
  };
}

/**
 * Key identifying a date and time range of the form.
 *
 * @param slot - Date and clock times.
 * @returns The key.
 */
function slotKey(slot: FormSlot): string {
  return `${slot.date}|${slot.start}|${slot.end}`;
}

/**
 * A suggestion applied to the form, kept so the booking is attributed to its conflict: by
 * `conflictEventId` for a submit conflict, or by the originally requested range (`requested`)
 * for a conflict seen only through the live check, which has no event id.
 */
interface AppliedSuggestion {
  conflict: Conflict;
  index: number;
  key: string;
  requested: TimeRange | undefined;
}

/**
 * Timestamps of a slot key's range.
 *
 * @param key - Key from {@link slotKey}.
 * @returns The range.
 */
function keyRange(key: string): TimeRange {
  const [date = "", start = "", end = ""] = key.split("|");

  return { start: toTimestamp(date, start), end: toTimestamp(date, end) };
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
  const [applied, setApplied] = useState<AppliedSuggestion>();
  const purposeRef = useRef<HTMLInputElement>(null);

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

      if (value.title.trim() === "") {
        revealPurpose();

        return;
      }

      if ((await requestSession(room.slug)) === undefined) return;

      setIsBusy(true);

      try {
        if (editing !== undefined) await submitEdit(value);
        else if (value.isRepeat) await submitSeries(value);
        else await submitSingle(value, applied?.key === slotKey(value) ? applied : undefined);
      } finally {
        setIsBusy(false);
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const router = useRouter();
  const [formDepth] = useState(() => overlayDepth(router.history.location.state));
  const isLeavingRef = useRef(false);
  const isDirty = values.title.trim() !== draft.title.trim() || values.isRepeat !== draft.isRepeat;

  useBlocker({
    shouldBlockFn: async ({ next, action }) => {
      if (isLeavingRef.current || !isDirty) return false;

      const isPop = action === "BACK" || action === "FORWARD" || action === "GO";
      const nextDepth = isPop ? overlayDepth(window.history.state) : 0;

      if (next.pathname === router.history.location.pathname && isPop && nextDepth >= formDepth) return false;

      return !(await confirmAction("放弃填写的内容？", "放弃", undefined, true, false));
    },
    enableBeforeUnload: () => isDirty && !isLeavingRef.current,
  });

  /**
   * Finish: leave without the unsaved-content prompt.
   *
   * @param result - What was saved.
   */
  function finish(result: BookingResult): void {
    isLeavingRef.current = true;
    onDone(result);
  }

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

  if (applied !== undefined && applied.key !== slotKey(values)) setApplied(undefined);

  const [checkKey] = useDebouncedValue(slotKey(values), { wait: 250 });
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

  const isCheckStale = checkKey !== slotKey(values) || check.isFetching;
  const [checkedKey, setCheckedKey] = useState(checkKey);

  if (check.data !== undefined && !check.isPlaceholderData && checkedKey !== checkKey)
    setCheckedKey(checkKey);

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
   * Bring the purpose field into view and focus it, so a missing 用途 is never off-screen.
   */
  function revealPurpose(): void {
    const input = purposeRef.current;

    if (input === null) return;

    const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "center", behavior: isReducedMotion ? "auto" : "smooth" });
  }

  /**
   * Submit a single booking.
   *
   * @param value - Form values.
   * @param suggestion - The applied suggestion the chosen slot came from, if any.
   */
  async function submitSingle(value: FormValues, suggestion: AppliedSuggestion | undefined): Promise<void> {
    const conflictEventId = suggestion?.conflict.conflictEventId ?? 0;

    const outcome = await createBooking(room.slug, {
      start: toTimestamp(value.date, value.start),
      end: toTimestamp(value.date, value.end),
      title: value.title,
      conflictEventId: conflictEventId === 0 ? undefined : conflictEventId,
      suggestedFrom: conflictEventId === 0 ? suggestion?.requested : undefined,
      kind: value.kind === "block" ? "block" : undefined,
      onBehalfOf: value.onBehalfOf === "" ? undefined : Number(value.onBehalfOf),
    });

    if (outcome.kind === "created") {
      finish({ kind: "single", booking: outcome.booking });
    } else if (outcome.kind === "conflict") {
      setApplied(undefined);
      setSubmitConflict(outcome.conflict);
    } else if (outcome.kind === "invalid") {
      setSubmitError(outcome.message);
    }
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
        skipped > 0 ? `跳过 ${skipped} 次` : describeRule(ruleFromValues(value)),
      );
      finish({ kind: "series", count: created });

      return;
    }

    if (result.error.status === 409) {
      setSubmitError("有一次刚被别人约走，预览已更新，确认后再提交");

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
      notify("success", "已保存", formatBookingWhen(result.data.start, result.data.end));
      finish({ kind: "single", booking: result.data });

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
   * Apply a suggestion's date and time to the form. It never books: the user confirms with the main
   * button, which then attributes the booking to the conflict.
   *
   * @param conflict - The conflict.
   * @param index - Suggestion index.
   */
  function takeSuggestion(conflict: Conflict, index: number): void {
    const suggestion = conflict.suggestions?.[index];

    if (suggestion === undefined) return;

    const slot = suggestionSlot(suggestion);

    const requested =
      conflict.conflictEventId !== 0
        ? undefined
        : conflict === applied?.conflict
          ? applied.requested
          : keyRange(checkedKey);

    form.setFieldValue("date", slot.date);
    form.setFieldValue("weekdays", [String(parseDate(slot.date).dayOfWeek)]);
    form.setFieldValue("start", slot.start);
    form.setFieldValue("end", slot.end);
    setSubmitConflict(undefined);
    setSubmitError(undefined);
    setApplied({ conflict, index, key: slotKey(slot), requested });
  }

  const isOnApplied = applied !== undefined && applied.key === slotKey(values);
  const freshConflict = isCheckStale ? undefined : check.data?.conflict;

  const visibleConflict =
    submitConflict ?? (isOnApplied ? (freshConflict ?? applied.conflict) : check.data?.conflict);

  const blockingConflict = submitConflict ?? (isOnApplied ? freshConflict : check.data?.conflict);
  const selectedIndex = isOnApplied && visibleConflict === applied.conflict ? applied.index : undefined;
  const violations = check.data?.violations ?? [];
  const isCheckOk = check.data !== undefined && blockingConflict === undefined && violations.length === 0;
  const isTitleEmpty = values.title.trim() === "";

  const submitLabel =
    editing !== undefined
      ? "保存"
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
          label={values.isRepeat ? "开始日期" : "日期"}
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
          {values.isRepeat && editing === undefined ? null : (
            <div aria-live="polite" {...stylex.props(styles.checkBox)}>
              {submitError !== undefined ? (
                <div {...stylex.props(text.body, styles.check, styles.checkBad)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <CircleAlert aria-hidden />
                  </span>
                  <span>{submitError}</span>
                </div>
              ) : visibleConflict !== undefined ? (
                <ConflictSuggestions
                  conflict={visibleConflict}
                  today={today}
                  selectedIndex={selectedIndex}
                  isBusy={isBusy}
                  onTake={(index) => takeSuggestion(visibleConflict, index)}
                  footer={
                    selectedIndex === undefined ? null : (
                      <AppliedStatus
                        label={`${formatMonthDay(values.date)} ${values.start}–${values.end}`}
                        state={
                          isCheckStale
                            ? "pending"
                            : violations.length > 0
                              ? violations.map((violation) => violation.message).join("；")
                              : "ok"
                        }
                        confirmText={
                          editing !== undefined
                            ? "点「保存」确认"
                            : isTitleEmpty
                              ? "填好用途再点「预约」"
                              : "点「预约」确认"
                        }
                      />
                    )
                  }
                />
              ) : violations.length > 0 ? (
                <div {...stylex.props(text.body, styles.check, styles.checkWarn)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <CircleAlert aria-hidden />
                  </span>
                  <span>{violations.map((violation) => violation.message).join("；")}</span>
                </div>
              ) : isCheckOk && !isCheckStale ? (
                <div {...stylex.props(text.body, styles.check, styles.checkOk)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <Check aria-hidden />
                  </span>
                  <span>
                    {formatMonthDay(values.date)} {values.start}–{values.end} 可以约
                  </span>
                </div>
              ) : isRangeValid ? (
                <div {...stylex.props(text.body, styles.check, styles.checkPending)}>
                  <span {...stylex.props(styles.checkIcon)}>
                    <LoaderCircle aria-hidden {...stylex.props(styles.spin)} />
                  </span>
                  <span>检查中…</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <PurposeField
        inputRef={purposeRef}
        value={values.title}
        onValueChange={(next) => form.setFieldValue("title", next)}
        error={titleError}
        placeholder={isBlock ? "如：消杀、考试" : undefined}
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
                label="星期"
                values={values.weekdays}
                options={WEEKDAY_OPTIONS}
                onValuesChange={(next) => form.setFieldValue("weekdays", next)}
              />
              {values.weekdays.length === 0 ? <Notice tone="warning">至少选一天</Notice> : null}
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
                label="次数"
                value={values.count}
                min={2}
                max={Math.max(2, room.rules.recurringMaxWeeks)}
                unit="次"
                onValueChange={(next) => form.setFieldValue("count", next)}
              />
            ) : (
              <DatePicker
                label="截止日期"
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
          size="lg"
          isFullWidth
          isLoading={isBusy}
          icon={values.isRepeat ? <Repeat aria-hidden /> : <CalendarCheck aria-hidden />}
          disabled={
            !isRangeValid ||
            (values.isRepeat
              ? seriesOverrides.willBook === 0 || values.weekdays.length === 0
              : violations.length > 0 || blockingConflict !== undefined)
          }
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Status line under the conflict panel once a suggestion is applied.
 *
 * @param props - Status props.
 * @param props.label - The applied date and time.
 * @param props.state - `ok`, `pending`, or a rule violation message.
 * @param props.confirmText - What the user does next to confirm.
 * @returns The status line.
 */
function AppliedStatus({ label, state, confirmText }: { label: string; state: string; confirmText: string }) {
  const tone =
    state === "ok"
      ? styles.panelStatusOk
      : state === "pending"
        ? styles.panelStatusPending
        : styles.panelStatusWarn;

  const message =
    state === "ok" ? `，可以约。${confirmText}` : state === "pending" ? "，检查中…" : `：${state}`;

  return (
    <p {...stylex.props(text.body, styles.panelStatus, tone)}>
      <span {...stylex.props(styles.panelStatusIcon)}>
        {state === "ok" ? (
          <Check aria-hidden />
        ) : state === "pending" ? (
          <LoaderCircle aria-hidden {...stylex.props(styles.spin)} />
        ) : (
          <CircleAlert aria-hidden />
        )}
      </span>
      <span>
        已换到 {label}
        {message}
      </span>
    </p>
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
    { value: "", label: "自己" },
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
            help={
              <HelpHint topic="不可预约时段">
                用于消杀、考试等。只检查是否和已有预约冲突，不受开放时间和时长限制。
              </HelpHint>
            }
            isChecked={values.kind === "block"}
            onCheckedChange={(isChecked) => onKindChange(isChecked ? "block" : "normal")}
          />
          {values.kind === "block" ? null : (
            <ComboboxField
              label="代人预约"
              value={values.onBehalfOf}
              options={options}
              placeholder="搜索姓名"
              emptyText="名单里没有这个人"
              onValueChange={onBehalfChange}
            />
          )}
        </Stack>
      </Disclosure>
    </Card>
  );
}
