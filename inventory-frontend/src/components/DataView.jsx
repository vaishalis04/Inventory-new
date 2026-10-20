
import { AutoTable } from "./DataTable";
import {
  HIDDEN_KEY,
  formatValue,
  isScalar,
  pretty,
} from "../utils/format";
import { showField, useLookups } from "../utils/lookup";

export default function DataView({ data, skip = [] }) {
  useLookups();

  if (data === null || data === undefined) {
    return <p className="muted">No data available.</p>;
  }

  if (isScalar(data)) {
    return <span className="dark-inline-value">{formatValue(data)}</span>;
  }

  if (Array.isArray(data)) {
    return <ArrayView rows={data} />;
  }

  const entries = Object.entries(data).filter(
    ([key, value]) =>
      !skip.includes(key) &&
      !HIDDEN_KEY.test(key) &&
      !(typeof value === "string" && value.length > 200)
  );

  const scalars = entries.filter(
    ([key, value]) => isScalar(value) && showField(key, value, data)
  );

  const nested = entries.filter(([, value]) => !isScalar(value));

  if (!entries.length) {
    return <p className="muted">No displayable fields.</p>;
  }

  return (
    <div className="dark-data-view">
      {scalars.length > 0 && (
        <dl className="kv dark-kv">
          {scalars.map(([key, value]) => (
            <div key={key}>
              <dt>{pretty(key)}</dt>
              <dd>{formatValue(value, key)}</dd>
            </div>
          ))}
        </dl>
      )}

      {nested.map(([key, value]) => (
        <section key={key} className="sub dark-sub">
          <h3>{pretty(key)}</h3>
          <DataView data={value} />
        </section>
      ))}
    </div>
  );
}

function ArrayView({ rows }) {
  if (!rows.length) {
    return <p className="muted">No records available.</p>;
  }

  if (rows.every(isScalar)) {
    return (
      <div className="chips dark-chips">
        {rows.map((value, index) => (
          <span className="badge dark-badge" key={index}>
            {String(value)}
          </span>
        ))}
      </div>
    );
  }

  if (
    rows.every(
      (row) =>
        row && typeof row === "object" && !Array.isArray(row)
    )
  ) {
    return <AutoTable rows={rows} />;
  }

  return (
    <div className="dark-array-list">
      {rows.map((row, index) => (
        <div className="dark-array-item" key={index}>
          <DataView data={row} />
        </div>
      ))}
    </div>
  );
}
