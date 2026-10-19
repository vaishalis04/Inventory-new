import { HIDDEN_KEY, formatValue, isScalar, pretty } from "../utils/format";
import { showField, useLookups } from "../utils/lookup";

/** columns: [{ key, label, render?(row) }]. Empty state included. */
export function DataTable({ columns, rows, empty = "No records found.", rowKey }) {
  useLookups();
  if (!rows?.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : row.id ?? i}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : fmt(row[c.key], c.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fmt = formatValue;

/**
 * Builds columns automatically from the first rows' scalar fields (and one level of
 * nested object name fields), because the API's exact response shape isn't documented.
 */
export function AutoTable({ rows, actions, hide = [], ...rest }) {
  useLookups();
  const sample = rows?.slice(0, 20) ?? [];
  const keys = [];
  sample.forEach((r) =>
    Object.entries(r).forEach(([k, v]) => {
      if (hide.includes(k) || HIDDEN_KEY.test(k) || keys.includes(k)) return;
      if (isScalar(v) || (v && typeof v === "object" && !Array.isArray(v) && ("name" in v || "code" in v))) keys.push(k);
    })
  );
  // Drop raw ids (and *_id columns that can't be resolved to a name) unless at least one row resolves.
  const visible = keys.filter((k) => sample.some((r) => r[k] !== undefined && showField(k, r[k], r)));
  const columns = visible.map((k) => ({
    key: k,
    label: pretty(k),
    render: (row) => {
      const v = row[k];
      if (v && typeof v === "object") return v.name ?? v.code ?? JSON.stringify(v);
      return fmt(v, k);
    },
  }));
  if (actions) columns.push({ key: "_actions", label: "", render: actions });
  return <DataTable columns={columns} rows={rows} {...rest} />;
}

export default DataTable;
