/**
 * Weekday × hour occupancy heatmap (used for the public "通常空闲时段" and in statistics).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";

import { HEATMAP_FIRST_HOUR, HEATMAP_HOURS, formatPercent, heatCells, type HeatCell } from "../../lib/stats";
import { weekdayLabel } from "../../lib/time";
import { colors, fonts, radii } from "../../styles/tokens.stylex";

const styles = stylex.create({
  wrapper: { overflowX: "auto", paddingBottom: 4 },
  table: {
    borderCollapse: "separate",
    borderSpacing: 3,
    fontSize: fonts.sizeXs,
    minWidth: 340,
    width: "100%",
  },
  corner: { width: 30 },
  hour: { color: colors.textSubtle, fontVariantNumeric: "tabular-nums", fontWeight: 500, textAlign: "start" },
  rowHead: {
    color: colors.textMuted,
    fontWeight: 600,
    paddingInlineEnd: 4,
    textAlign: "start",
    whiteSpace: "nowrap",
  },
  todayHead: { color: colors.primaryText },
  cell: { borderRadius: 4, height: 22, minWidth: 16 },
  level0: { backgroundColor: colors.heat0 },
  level1: { backgroundColor: colors.heat1 },
  level2: { backgroundColor: colors.heat2 },
  level3: { backgroundColor: colors.heat3 },
  level4: { backgroundColor: colors.heat4 },
  legend: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontSize: fonts.sizeXs,
    gap: 6,
    marginTop: 8,
  },
  legendSwatch: { borderRadius: 3, display: "inline-block", height: 12, width: 16 },
  legendSpacer: { flexGrow: 1 },
  srOnly: {
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  frame: { borderRadius: radii.medium, position: "relative" },
});

const LEVEL_STYLES = [styles.level0, styles.level1, styles.level2, styles.level3, styles.level4] as const;

/** Props of {@link HeatmapGrid}. */
export interface HeatmapGridProps {
  matrix: readonly (readonly number[] | null)[] | null | undefined;
  caption: string;
  highlightWeekday?: number;
  lowLabel?: string;
  highLabel?: string;
}

/**
 * Accessible heatmap table: one row per weekday, one column per hour.
 *
 * @param props - Grid props.
 * @returns The table.
 */
export function HeatmapGrid({
  matrix,
  caption,
  highlightWeekday,
  lowLabel = "空闲",
  highLabel = "常被占用",
}: HeatmapGridProps) {
  const cells = heatCells(matrix);

  const rows: HeatCell[][] = Array.from({ length: 7 }, (_unused, index) =>
    cells.filter((cell) => cell.weekday === index + 1),
  );

  const hours = Array.from({ length: HEATMAP_HOURS }, (_unused, index) => HEATMAP_FIRST_HOUR + index);

  return (
    <div {...stylex.props(styles.frame)}>
      <div tabIndex={0} role="group" aria-label={caption} {...stylex.props(styles.wrapper)}>
        <table {...stylex.props(styles.table)}>
          <caption {...stylex.props(styles.srOnly)}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.corner)}>
                <span {...stylex.props(styles.srOnly)}>星期</span>
              </th>
              {hours.map((hour) => (
                <th key={hour} scope="col" {...stylex.props(styles.hour)}>
                  {hour % 2 === 0 ? hour : <span {...stylex.props(styles.srOnly)}>{hour}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <th
                  scope="row"
                  {...stylex.props(styles.rowHead, highlightWeekday === index + 1 && styles.todayHead)}
                >
                  {weekdayLabel(index + 1).replace("周", "")}
                </th>
                {row.map((cell) => (
                  <td
                    key={cell.hour}
                    title={`${weekdayLabel(cell.weekday)} ${cell.hour}:00 · 占用 ${formatPercent(cell.ratio)}`}
                    {...stylex.props(styles.cell, LEVEL_STYLES[cell.level])}
                  >
                    <span {...stylex.props(styles.srOnly)}>{formatPercent(cell.ratio)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div aria-hidden {...stylex.props(styles.legend)}>
        <span>{lowLabel}</span>
        {LEVEL_STYLES.map((levelStyle, index) => (
          <span key={index} {...stylex.props(styles.legendSwatch, levelStyle)} />
        ))}
        <span>{highLabel}</span>
        <span {...stylex.props(styles.legendSpacer)} />
      </div>
    </div>
  );
}
