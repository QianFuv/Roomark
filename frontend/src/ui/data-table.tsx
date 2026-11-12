/**
 * Table rendering for TanStack Table v9 models (core features only): a semantic table on PC
 * windows, and a stacked list of row cards on phones so nothing scrolls sideways.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { tableFeatures, type ReactTable, type RowData } from "@tanstack/react-table";

import { colors, fonts, radii } from "../styles/tokens.stylex";
import { useLayoutTier } from "./tier";

/** Feature set shared by the admin tables. */
export const CORE_FEATURES = tableFeatures({});

const styles = stylex.create({
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  table: { borderCollapse: "collapse", fontSize: fonts.sizeMd, width: "100%" },
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
  list: { display: "flex", flexDirection: "column", gap: 8, listStyle: "none", margin: 0, padding: 0 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    paddingBlock: 10,
    paddingInline: 14,
  },
  cardHead: { alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between", minWidth: 0 },
  cardTitle: {
    color: colors.text,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  cardActions: { flexShrink: 0 },
  fields: {
    color: colors.text,
    display: "flex",
    flexWrap: "wrap",
    fontSize: fonts.sizeSm,
    fontVariantNumeric: "tabular-nums",
    gap: 6,
    columnGap: 14,
    margin: 0,
  },
  field: { alignItems: "center", display: "flex", gap: 6, minWidth: 0 },
  fieldLabel: { color: colors.textMuted },
  fieldValue: { margin: 0, minWidth: 0, overflowWrap: "anywhere" },
});

/** Column id of the row actions, shown at the top right of a row card on phones. */
const ACTIONS_COLUMN = "actions";

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
  const tier = useLayoutTier();

  if (tier === "mobile") {
    return rows.length === 0 ? (
      <p {...stylex.props(styles.card, styles.empty)}>{emptyText}</p>
    ) : (
      <ul aria-label={caption} {...stylex.props(styles.list)}>
        {rows.map((row) => {
          const [first, ...rest] = row.getAllCells();
          const actions = rest.find((cell) => cell.column.id === ACTIONS_COLUMN);

          const fields = rest.filter(
            (cell) => cell.column.id !== ACTIONS_COLUMN && cell.getValue() !== false,
          );

          return (
            <li key={row.id} {...stylex.props(styles.card)}>
              <div {...stylex.props(styles.cardHead)}>
                <span {...stylex.props(styles.cardTitle)}>
                  {first === undefined ? null : <table.FlexRender cell={first} />}
                </span>
                {actions === undefined ? null : (
                  <span {...stylex.props(styles.cardActions)}>
                    <table.FlexRender cell={actions} />
                  </span>
                )}
              </div>
              <dl {...stylex.props(styles.fields)}>
                {fields.map((cell) => (
                  <div key={cell.id} {...stylex.props(styles.field)}>
                    <dt {...stylex.props(styles.fieldLabel)}>{String(cell.column.columnDef.header ?? "")}</dt>
                    <dd {...stylex.props(styles.fieldValue)}>
                      <table.FlexRender cell={cell} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div {...stylex.props(styles.frame)}>
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
