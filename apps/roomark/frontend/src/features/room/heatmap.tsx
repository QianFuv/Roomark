/**
 * Day × hour occupancy heatmap with square cells (the room's weekly "会议热力图" and the
 * statistics heatmap). The room puts days in columns like the calendar; statistics keep days in
 * rows so fourteen hours fit across a wide card.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";

import { formatPercent, heatRows, type HeatCell } from "../../lib/stats";
import { minutesToClock } from "../../lib/time";
import { colors, fonts, radii, space } from "../../styles/tokens.stylex";
import { text } from "../../ui/typography";

/** Gap between cells in pixels. */
const CELL_GAP = 4;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    marginInline: "auto",
    minWidth: 0,
    position: "relative",
    width: "100%",
  },
  table: {
    borderCollapse: "separate",
    borderSpacing: CELL_GAP,
    tableLayout: "fixed",
    width: "100%",
  },
  maxWidth: (pixels: number) => ({ maxWidth: pixels }),
  labelColumn: (pixels: number) => ({ width: pixels }),
  axis: {
    color: colors.textMuted,
    fontWeight: "inherit",
    padding: 0,
    whiteSpace: "nowrap",
  },
  rowAxis: { paddingInlineEnd: space.xs, textAlign: "end" },
  columnAxis: { height: 20, textAlign: "center", verticalAlign: "bottom" },
  dayHead: { color: colors.text },
  todayHead: { color: colors.primaryText },
  dayButton: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderRadius: radii.small,
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    fontFamily: fonts.sans,
    minHeight: 28,
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focusRing}` },
    padding: 0,
    width: "100%",
  },
  todayMark: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    color: colors.onPrimary,
    display: "inline-block",
    minWidth: 22,
    textAlign: "center",
  },
  cell: { padding: 0, position: "relative" },
  square: { aspectRatio: "1", borderRadius: 4, width: "100%" },
  selectable: {
    cursor: "pointer",
    outline: { default: "none", ":hover": `2px solid ${colors.focusRing}` },
    outlineOffset: 1,
  },
  level0: { backgroundColor: colors.heat0 },
  level1: { backgroundColor: colors.heat1 },
  level2: { backgroundColor: colors.heat2 },
  level3: { backgroundColor: colors.heat3 },
  level4: { backgroundColor: colors.heat4 },
  legend: {
    alignItems: "center",
    alignSelf: "flex-end",
    color: colors.textMuted,
    display: "flex",
    gap: space.xs,
  },
  legendSwatch: { borderRadius: 3, display: "inline-block", height: 10, width: 10 },
  srOnly: {
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});

const LEVEL_STYLES = [styles.level0, styles.level1, styles.level2, styles.level3, styles.level4] as const;

/** One day of {@link HeatmapGrid}. */
export interface HeatmapDay {
  /** Short visible label such as `三`. */
  label: string;
  /** Name used in each cell's text alternative, such as `周三`. */
  name: string;
  /** Accessible name of the day action, when days are selectable. */
  actionLabel?: string;
  isHighlighted?: boolean;
}

/** Props of {@link HeatmapGrid}. */
export interface HeatmapGridProps {
  /** Ratios per day, then per hour. */
  matrix: readonly (readonly number[] | null)[] | null | undefined;
  hours: readonly number[];
  days: readonly HeatmapDay[];
  /** `columns`: one column per day (room); `rows`: one row per day (statistics). */
  dayAxis: "columns" | "rows";
  /** Largest cell edge in pixels; cells shrink with the container below that. */
  maxCell: number;
  caption: string;
  /** Word before the percentage in each cell's text, such as `已约`. */
  valueLabel: string;
  lowLabel: string;
  highLabel: string;
  /** Open a day (from its header) or a cell (with its hour). */
  onSelect?: (day: number, hour?: number) => void;
}

/**
 * Accessible heatmap table with square cells. Every cell carries a text alternative such as
 * `周三 14:00，已约 75%`; selectable days expose a button in their header.
 *
 * @param props - Grid props.
 * @returns The heatmap.
 */
export function HeatmapGrid({
  matrix,
  hours,
  days,
  dayAxis,
  maxCell,
  caption,
  valueLabel,
  lowLabel,
  highLabel,
  onSelect,
}: HeatmapGridProps) {
  const cells = heatRows(matrix, days.length, hours);
  const labelWidth = dayAxis === "columns" ? 44 : 24;
  const columnCount = dayAxis === "columns" ? days.length : hours.length;
  const maxWidth = labelWidth + columnCount * (maxCell + CELL_GAP) + CELL_GAP * 2;
  const firstHour = hours[0] ?? 0;

  /**
   * One square cell.
   *
   * @param day - Day index.
   * @param cell - The cell.
   * @returns The table cell.
   */
  function renderCell(day: number, cell: HeatCell) {
    const text = `${days[day]?.name ?? ""} ${minutesToClock(cell.hour * 60)}，${valueLabel} ${formatPercent(cell.ratio)}`;

    return (
      <td
        key={`${day}-${cell.hour}`}
        title={text}
        onClick={onSelect === undefined ? undefined : () => onSelect(day, cell.hour)}
        {...stylex.props(styles.cell)}
      >
        <div
          {...stylex.props(
            styles.square,
            LEVEL_STYLES[cell.level],
            onSelect !== undefined && styles.selectable,
          )}
        />
        <span {...stylex.props(styles.srOnly)}>{text}</span>
      </td>
    );
  }

  /**
   * Header content of a day.
   *
   * @param day - The day.
   * @param index - Day index.
   * @returns The label or button.
   */
  function dayLabel(day: HeatmapDay, index: number) {
    const label =
      day.isHighlighted === true && dayAxis === "columns" ? (
        <span {...stylex.props(styles.todayMark)}>{day.label}</span>
      ) : (
        day.label
      );

    if (onSelect === undefined) return label;

    return (
      <button
        type="button"
        aria-label={day.actionLabel ?? day.name}
        onClick={() => onSelect(index)}
        {...stylex.props(styles.dayButton)}
      >
        {label}
      </button>
    );
  }

  return (
    <div {...stylex.props(styles.root, styles.maxWidth(maxWidth))}>
      <table {...stylex.props(text.meta, styles.table)}>
        <caption {...stylex.props(styles.srOnly)}>{caption}</caption>
        <colgroup>
          <col {...stylex.props(styles.labelColumn(labelWidth))} />
        </colgroup>
        {dayAxis === "columns" ? (
          <>
            <thead>
              <tr>
                <th scope="col" {...stylex.props(styles.axis)}>
                  <span {...stylex.props(styles.srOnly)}>时间</span>
                </th>
                {days.map((day, index) => (
                  <th
                    key={day.name}
                    scope="col"
                    {...stylex.props(
                      styles.axis,
                      styles.columnAxis,
                      styles.dayHead,
                      day.isHighlighted === true && styles.todayHead,
                    )}
                  >
                    {dayLabel(day, index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((hour, column) => (
                <tr key={hour}>
                  <th scope="row" {...stylex.props(styles.axis, styles.rowAxis)}>
                    {minutesToClock(hour * 60)}
                  </th>
                  {days.map((_day, index) => {
                    const cell = cells[index]?.[column];

                    return cell === undefined ? null : renderCell(index, cell);
                  })}
                </tr>
              ))}
            </tbody>
          </>
        ) : (
          <>
            <thead>
              <tr>
                <th scope="col" {...stylex.props(styles.axis)}>
                  <span {...stylex.props(styles.srOnly)}>星期</span>
                </th>
                {hours.map((hour) => (
                  <th key={hour} scope="col" {...stylex.props(styles.axis, styles.columnAxis)}>
                    {(hour - firstHour) % 2 === 0 ? (
                      hour
                    ) : (
                      <span {...stylex.props(styles.srOnly)}>{hour}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => (
                <tr key={day.name}>
                  <th
                    scope="row"
                    {...stylex.props(
                      styles.axis,
                      styles.rowAxis,
                      styles.dayHead,
                      day.isHighlighted === true && styles.todayHead,
                    )}
                  >
                    {dayLabel(day, index)}
                  </th>
                  {(cells[index] ?? []).map((cell) => renderCell(index, cell))}
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
      <div aria-hidden {...stylex.props(text.meta, styles.legend)}>
        <span>{lowLabel}</span>
        {LEVEL_STYLES.map((levelStyle, index) => (
          <span key={index} {...stylex.props(styles.legendSwatch, levelStyle)} />
        ))}
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
