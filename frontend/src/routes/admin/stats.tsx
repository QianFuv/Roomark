/**
 * Statistics: filters (room, period presets, role), overview with previous-period comparison,
 * utilization trend, weekday × hour heatmap, habits, demand gap, cancellations, people ranking
 * and CSV export.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { keepPreviousData } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download } from "lucide-react";
import { useState, type ReactNode } from "react";

import { api, authHeaders, errorMessage, serverUrl } from "../../api/client";
import { HistogramChart, RankingChart, ShareChart, TrendChart } from "../../features/stats/charts";
import { HeatmapGrid } from "../../features/room/heatmap";
import {
  DURATION_LABELS,
  LEAD_TIME_LABELS,
  compareMetric,
  conflictSlotLabel,
  deltaText,
  formatHours,
  formatPercent,
  labelBuckets,
  presetRange,
  previousRange,
  rangeLabel,
  singleShare,
  trendRows,
  type DateRange,
  type RangePreset,
  type Stats,
} from "../../lib/stats";
import { todayDate } from "../../lib/time";
import { platform } from "../../platform/platform";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Disclosure, TabView } from "../../ui/controls";
import { SelectField, TextField } from "../../ui/field";
import { Card, EmptyState, Notice, PageHeader, Row, Section, Skeleton, Stack } from "../../ui/layout";
import { Segmented } from "../../ui/segmented";
import { notify } from "../../ui/toast";

export const Route = createFileRoute("/admin/stats")({ component: StatsPage });

type Role = "all" | "teacher" | "student" | "other";

const styles = stylex.create({
  filters: {
    alignItems: "end",
    display: "grid",
    gap: 12,
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [media.tablet]: "repeat(2, minmax(0, 1fr))",
      [media.desktop]: "220px auto auto 1fr",
    },
  },
  filterGroup: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  filterLabel: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
  customRange: { display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: 420 },
  caption: { color: colors.textMuted, fontSize: fonts.sizeSm, fontVariantNumeric: "tabular-nums" },
  kpis: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [media.desktop]: "repeat(4, minmax(0, 1fr))",
    },
  },
  kpi: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 112,
    padding: 16,
  },
  kpiLabel: { color: colors.textMuted, fontSize: fonts.sizeSm, fontWeight: 600 },
  kpiValue: {
    color: colors.text,
    fontSize: { default: 26, [media.tablet]: 32 },
    fontVariantNumeric: "tabular-nums",
    fontWeight: 800,
    lineHeight: 1.1,
  },
  kpiUnit: { color: colors.textMuted, fontSize: fonts.sizeMd, fontWeight: 600, marginInlineStart: 4 },
  delta: {
    alignItems: "center",
    display: "inline-flex",
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    gap: 2,
  },
  deltaUp: { color: colors.free },
  deltaDown: { color: colors.busy },
  deltaFlat: { color: colors.textMuted },
  deltaPrevious: { color: colors.textSubtle, fontWeight: 500, marginInlineStart: 6 },
  twoColumns: {
    alignItems: "start",
    display: "grid",
    gap: 16,
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.desktop]: "repeat(2, minmax(0, 1fr))" },
  },
  metricGrid: { display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  metric: { display: "flex", flexDirection: "column", gap: 2 },
  metricValue: {
    color: colors.text,
    fontSize: fonts.sizeXl,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 800,
  },
  metricLabel: { color: colors.textMuted, fontSize: fonts.sizeSm },
  slotList: { display: "flex", flexDirection: "column", gap: 6 },
  slotRow: {
    alignItems: "center",
    display: "grid",
    fontSize: fonts.sizeMd,
    gap: 10,
    gridTemplateColumns: "80px 1fr 48px",
  },
  slotTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    height: 10,
    overflow: "hidden",
  },
  slotFill: { backgroundColor: colors.chart2, borderRadius: radii.pill, height: "100%" },
  slotCount: { color: colors.textMuted, fontVariantNumeric: "tabular-nums", textAlign: "end" },
  dataTable: {
    borderCollapse: "collapse",
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    width: "100%",
  },
  dataCell: {
    borderTopColor: colors.border,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBlock: 6,
    textAlign: "start",
  },
  subTitle: { color: colors.text, fontSize: fonts.sizeMd, fontWeight: 700 },
  width: (percent: number) => ({ width: `${percent}%` }),
});

/**
 * Statistics page.
 *
 * @returns The page.
 */
function StatsPage() {
  const today = todayDate();
  const rooms = api.useQuery("get", "/api/admin/rooms");
  const [room, setRoom] = useState("");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [custom, setCustom] = useState<DateRange>(presetRange("month", today));
  const [role, setRole] = useState<Role>("all");
  const [isExporting, setIsExporting] = useState(false);
  const range = preset === "custom" ? custom : presetRange(preset, today);
  const isRangeValid = range.from <= range.to;
  const query = { ...(room === "" ? {} : { room }), from: range.from, to: range.to, role };

  const stats = api.useQuery(
    "get",
    "/api/admin/stats",
    { params: { query } },
    { placeholderData: keepPreviousData, enabled: isRangeValid },
  );

  /** Download the booking rows of the current filter as CSV. */
  async function exportCsv(): Promise<void> {
    setIsExporting(true);

    try {
      const search = new URLSearchParams({
        ...(room === "" ? {} : { room }),
        from: range.from,
        to: range.to,
        role,
      });

      const response = await fetch(serverUrl(`/api/admin/stats/export.csv?${search.toString()}`), {
        headers: authHeaders(),
      });

      if (!response.ok) throw new Error(String(response.status));

      const result = await platform().saveFile(
        `会议室预约-${range.from}-${range.to}.csv`,
        "text/csv",
        await response.blob(),
      );

      if (result.saved) notify("success", "已导出 CSV", result.path);
    } catch {
      notify("error", "导出失败", "请稍后重试");
    } finally {
      setIsExporting(false);
    }
  }

  const previous = previousRange(range);

  return (
    <Stack gap="lg">
      <Row gap="md" isSpread>
        <PageHeader title="统计" />
        <Button
          icon={<Download size={18} aria-hidden />}
          isLoading={isExporting}
          disabled={!isRangeValid}
          onClick={() => void exportCsv()}
        >
          导出 CSV
        </Button>
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
        <div {...stylex.props(styles.filterGroup)}>
          <span {...stylex.props(styles.filterLabel)}>时间</span>
          <Segmented
            label="时间范围"
            value={preset}
            options={[
              { value: "week", label: "本周" },
              { value: "month", label: "本月" },
              { value: "semester", label: "本学期" },
              { value: "custom", label: "自定义" },
            ]}
            onValueChange={(next) => {
              if (next === "custom" && preset !== "custom") setCustom(range);
              setPreset(next);
            }}
          />
        </div>
        <div {...stylex.props(styles.filterGroup)}>
          <span {...stylex.props(styles.filterLabel)}>身份</span>
          <Segmented
            label="身份"
            value={role}
            options={[
              { value: "all", label: "全部" },
              { value: "teacher", label: "老师" },
              { value: "student", label: "学生" },
              { value: "other", label: "其他" },
            ]}
            onValueChange={setRole}
          />
        </div>
      </div>
      {preset === "custom" ? (
        <div {...stylex.props(styles.customRange)}>
          <TextField
            label="从"
            type="date"
            value={custom.from}
            max={custom.to}
            onValueChange={(from) => setCustom({ ...custom, from })}
          />
          <TextField
            label="到"
            type="date"
            value={custom.to}
            min={custom.from}
            onValueChange={(to) => setCustom({ ...custom, to })}
          />
        </div>
      ) : null}
      <p {...stylex.props(styles.caption)}>
        {rangeLabel(range)} · 对比上期 {rangeLabel(previous)}
      </p>
      {!isRangeValid ? (
        <Notice tone="warning">开始日期需要早于结束日期</Notice>
      ) : stats.data === undefined ? (
        stats.isError ? (
          <Notice tone="busy">{errorMessage(stats.error)}</Notice>
        ) : (
          <StatsSkeleton />
        )
      ) : (
        <StatsBody stats={stats.data} />
      )}
    </Stack>
  );
}

/**
 * Placeholder with the final layout's proportions.
 *
 * @returns The skeleton.
 */
function StatsSkeleton() {
  return (
    <Stack gap="lg">
      <div {...stylex.props(styles.kpis)}>
        <Skeleton height={112} />
        <Skeleton height={112} />
        <Skeleton height={112} />
        <Skeleton height={112} />
      </div>
      <Skeleton height={320} />
      <Skeleton height={300} />
    </Stack>
  );
}

/**
 * KPI tile with delta against the previous period.
 *
 * @param props - Tile props.
 * @param props.label - Metric name.
 * @param props.value - Formatted value.
 * @param props.unit - Unit after the value.
 * @param props.current - Current raw value.
 * @param props.previous - Previous raw value.
 * @param props.previousText - Formatted previous value.
 * @returns The tile.
 */
function Kpi({
  label,
  value,
  unit,
  current,
  previous,
  previousText,
}: {
  label: string;
  value: string;
  unit?: string;
  current: number;
  previous: number;
  previousText: string;
}) {
  const delta = compareMetric(current, previous);
  const hasComparison = delta.ratio !== undefined || delta.direction === "flat";

  const icon =
    delta.direction === "up" ? (
      <ArrowUpRight size={16} aria-hidden />
    ) : delta.direction === "down" ? (
      <ArrowDownRight size={16} aria-hidden />
    ) : (
      <ArrowRight size={16} aria-hidden />
    );

  return (
    <div {...stylex.props(styles.kpi)}>
      <span {...stylex.props(styles.kpiLabel)}>{label}</span>
      <span {...stylex.props(styles.kpiValue)}>
        {value}
        {unit === undefined ? null : <span {...stylex.props(styles.kpiUnit)}>{unit}</span>}
      </span>
      <span
        {...stylex.props(
          styles.delta,
          delta.direction === "up"
            ? styles.deltaUp
            : delta.direction === "down"
              ? styles.deltaDown
              : styles.deltaFlat,
        )}
      >
        {hasComparison ? icon : null}
        {deltaText(delta)}
        <span {...stylex.props(styles.deltaPrevious)}>上期 {previousText}</span>
      </span>
    </div>
  );
}

/**
 * Small labeled number.
 *
 * @param props - Metric props.
 * @param props.label - Name.
 * @param props.children - Value.
 * @returns The metric.
 */
function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.metric)}>
      <span {...stylex.props(styles.metricValue)}>{children}</span>
      <span {...stylex.props(styles.metricLabel)}>{label}</span>
    </div>
  );
}

/**
 * All statistics sections.
 *
 * @param props - Body props.
 * @param props.stats - Statistics response.
 * @returns The sections.
 */
function StatsBody({ stats }: { stats: Stats }) {
  const [rankBy, setRankBy] = useState<"hours" | "count">("hours");
  const { overview, previous, habits, demandGap, cancellations, peopleRanking } = stats;
  const trend = trendRows(stats.trend, stats.granularity);
  const topSlots = demandGap.topSlots ?? [];
  const maxSlot = Math.max(1, ...topSlots.map((slot) => slot.count));

  const byHours = (peopleRanking.byUsedHours ?? []).slice(0, 10).map((entry) => ({
    name: entry.person.name,
    value: Math.round(entry.usedHours * 10) / 10,
  }));

  const byCount = (peopleRanking.byBookingCount ?? []).slice(0, 10).map((entry) => ({
    name: entry.person.name,
    value: entry.bookings,
  }));

  const total = habits.single + habits.recurring;

  if (overview.bookings === 0 && previous.bookings === 0) {
    return <EmptyState title="这个范围内还没有预约">换一个时间范围或房间试试。</EmptyState>;
  }

  return (
    <Stack gap="lg">
      <section aria-label="概览" {...stylex.props(styles.kpis)}>
        <Kpi
          label="预约次数"
          value={String(overview.bookings)}
          unit="次"
          current={overview.bookings}
          previous={previous.bookings}
          previousText={`${previous.bookings} 次`}
        />
        <Kpi
          label="实际使用时长"
          value={formatHours(overview.usedHours)}
          unit="小时"
          current={overview.usedHours}
          previous={previous.usedHours}
          previousText={`${formatHours(previous.usedHours)} 小时`}
        />
        <Kpi
          label="利用率"
          value={formatPercent(overview.utilization, true)}
          current={overview.utilization}
          previous={previous.utilization}
          previousText={formatPercent(previous.utilization, true)}
        />
        <Kpi
          label="使用人数"
          value={String(overview.distinctPeople)}
          unit="人"
          current={overview.distinctPeople}
          previous={previous.distinctPeople}
          previousText={`${previous.distinctPeople} 人`}
        />
      </section>

      <Card as="section" ariaLabel="利用率趋势">
        <Section title="利用率趋势" aside={stats.granularity === "week" ? "按周" : "按天"}>
          {trend.length === 0 ? <Notice tone="info">暂无数据</Notice> : <TrendChart rows={trend} />}
          <Disclosure title="数据表">
            <table {...stylex.props(styles.dataTable)}>
              <thead>
                <tr>
                  <th scope="col" {...stylex.props(styles.dataCell)}>
                    {stats.granularity === "week" ? "周" : "日期"}
                  </th>
                  <th scope="col" {...stylex.props(styles.dataCell)}>
                    本期
                  </th>
                  <th scope="col" {...stylex.props(styles.dataCell)}>
                    上期
                  </th>
                </tr>
              </thead>
              <tbody>
                {(stats.trend ?? []).map((point, index) => (
                  <tr key={point.date}>
                    <td {...stylex.props(styles.dataCell)}>{trend[index * 2]?.label}</td>
                    <td {...stylex.props(styles.dataCell)}>{formatPercent(point.utilization, true)}</td>
                    <td {...stylex.props(styles.dataCell)}>
                      {formatPercent(point.previousUtilization, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Disclosure>
        </Section>
      </Card>

      <Card as="section" ariaLabel="时段热力图">
        <Section title="时段热力图" aside="星期 × 小时的占用比例">
          <HeatmapGrid
            matrix={stats.heatmap}
            caption="各星期各小时的占用比例"
            lowLabel="0%"
            highLabel="100%"
          />
        </Section>
      </Card>

      <div {...stylex.props(styles.twoColumns)}>
        <Card as="section" ariaLabel="使用习惯">
          <Section title="使用习惯">
            <span {...stylex.props(styles.subTitle)}>单次时长</span>
            <HistogramChart rows={labelBuckets(habits.duration, DURATION_LABELS)} label="单次预约时长分布" />
            <span {...stylex.props(styles.subTitle)}>提前多久预约</span>
            <HistogramChart rows={labelBuckets(habits.leadTime, LEAD_TIME_LABELS)} label="提前预约天数分布" />
            <span {...stylex.props(styles.subTitle)}>
              单次与重复（单次占 {formatPercent(singleShare(habits.single, habits.recurring))}）
            </span>
            {total === 0 ? (
              <Notice tone="info">暂无数据</Notice>
            ) : (
              <ShareChart single={habits.single} recurring={habits.recurring} />
            )}
          </Section>
        </Card>
        <Stack gap="lg">
          <Card as="section" ariaLabel="需求缺口">
            <Section title="需求缺口" aside="想约却撞上已有预约">
              <div {...stylex.props(styles.metricGrid)}>
                <Metric label="冲突次数">{demandGap.conflictCount}</Metric>
                <Metric label="冲突后采纳建议时段">
                  {formatPercent(demandGap.suggestionAcceptanceRate)}
                </Metric>
              </div>
              <span {...stylex.props(styles.subTitle)}>最常冲突的时段</span>
              {topSlots.length === 0 ? (
                <Notice tone="info">没有冲突</Notice>
              ) : (
                <ul {...stylex.props(styles.slotList)}>
                  {topSlots.map((slot) => (
                    <li key={`${slot.weekday}-${slot.hour}`} {...stylex.props(styles.slotRow)}>
                      <span>{conflictSlotLabel(slot)}</span>
                      <span aria-hidden {...stylex.props(styles.slotTrack)}>
                        <span
                          {...stylex.props(styles.slotFill, styles.width((slot.count / maxSlot) * 100))}
                        />
                      </span>
                      <span {...stylex.props(styles.slotCount)}>{slot.count} 次</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>
          <Card as="section" ariaLabel="取消与提前结束">
            <Section title="取消与提前结束">
              <div {...stylex.props(styles.metricGrid)}>
                <Metric label="取消率">{formatPercent(cancellations.cancelRate, true)}</Metric>
                <Metric label="临时取消（开始前 1 小时内）">
                  {formatPercent(cancellations.lastMinuteRate, true)}
                </Metric>
                <Metric label="提前结束次数">{cancellations.earlyEndCount}</Metric>
                <Metric label="平均释放时长">
                  {Math.round(cancellations.averageReleasedMinutes)}
                  <span {...stylex.props(styles.kpiUnit)}>分钟</span>
                </Metric>
              </div>
            </Section>
          </Card>
        </Stack>
      </div>

      <Card as="section" ariaLabel="人员排行">
        <Section title="人员排行" aside="前 10 名">
          <TabView
            label="排行依据"
            value={rankBy}
            onValueChange={setRankBy}
            items={[
              {
                value: "hours",
                label: "按使用时长",
                content:
                  byHours.length === 0 ? (
                    <Notice tone="info">暂无数据</Notice>
                  ) : (
                    <RankingChart rows={byHours} unit="小时" label="使用时长排行" />
                  ),
              },
              {
                value: "count",
                label: "按预约次数",
                content:
                  byCount.length === 0 ? (
                    <Notice tone="info">暂无数据</Notice>
                  ) : (
                    <RankingChart rows={byCount} unit="次" label="预约次数排行" />
                  ),
              },
            ]}
          />
        </Section>
      </Card>
    </Stack>
  );
}
