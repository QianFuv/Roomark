/**
 * Table rendering for TanStack Table v9 models (core features only).
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { tableFeatures, type ReactTable, type RowData } from "@tanstack/react-table";

import { colors, fonts, radii } from "../styles/tokens.stylex";

/** Feature set shared by the admin tables. */
export const CORE_FEATURES = tableFeatures({});

const styles = stylex.create({
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    overflowX: "auto",
  },
  table: { borderCollapse: "collapse", fontSize: fonts.sizeMd, minWidth: "100%", whiteSpace: "nowrap" },
  caption: {
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  headCell: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
    fontSize: fonts.sizeSm,
    fontWeight: 600,
    paddingBlock: 10,
    paddingInline: 12,
    textAlign: "start",
  },
  row: { borderTopColor: colors.border, borderTopStyle: "solid", borderTopWidth: 1 },
  cell: {
    color: colors.text,
    fontVariantNumeric: "tabular-nums",
    paddingBlock: 8,
    paddingInline: 12,
    verticalAlign: "middle",
  },
  empty: { color: colors.textMuted, paddingBlock: 28, textAlign: "center" },
});

/** Props of {@link DataTable}. */
export interface DataTableProps<TData extends RowData> {
  table: ReactTable<typeof CORE_FEATURES, TData>;
  caption: string;
  emptyText: string;
}

/**
 * Render a table model as a semantic HTML table.
 *
 * @param props - Table props.
 * @returns The table.
 */
export function DataTable<TData extends RowData>({ table, caption, emptyText }: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div tabIndex={0} role="group" aria-label={caption} {...stylex.props(styles.frame)}>
      <table {...stylex.props(styles.table)}>
        <caption {...stylex.props(styles.caption)}>{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} scope="col" {...stylex.props(styles.headCell)}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} {...stylex.props(styles.empty)}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} {...stylex.props(styles.row)}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} {...stylex.props(styles.cell)}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
