
import { useMemo } from "react";
import { dashboard } from "../api/inventory.api";
import useFetch from "../hooks/useFetch";
import { ErrorMessage, Loading } from "../components/LoadingState";
import DataView from "../components/DataView";
import "../styles/dashboard.css";
import {
  HIDDEN_KEY,
  formatValue,
  isScalar,
  pretty,
} from "../utils/format";

const isNumberMap = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.values(value).length > 0 &&
  Object.values(value).every((item) => typeof item === "number");

const getIcon = (key) => {
  const name = key.toLowerCase();

  if (/stock|quantity|unit|inventory/.test(name)) return "▦";
  if (/item|product|material/.test(name)) return "◈";
  if (/box|package|carton/.test(name)) return "▣";
  if (/warehouse|location|branch/.test(name)) return "⌖";
  if (/supplier|vendor/.test(name)) return "♧";
  if (/user|employee|member/.test(name)) return "♙";
  if (/sale|revenue|income|amount|value|price/.test(name)) return "₹";
  if (/purchase|order|receipt/.test(name)) return "↗";
  if (/low|alert|shortage|damage/.test(name)) return "!";
  if (/category|group|type/.test(name)) return "⊞";
  if (/company|business/.test(name)) return "⌂";

  return "◉";
};

const getAccent = (key) => {
  const name = key.toLowerCase();

  if (/low|alert|shortage|damage|overdue/.test(name)) return "warning";
  if (/sale|revenue|income|success|available/.test(name)) return "success";
  if (/order|purchase|pending|received/.test(name)) return "blue";

  return "neutral";
};

/** Low stock as a list with a progress bar (quantity vs. minimum). Falls back to the table if the data looks different. */
function LowStockList({ rows }) {
  return (
    <ul className="dash-list">
      {rows.map((row, i) => {
        const qty = Number(row.total_quantity) || 0;
        const min = Number(row.min_stock) || 0;
        const pct = min > 0 ? Math.max(4, Math.min(100, Math.round((qty / min) * 100))) : 0;
        return (
          <li key={row.id ?? i}>
            <div className="dash-list-main">
              <strong>{row.name}</strong>
              {row.model ? <span className="dash-sub">{row.model}</span> : null}
              <div className="dash-bar" role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={qty} aria-label={`${row.name}: ${qty} of ${min}`}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="dash-list-qty">{qty} of {min}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Recent movements as a timeline (green = stock in, orange = stock out). */
function MovementTimeline({ rows }) {
  return (
    <ol className="dash-timeline">
      {rows.map((m, i) => {
        const change = Number(m.change) || 0;
        return (
          <li key={m.id ?? i} className={change < 0 ? "out" : "in"}>
            <div className="dash-tl-head">
              <strong>{m.Item?.name || "—"}</strong>
              <span className="dash-delta">{change > 0 ? `+${change}` : change}</span>
            </div>
            <span className="dash-sub">
              {[m.type, m.Warehouse?.name, formatValue(m.createdAt ?? m.created_at, "createdAt")].filter(Boolean).join(" · ")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const isLowStockRows = (key, value) =>
  key === "low_stock" && Array.isArray(value) && value.length > 0 && value.every((r) => r && typeof r === "object" && "total_quantity" in r && "min_stock" in r);
const isMovementRows = (key, value) =>
  key === "recent_movements" && Array.isArray(value) && value.length > 0 && value.every((r) => r && typeof r === "object" && "change" in r);

function SectionHeading({ title, count, description }) {
  return (
    <div className="dashboard-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      {count !== undefined && (
        <span className="dashboard-count">
          {count} {count === 1 ? "record" : "records"}
        </span>
      )}
    </div>
  );
}

function StatGrid({ entries, compact = false }) {
  return (
    <div className={`dashboard-stat-grid${compact ? " compact" : ""}`}>
      {entries.map(([key, value], index) => (
        <article
          className={`dashboard-stat-card accent-${getAccent(key)}`}
          key={key}
          style={{ "--card-index": index }}
        >
          <div className="dashboard-stat-top">
            <span className="dashboard-stat-icon" aria-hidden="true">
              {getIcon(key)}
            </span>
            <span className="dashboard-stat-indicator" />
          </div>

          <div className="dashboard-stat-value">
            {typeof value === "number"
              ? value.toLocaleString()
              : formatValue(value, key)}
          </div>

          <div className="dashboard-stat-label">{pretty(key)}</div>
        </article>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useFetch(dashboard);

  const { stats, maps, others, totalRecords } = useMemo(() => {
    const source = data?.data ?? {};

    const entries = Object.entries(source).filter(
      ([key]) => !HIDDEN_KEY.test(key)
    );

    const stats = entries.filter(
      ([, value]) => isScalar(value) && value !== null
    );

    const maps = entries.filter(([, value]) => isNumberMap(value));

    const others = entries.filter(
      ([, value]) => !isScalar(value) && !isNumberMap(value)
    );

    return {
      stats,
      maps,
      others,
      totalRecords: entries.length,
    };
  }, [data]);

  if (loading) return <Loading text="Loading dashboard..." />;

  return (
    <div className="inventory-dashboard">
      
      <header className="dashboard-toolbar">
        <div>
          <p className="dashboard-eyebrow">Inventory management</p>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Your inventory overview, all in one place.
          </p>
        </div>

        <button
          className="dashboard-refresh"
          type="button"
          onClick={reload}
          disabled={loading}
          aria-label="Refresh dashboard"
        >
          <span className="dashboard-refresh-icon" aria-hidden="true">
            ↻
          </span>
          Refresh data
        </button>
      </header>

      <ErrorMessage error={error} onRetry={reload} />

      {!error && totalRecords === 0 && (
        <div className="dashboard-empty">
          <span className="dashboard-empty-icon" aria-hidden="true">
            ▦
          </span>
          <h2>Your dashboard is ready</h2>
          <p>
            There is no dashboard data to display yet. Once your inventory
            data is available, your key metrics will appear here.
          </p>
          <button
            className="dashboard-refresh"
            type="button"
            onClick={reload}
            style={{ marginTop: 20 }}
          >
            ↻ Reload dashboard
          </button>
        </div>
      )}

      {!error && totalRecords > 0 && (
        <>
          {stats.length > 0 && (
            <section aria-label="Key metrics">
              <div className="dashboard-overview">
                <h2 className="dashboard-overview-title">Key metrics</h2>
                <span className="dashboard-overview-note">
                  {stats.length} {stats.length === 1 ? "metric" : "metrics"}
                </span>
              </div>

              <StatGrid entries={stats} />
            </section>
          )}

          {maps.map(([key, value]) => (
            <section className="dashboard-panel" key={key}>
              <SectionHeading
                title={pretty(key)}
                count={Object.keys(value).length}
                description="A breakdown of your inventory data."
              />

              <StatGrid entries={Object.entries(value)} compact />
            </section>
          ))}

          <div className="dashboard-panels">
          {others.map(([key, value]) => (
            <section className="dashboard-panel" key={key}>
              <SectionHeading
                title={pretty(key)}
                description="Detailed information and records."
                count={Array.isArray(value) ? value.length : undefined}
              />

              <div className="dashboard-data-view">
                {isLowStockRows(key, value) ? (
                  <LowStockList rows={value} />
                ) : isMovementRows(key, value) ? (
                  <MovementTimeline rows={value} />
                ) : (
                  <DataView data={value} />
                )}
              </div>
            </section>
          ))}
          </div>

          <footer className="dashboard-footer">
            <span>Inventory overview</span>
            <span>
              {totalRecords} {totalRecords === 1 ? "section" : "sections"}{" "}
              available
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
