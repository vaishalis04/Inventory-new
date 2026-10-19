import { dashboard } from "../api/inventory.api";
import useFetch from "../hooks/useFetch";
import { ErrorMessage, Loading } from "../components/LoadingState";
import DataView from "../components/DataView";
import { HIDDEN_KEY, formatValue, isScalar, pretty } from "../utils/format";

const isNumberMap = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && Object.values(v).length > 0 && Object.values(v).every((x) => typeof x === "number");

function StatGrid({ entries }) {
  return (
    <div className="cards">
      {entries.map(([k, v]) => (
        <div className="stat" key={k}>
          <b>{typeof v === "number" ? v.toLocaleString() : formatValue(v, k)}</b>
          <span>{pretty(k)}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useFetch(dashboard);
  if (loading) return <Loading text="Loading dashboard..." />;

  const d = data?.data ?? {};
  const entries = Object.entries(d).filter(([k]) => !HIDDEN_KEY.test(k));
  const stats = entries.filter(([, v]) => isScalar(v) && v !== null);
  const maps = entries.filter(([, v]) => isNumberMap(v));
  const others = entries.filter(([, v]) => !isScalar(v) && !isNumberMap(v));

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Dashboard</h1>
        <button onClick={reload}>Refresh</button>
      </div>
      <ErrorMessage error={error} onRetry={reload} />
      {!error && entries.length === 0 && <p className="muted">No dashboard data yet.</p>}

      {stats.length > 0 && <StatGrid entries={stats} />}

      {maps.map(([k, v]) => (
        <section className="card" key={k}>
          <h2>{pretty(k)}</h2>
          <StatGrid entries={Object.entries(v)} />
        </section>
      ))}

      {others.map(([k, v]) => (
        <section className="card" key={k}>
          <h2>{pretty(k)}</h2>
          <DataView data={v} />
        </section>
      ))}
    </>
  );
}
