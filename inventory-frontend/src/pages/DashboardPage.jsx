
import { useMemo } from "react";
import { dashboard } from "../api/inventory.api";
import useFetch from "../hooks/useFetch";
import { ErrorMessage, Loading } from "../components/LoadingState";
import DataView from "../components/DataView";
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

function DashboardStyles() {
  return (
    <style>{`
      .inventory-dashboard {
        --dash-ink: var(--text, #172033);
        --dash-muted: var(--muted, #788397);
        --dash-border: var(--border, #e8ecf2);
        --dash-surface: var(--surface, #ffffff);
        color: var(--dash-ink);
        width: 100%;
        min-width: 0;
        padding-bottom: 32px;
      }

      .inventory-dashboard * {
        box-sizing: border-box;
      }

      .inventory-dashboard .dashboard-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
        margin-bottom: 28px;
      }

      .inventory-dashboard .dashboard-eyebrow {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 9px;
        color: var(--dash-muted);
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 1.6px;
        text-transform: uppercase;
      }

      .inventory-dashboard .dashboard-eyebrow::before {
        content: "";
        display: block;
        width: 19px;
        height: 2px;
        background: var(--primary, #4f46e5);
        border-radius: 4px;
      }

      .inventory-dashboard .dashboard-title {
        margin: 0;
        font-size: clamp(25px, 3vw, 34px);
        font-weight: 780;
        line-height: 1.2;
        letter-spacing: -1.3px;
      }

      .inventory-dashboard .dashboard-subtitle {
        margin: 9px 0 0;
        color: var(--dash-muted);
        font-size: 13px;
        line-height: 1.7;
      }

      .inventory-dashboard .dashboard-refresh {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        min-height: 42px;
        padding: 0 17px;
        border: 1px solid var(--dash-border);
        border-radius: 10px;
        background: var(--dash-surface);
        color: var(--dash-ink);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: border-color .2s, transform .2s, box-shadow .2s;
      }

      .inventory-dashboard .dashboard-refresh:hover {
        border-color: var(--primary, #4f46e5);
        box-shadow: 0 4px 14px rgba(31, 41, 55, .06);
        transform: translateY(-1px);
      }

      .inventory-dashboard .dashboard-refresh:focus-visible {
        outline: 2px solid var(--primary, #4f46e5);
        outline-offset: 3px;
      }

      .inventory-dashboard .dashboard-refresh:disabled {
        cursor: wait;
        opacity: .65;
      }

      .inventory-dashboard .dashboard-refresh-icon {
        display: inline-block;
        font-size: 18px;
        line-height: 1;
      }

      .inventory-dashboard .dashboard-overview {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 15px;
      }

      .inventory-dashboard .dashboard-overview-title {
        margin: 0;
        font-size: 15px;
        font-weight: 750;
        letter-spacing: -.25px;
      }

      .inventory-dashboard .dashboard-overview-note {
        color: var(--dash-muted);
        font-size: 12px;
      }

      .inventory-dashboard .dashboard-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
        gap: 16px;
        margin-bottom: 30px;
      }

      .inventory-dashboard .dashboard-stat-grid.compact {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 155px), 1fr));
        margin: 0;
      }

      .inventory-dashboard .dashboard-stat-card {
        position: relative;
        min-width: 0;
        overflow: hidden;
        padding: 21px;
        border: 1px solid var(--dash-border);
        border-radius: 15px;
        background: var(--dash-surface);
        box-shadow: 0 2px 5px rgba(25, 35, 55, .015);
        animation: dashboard-enter .35s ease both;
        animation-delay: calc(var(--card-index, 0) * 35ms);
        transition: transform .2s, box-shadow .2s, border-color .2s;
      }

      .inventory-dashboard .dashboard-stat-card:hover {
        transform: translateY(-3px);
        border-color: #d8deea;
        box-shadow: 0 10px 28px rgba(25, 35, 55, .055);
      }

      .inventory-dashboard .dashboard-stat-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 23px;
      }

      .inventory-dashboard .dashboard-stat-icon {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border: 1px solid #e9e9ff;
        border-radius: 12px;
        background: #f2f2ff;
        color: #5146c8;
        font-size: 23px;
        font-weight: 650;
      }

      .inventory-dashboard .accent-success .dashboard-stat-icon {
        background: #eaf8f0;
        border-color: #d7f0e1;
        color: #16804a;
      }

      .inventory-dashboard .accent-warning .dashboard-stat-icon {
        background: #fff5e6;
        border-color: #ffebca;
        color: #b96c0c;
      }

      .inventory-dashboard .accent-blue .dashboard-stat-icon {
        background: #eaf3ff;
        border-color: #dceaff;
        color: #2563b9;
      }

      .inventory-dashboard .dashboard-stat-indicator {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #b7c0d0;
      }

      .inventory-dashboard .accent-success .dashboard-stat-indicator {
        background: #24a566;
      }

      .inventory-dashboard .accent-warning .dashboard-stat-indicator {
        background: #e9a23b;
      }

      .inventory-dashboard .accent-blue .dashboard-stat-indicator {
        background: #4688ed;
      }

      .inventory-dashboard .dashboard-stat-value {
        overflow-wrap: anywhere;
        font-size: clamp(25px, 2.4vw, 32px);
        font-weight: 780;
        letter-spacing: -1.1px;
        line-height: 1.25;
        font-variant-numeric: tabular-nums;
      }

      .inventory-dashboard .dashboard-stat-label {
        margin-top: 8px;
        color: var(--dash-muted);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .inventory-dashboard .dashboard-panel {
        min-width: 0;
        margin-top: 25px;
        padding: 23px;
        border: 1px solid var(--dash-border);
        border-radius: 16px;
        background: var(--dash-surface);
      }

      .inventory-dashboard .dashboard-section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
        flex-wrap: wrap;
        margin-bottom: 21px;
      }

      .inventory-dashboard .dashboard-section-heading h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 760;
        letter-spacing: -.35px;
      }

      .inventory-dashboard .dashboard-section-heading p {
        margin: 6px 0 0;
        color: var(--dash-muted);
        font-size: 12px;
        line-height: 1.6;
      }

      .inventory-dashboard .dashboard-count {
        padding: 6px 10px;
        border: 1px solid var(--dash-border);
        border-radius: 8px;
        color: var(--dash-muted);
        background: var(--dash-surface);
        font-size: 11px;
        font-weight: 650;
      }

      .inventory-dashboard .dashboard-data-view {
        min-width: 0;
        overflow-x: auto;
      }

      .inventory-dashboard .dashboard-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 250px;
        padding: 35px 20px;
        border: 1px dashed var(--dash-border);
        border-radius: 16px;
        text-align: center;
      }

      .inventory-dashboard .dashboard-empty-icon {
        display: grid;
        width: 55px;
        height: 55px;
        place-items: center;
        margin-bottom: 17px;
        border: 1px solid var(--dash-border);
        border-radius: 16px;
        color: var(--dash-muted);
        font-size: 26px;
      }

      .inventory-dashboard .dashboard-empty h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 750;
      }

      .inventory-dashboard .dashboard-empty p {
        max-width: 340px;
        margin: 8px 0 0;
        color: var(--dash-muted);
        font-size: 13px;
        line-height: 1.7;
      }

      .inventory-dashboard .dashboard-footer {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 24px;
        color: var(--dash-muted);
        font-size: 11px;
      }

      @keyframes dashboard-enter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 640px) {
        .inventory-dashboard .dashboard-toolbar {
          align-items: flex-start;
          margin-bottom: 22px;
        }

        .inventory-dashboard .dashboard-refresh {
          min-height: 39px;
          padding: 0 12px;
        }

        .inventory-dashboard .dashboard-stat-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 22px;
        }

        .inventory-dashboard .dashboard-stat-grid.compact {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .inventory-dashboard .dashboard-stat-card {
          padding: 15px;
          border-radius: 12px;
        }

        .inventory-dashboard .dashboard-stat-top {
          margin-bottom: 17px;
        }

        .inventory-dashboard .dashboard-stat-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          font-size: 20px;
        }

        .inventory-dashboard .dashboard-stat-value {
          font-size: 25px;
        }

        .inventory-dashboard .dashboard-panel {
          padding: 17px;
          margin-top: 19px;
          border-radius: 13px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .inventory-dashboard *,
        .inventory-dashboard *::before,
        .inventory-dashboard *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: .01ms !important;
        }
      }
    `}</style>
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
      <DashboardStyles />

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

          {others.map(([key, value]) => (
            <section className="dashboard-panel" key={key}>
              <SectionHeading
                title={pretty(key)}
                description="Detailed information and records."
                count={Array.isArray(value) ? value.length : undefined}
              />

              <div className="dashboard-data-view">
                <DataView data={value} />
              </div>
            </section>
          ))}

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
