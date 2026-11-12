/**
 * Day × hour occupancy heatmap (the room's weekly "会议热力图" and the statistics heatmap).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";

import { formatPercent, heatRows } from "../../lib/stats";
import { colors, fonts, radii } from "../../styles/tokens.stylex";

const styles = stylex.create({
  wrapper: { overflowX: "auto", paddingBottom: 4, position: "relative" },
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
  rowButton: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceHover },
    borderRadius: 4,
    borderWidth: 0,
    color: "inherit",
    cursor: "pointer",
    fontFamily: fonts.sans,
    fontSize: "inherit",
    fontWeight: "inherit",
    minHeight: 24,
    minWidth: 24,
    outline: { default: "none", ":focus-visible": `2px solid ${colors.focusRing}` },
    padding: 0,
  },
  cell: { borderRadius: 4, height: 22, minWidth: 16 },
  cellSelectable: {
    cursor: "pointer",
    outline: { default: "none", ":hover": `2px solid ${colors.focusRing}` },
    outlineOffset: -1,
  },
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

/** One row of {@link HeatmapGrid}. */
export interface HeatmapRow {
  /** Short visible label such as `三`. */
  label: string;
  /** Name used in each cell's text alternative, such as `周三`. */
  name: string;
  /** Accessible name of the row action, when rows are selectable. */
  actionLabel?: string;
  isHighlighted?: boolean;
}

/** Props of {@link HeatmapGrid}. */
export interface HeatmapGridProps {
  matrix: readonly (readonly number[] | null)[] | null | undefined;
  hours: readonly number[];
  rows: readonly HeatmapRow[];
  caption: string;
  /** Word before the percentage in each cell's text, such as `已预约`. */
  valueLabel: string;
  lowLabel?: string;
  highLabel?: string;
  /** Open a row (from its header) or a cell (with its hour). */
  onSelect?: (row: number, hour?: number) => void;
}

/**
 * Accessible heatmap table: one row per day, one column per hour. Every cell carries a text
 * alternative such as `周三 14:00 已预约 75%`; selectable rows expose a button in their header.
 *
 * @param props - Grid props.
 * @returns The table.
 */
export function HeatmapGrid({
  matrix,
  hours,
  rows,
  caption,
  valueLabel,
  lowLabel = "空闲",
  highLabel = "已满",
  onSelect,
}: HeatmapGridProps) {
  const cellRows = heatRows(matrix, rows.length, hours);
  const firstHour = hours[0] ?? 0;

  return (
    <div {...stylex.props(styles.frame)}>
      <div tabIndex={0} role="group" aria-label={caption} {...stylex.props(styles.wrapper)}>
        <table {...stylex.props(styles.table)}>
          <caption {...stylex.props(styles.srOnly)}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" {...stylex.props(styles.corner)}>
                <span {...stylex.props(styles.srOnly)}>日期</span>
              </th>
              {hours.map((hour) => (
                <th key={hour} scope="col" {...stylex.props(styles.hour)}>
                  {(hour - firstHour) % 2 === 0 ? hour : <span {...stylex.props(styles.srOnly)}>{hour}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.name}>
                <th
                  scope="row"
                  {...stylex.props(styles.rowHead, row.isHighlighted === true && styles.todayHead)}
                >
                  {onSelect === undefined ? (
                    row.label
                  ) : (
                    <button
                      type="button"
                      aria-label={row.actionLabel ?? row.name}
                      onClick={() => onSelect(rowIndex)}
                      {...stylex.props(styles.rowButton)}
                    >
                      {row.label}
                    </button>
                  )}
                </th>
                {(cellRows[rowIndex] ?? []).map((cell) => {
                  const text = `${row.name} ${String(cell.hour).padStart(2, "0")}:00 ${valueLabel} ${formatPercent(cell.ratio)}`;

                  return (
                    <td
                      key={cell.hour}
                      title={text}
                      onClick={onSelect === undefined ? undefined : () => onSelect(rowIndex, cell.hour)}
                      {...stylex.props(
                        styles.cell,
                        LEVEL_STYLES[cell.level],
                        onSelect !== undefined && styles.cellSelectable,
                      )}
                    >
                      <span {...stylex.props(styles.srOnly)}>{text}</span>
                    </td>
                  );
                })}
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
