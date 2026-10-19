import { AutoTable } from "./DataTable";
import { HIDDEN_KEY, formatValue, isScalar, pretty } from "../utils/format";
import { showField, useLookups } from "../utils/lookup";

/**
 * Renders any API response readably:
 *  - plain fields   -> label / value grid
 *  - arrays of rows -> table
 *  - nested objects -> titled sub-sections
 */
export default function DataView({ data, skip = [] }) {
  useLookups();
  if (data === null || data === undefined) return <p className="muted">No data.</p>;
  if (isScalar(data)) return <span>{formatValue(data)}</span>;
  if (Array.isArray(data)) return <ArrayView rows={data} />;

  const entries = Object.entries(data).filter(
    ([k, v]) => !skip.includes(k) && !HIDDEN_KEY.test(k) && !(typeof v === "string" && v.length > 200)
  );
  const scalars = entries.filter(([k, v]) => isScalar(v) && showField(k, v, data));
  const nested = entries.filter(([, v]) => !isScalar(v));

  return (
    <>
      {scalars.length > 0 && (
        <dl className="kv">
          {scalars.map(([k, v]) => (
            <div key={k}>
              <dt>{pretty(k)}</dt>
              <dd>{formatValue(v, k)}</dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([k, v]) => (
        <section key={k} className="sub">
          <h3>{pretty(k)}</h3>
          <DataView data={v} />
        </section>
      ))}
    </>
  );
}

function ArrayView({ rows }) {
  if (!rows.length) return <p className="muted">None.</p>;
  if (rows.every(isScalar)) {
    return <div className="chips">{rows.map((r, i) => <span className="badge" key={i}>{String(r)}</span>)}</div>;
  }
  if (rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) return <AutoTable rows={rows} />;
  return rows.map((r, i) => <DataView key={i} data={r} />);
}
