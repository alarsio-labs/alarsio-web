import type { ReactNode } from "react";

// A table that scrolls sideways inside its own box on a narrow screen, with the first
// column pinned and a minimum width so columns never squash (docs/DESIGN.md section 4).
// Every header is a <th scope="col">; the first cell of each row is its <th scope="row">.

export type Column<T> = { key: string; label: string; numeric?: boolean; render: (row: T) => ReactNode };

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  minWidth = 640,
  empty
}: {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  minWidth?: number;
  empty: string;
}) {
  if (rows.length === 0) return <p className="ax-empty">{empty}</p>;
  return (
    <div className="ax-table-wrap">
      <table className="ax-table" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "ax-num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c, i) =>
                i === 0 ? (
                  <th key={c.key} scope="row" className={c.numeric ? "ax-num" : undefined}>
                    {c.render(row)}
                  </th>
                ) : (
                  <td key={c.key} className={c.numeric ? "ax-num" : undefined}>
                    {c.render(row)}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
