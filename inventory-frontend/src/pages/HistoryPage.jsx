import { useMemo, useState } from "react";
import { getHistory, listItems, listWarehouses } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import SearchableSelect from "../components/SearchableSelect";
import DataTable from "../components/DataTable";
import Pager from "../components/Pager";
import PeriodFilter from "../components/PeriodFilter";
import RefreshButton from "../components/RefreshButton";
import { ErrorMessage, Loading } from "../components/LoadingState";
import { formatValue } from "../utils/format";
import { dayBounds } from "../utils/dateRange";
import "../styles/history.css";

const EVENT_OPTIONS = [
  { value: "all", label: "All events" },
  { value: "IN", label: "In (received)" },
  { value: "OUT", label: "Out" },
  { value: "REIN", label: "Re-in (returned / put back)" },
  { value: "ADJUST", label: "Adjustment" },
  { value: "TRANSFER", label: "Transfer" },
];

const EMPTY = { q: "", warehouse_id: "", item_id: "", event: "all", period: "all", from: "", to: "" };

/** Badge text + colour class for one history entry. */
function eventBadge(m) {
  switch (m.event) {
    case "IN": return ["IN", "in"];
    case "REIN": return ["RE-IN", "rein"];
    case "OUT": return ["OUT", "out"];
    case "ADJUST": return ["ADJUST", "adjust"];
    default: return [m.type === "TRANSFER_IN" ? "TRANSFER IN" : "TRANSFER OUT", "transfer"];
  }
}

export default function HistoryPage() {
  const [f, setF] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [rangeError, setRangeError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const items = useFetch(() => listItems({ limit: 200 }));
  const warehouses = useFetch(() => listWarehouses());

  const params = useMemo(() => {
    const p = { ...applied, event: applied.event === "all" ? "" : applied.event, from: "", to: "", page, limit };
    delete p.period;
    Object.assign(p, dayBounds(applied.from, applied.to));
    return p;
  }, [applied, page, limit]);

  const { data, loading, error, reload } = useFetch(() => getHistory(params), [JSON.stringify(params)]);
  const rows = extractList(data);
  const summary = data?.summary;
  const itemList = extractList(items.data);
  const selectedItem = applied.item_id ? itemList.find((i) => String(i.id) === String(applied.item_id)) || rows[0]?.Item : null;

  function apply(e) {
    e?.preventDefault();
    if (f.from && f.to && f.from > f.to) return setRangeError("The 'From' date cannot be after the 'To' date.");
    setRangeError("");
    setPage(1);
    setApplied(f);
  }
  function reset() {
    setRangeError("");
    setPage(1);
    setF(EMPTY);
    setApplied(EMPTY);
  }
  /** Click an item name to see that item's complete history. */
  function showItem(row) {
    const next = { ...f, item_id: String(row.item_id) };
    setF(next);
    setApplied(next);
    setPage(1);
  }

  const columns = [
    { key: "when", label: "Date & time", render: (m) => formatValue(m.createdAt ?? m.created_at, "createdAt") },
    {
      key: "event",
      label: "Event",
      render: (m) => { const [text, cls] = eventBadge(m); return <span className={`hist-badge ${cls}`}>{text}</span>; },
    },
    {
      key: "item",
      label: "Item",
      render: (m) => (
        <button type="button" className="link hist-item" onClick={() => showItem(m)} title="Show the full history of this item">
          {m.Item?.name || "—"}
          {m.Item?.model ? <small>{m.Item.model}</small> : null}
        </button>
      ),
    },
    { key: "change", label: "In / Out", render: (m) => <b className={Number(m.change) < 0 ? "hist-neg" : "hist-pos"}>{Number(m.change) > 0 ? `+${m.change}` : m.change}</b> },
    { key: "balance", label: "Balance after", render: (m) => formatValue(m.balance_after, "balance_after") },
    { key: "ref", label: "Serial / reference", render: (m) => m.reference || "—" },
    {
      key: "remarks",
      label: "Remarks (why)",
      render: (m) => (m.note ? <span className={`hist-remark${m.event === "REIN" ? " rein" : ""}`}>{m.note}</span> : <span className="muted">—</span>),
    },
  ];

  return (
    <div className="page page-history">
      <div className="rf-head">
        <h1>History</h1>
        <RefreshButton onClick={() => { reload(); items.reload(); warehouses.reload(); }} busy={loading} />
      </div>
      <p className="muted hist-intro">
        The complete life of your stock: what came in, what went out, and what was put back in (re-in) with the reason.
        Search a name, serial number or remark, or click an item to see only its history.
      </p>

      <form className="toolbar hist-filters" onSubmit={apply}>
        <FormField label="Search" placeholder="Item, SKU, serial / reference, box, remark or user" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <SearchableSelect label="Item" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}
          options={itemList.map((i) => ({ value: i.id, label: [i.name, i.model, i.sku].filter(Boolean).join(" — ") }))} />
        <FormField label="Warehouse" value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
        <FormField label="Event" value={f.event} onChange={(e) => setF({ ...f, event: e.target.value || "all" })} options={EVENT_OPTIONS} />
        <PeriodFilter value={{ period: f.period, from: f.from, to: f.to }} onChange={(v) => setF({ ...f, ...v })} />
        <button className="primary">Apply</button>
        <button type="button" onClick={reset}>Reset</button>
      </form>

      <ErrorMessage error={error || rangeError} onRetry={reload} />

      {summary && (
        <section className="hist-summary" aria-label="History totals">
          <p className="hist-summary-title">
            {selectedItem ? <>Totals for <b>{selectedItem.name}</b></> : "Totals for the filtered history"}
            <span className="muted"> · {summary.entries} {summary.entries === 1 ? "entry" : "entries"}</span>
          </p>
          <div className="hist-tiles">
            {summary.current_stock !== null && (
              <div className="hist-tile t-stock"><span>Current stock</span><b>{summary.current_stock}</b></div>
            )}
            <div className="hist-tile t-in"><span>Received (IN)</span><b>{summary.received}</b></div>
            <div className="hist-tile t-out"><span>Out</span><b>{summary.issued}</b></div>
            <div className="hist-tile t-rein"><span>Re-in (returned)</span><b>{summary.returned}</b></div>
            {(summary.adjusted !== 0 || summary.transferred_in !== 0 || summary.transferred_out !== 0) && (
              <div className="hist-tile t-other">
                <span>Adjust / transfer</span>
                <b>{summary.adjusted + summary.transferred_in - summary.transferred_out}</b>
              </div>
            )}
          </div>
        </section>
      )}

      {loading ? <Loading /> : <DataTable columns={columns} rows={rows} empty="No history found for these filters." />}
      <Pager page={page} limit={limit} total={data?.meta?.total ?? rows.length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />
    </div>
  );
}