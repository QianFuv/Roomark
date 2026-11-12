/**
 * Recurring booking preview: every occurrence with its status. Conflicts default to 跳过; tapping
 * a suggestion moves that occurrence, and the submit count follows the choices.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Check, CircleSlash, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api, errorMessage, problemStatus } from "../../api/client";
import {
  initialChoices,
  reconcileChoices,
  summarize,
  summaryLine,
  toOverrides,
  type ChoiceMap,
  type Occurrence,
  type OccurrenceChoice,
  type SeriesOverride,
  type SeriesRule,
} from "../../lib/recurring";
import { formatClockRange, formatDateLabel, todayDate } from "../../lib/time";
import { colors, fonts } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Card, Notice, Skeleton, Stack } from "../../ui/layout";
import { requestSession } from "../identity/identity";
import { SuggestionCard, SuggestionGrid, SuggestionOption } from "./suggestion-list";

const styles = stylex.create({
  header: { color: colors.text, fontSize: fonts.sizeMd, fontVariantNumeric: "tabular-nums", fontWeight: 700 },
  list: { display: "flex", flexDirection: "column" },
  row: {
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBlock: 10,
  },
  line: { alignItems: "center", display: "flex", gap: 10, minHeight: 32 },
  when: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    fontSize: fonts.sizeMd,
    fontVariantNumeric: "tabular-nums",
    gap: 1,
    minWidth: 0,
  },
  whenDate: { fontWeight: 600 },
  whenTime: { color: colors.textMuted, fontSize: fonts.sizeSm },
  whenSkipped: { color: colors.textSubtle, textDecoration: "line-through" },
  status: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: fonts.sizeSm,
    fontWeight: 600,
    gap: 4,
  },
  ok: { color: colors.free },
  bad: { color: colors.busy },
  skipped: { color: colors.textSubtle },
  moved: { color: colors.primaryText },
  detail: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.5 },
  toggle: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: fonts.sans,
    fontSize: fonts.sizeSm,
    fontWeight: 600,
    minHeight: 40,
    minWidth: 44,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 8,
  },
});

/** Props of {@link RecurringPreview}. */
export interface RecurringPreviewProps {
  slug: string;
  rule: SeriesRule;
  onChoicesChange: (selection: { overrides: SeriesOverride[]; willBook: number }) => void;
}

/**
 * Preview list for a recurring rule.
 *
 * @param props - Preview props.
 * @returns The preview.
 */
export function RecurringPreview({ slug, rule, onChoicesChange }: RecurringPreviewProps) {
  const [debouncedKey] = useDebouncedValue(JSON.stringify(rule), { wait: 300 });
  // JUSTIFICATION: the key is JSON.stringify of a SeriesRule, debounced as a string so edits settle first.
  const debouncedRule = JSON.parse(debouncedKey) as SeriesRule;

  const preview = api.useQuery(
    "post",
    "/api/rooms/{slug}/series/preview",
    { params: { path: { slug } }, body: { rule: debouncedRule } },
    { placeholderData: keepPreviousData, staleTime: 0 },
  );

  const occurrences = preview.data?.occurrences ?? undefined;
  const [choices, setChoices] = useState<ChoiceMap>(new Map());
  const [seenPreview, setSeenPreview] = useState<readonly Occurrence[]>();

  if (occurrences !== undefined && occurrences !== seenPreview) {
    setSeenPreview(occurrences);
    setChoices((previous) =>
      previous.size === 0 ? initialChoices(occurrences) : reconcileChoices(previous, occurrences),
    );
  }

  const list = occurrences ?? [];
  const today = todayDate();
  const summary = summarize(list, choices);

  useEffect(() => {
    const current = occurrences ?? [];

    onChoicesChange({
      overrides: toOverrides(current, choices),
      willBook: summarize(current, choices).willBook,
    });
  }, [choices, occurrences, onChoicesChange]);

  if (preview.isError && occurrences === undefined) {
    if (problemStatus(preview.error) === 401) {
      return (
        <Notice tone="info" title="登录后查看每一次的安排">
          <Button
            variant="primary"
            onClick={() => {
              void requestSession(slug).then((session) => {
                if (session !== undefined) void preview.refetch();
              });
            }}
          >
            登录
          </Button>
        </Notice>
      );
    }

    return <Notice tone="busy">{errorMessage(preview.error)}</Notice>;
  }

  if (occurrences === undefined) {
    return (
      <Card>
        <Stack gap="sm">
          <Skeleton height={20} width="60%" />
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </Stack>
      </Card>
    );
  }

  /**
   * Update one occurrence's choice.
   *
   * @param date - Occurrence date.
   * @param choice - New choice.
   */
  function choose(date: string, choice: OccurrenceChoice): void {
    setChoices((previous) => new Map(previous).set(date, choice));
  }

  return (
    <Card as="section" ariaLabel="重复预约预览">
      <p aria-live="polite" {...stylex.props(styles.header)}>
        {summaryLine(summary)}
      </p>
      <ul {...stylex.props(styles.list)}>
        {list.map((occurrence) => {
          const choice = choices.get(occurrence.date) ?? { action: "skip" };
          const isSkipped = choice.action === "skip";
          const label = `${formatDateLabel(occurrence.date)} ${formatClockRange(occurrence.start, occurrence.end)}`;

          return (
            <li key={occurrence.date} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.line)}>
                <span {...stylex.props(styles.when, isSkipped && styles.whenSkipped)}>
                  <span {...stylex.props(styles.whenDate)}>{formatDateLabel(occurrence.date)}</span>
                  <span {...stylex.props(styles.whenTime)}>
                    {formatClockRange(occurrence.start, occurrence.end)}
                  </span>
                </span>
                {occurrence.status === "ok" ? (
                  <>
                    <span {...stylex.props(styles.status, isSkipped ? styles.skipped : styles.ok)}>
                      {isSkipped ? <CircleSlash size={16} aria-hidden /> : <Check size={16} aria-hidden />}
                      {isSkipped ? "跳过" : "可约"}
                    </span>
                    <button
                      type="button"
                      aria-pressed={isSkipped}
                      aria-label={`${isSkipped ? "恢复" : "跳过"} ${label}`}
                      onClick={() =>
                        choose(occurrence.date, isSkipped ? { action: "book" } : { action: "skip" })
                      }
                      {...stylex.props(styles.toggle)}
                    >
                      {isSkipped ? "恢复" : "跳过"}
                    </button>
                  </>
                ) : choice.action === "move" ? (
                  <span {...stylex.props(styles.status, styles.moved)}>
                    <Check size={16} aria-hidden />
                    已换时间
                  </span>
                ) : (
                  <span {...stylex.props(styles.status, styles.bad)}>
                    <X size={16} aria-hidden />
                    {occurrence.status === "conflict" ? "冲突" : "不可约"}
                  </span>
                )}
              </div>
              {occurrence.status === "conflict" && occurrence.conflict !== undefined ? (
                <>
                  <span {...stylex.props(styles.detail)}>
                    {formatClockRange(
                      occurrence.conflict.conflictWith.start,
                      occurrence.conflict.conflictWith.end,
                    )}{" "}
                    已被{occurrence.conflict.conflictWith.name}约了
                  </span>
                  <SuggestionGrid ariaLabel={`${formatDateLabel(occurrence.date)}怎么处理`}>
                    {(occurrence.conflict.suggestions ?? []).map((suggestion) => (
                      <SuggestionCard
                        key={`${suggestion.start}-${suggestion.end}`}
                        suggestion={suggestion}
                        today={today}
                        isSelected={
                          choice.action === "move" &&
                          choice.start === suggestion.start &&
                          choice.end === suggestion.end
                        }
                        onSelect={() =>
                          choose(occurrence.date, {
                            action: "move",
                            start: suggestion.start,
                            end: suggestion.end,
                          })
                        }
                      />
                    ))}
                    <SuggestionOption
                      time="跳过这次"
                      ariaLabel={`跳过${formatDateLabel(occurrence.date)}这次`}
                      isSelected={isSkipped}
                      onSelect={() => choose(occurrence.date, { action: "skip" })}
                    />
                  </SuggestionGrid>
                </>
              ) : null}
              {occurrence.status === "violation" ? (
                <span {...stylex.props(styles.detail)}>
                  {(occurrence.violations ?? []).map((violation) => violation.message).join("；")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
