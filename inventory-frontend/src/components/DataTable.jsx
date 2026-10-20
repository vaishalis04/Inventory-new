
import { HIDDEN_KEY, formatValue, isScalar, pretty } from "../utils/format";
import { showField, useLookups } from "../utils/lookup";

const fmt = formatValue;

/** Columns: [{ key, label, render?(row) }]. */
export function DataTable({
  columns,
  rows,
  empty = "No records found.",
  rowKey,
}) {
  useLookups();

  if (!rows?.length) {
    return (
      <div className="dark-empty-state">
        <span className="empty-state-icon">▤</span>
        <strong>Nothing to display</strong>
        <p>{empty}</p>
      </div>
    );
  }

  return (
    <div className="table-wrap dark-table-wrap">
      <table className="dark-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row) : row.id ?? index}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(row)
                    : fmt(row[column.key], column.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Automatically builds columns from scalar fields and nested name/code fields.
 * Hidden fields and unresolved IDs are omitted.
 */
export function AutoTable({ rows, actions, hide = [], ...rest }) {
  useLookups();

  const sample = rows?.slice(0, 20) ?? [];
  const keys = [];

  sample.forEach((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;

    Object.entries(row).forEach(([key, value]) => {
      if (
        hide.includes(key) ||
        HIDDEN_KEY.test(key) ||
        keys.includes(key)
      ) {
        return;
      }

      if (
        isScalar(value) ||
        (value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          ("name" in value || "code" in value))
      ) {
        keys.push(key);
      }
    });
  });

  const visible = keys.filter((key) =>
    sample.some(
      (row) =>
        row[key] !== undefined && showField(key, row[key], row)
    )
  );

  const columns = visible.map((key) => ({
    key,
    label: pretty(key),
    render: (row) => {
      const value = row[key];

      if (value && typeof value === "object") {
        return value.name ?? value.code ?? JSON.stringify(value);
      }

      return fmt(value, key);
    },
  }));

  if (actions) {
    columns.push({
      key: "_actions",
      label: "Actions",
      render: actions,
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      {...rest}
    />
  );
}

export default DataTable;
