import { useMemo, useState } from "react";
import {
  countStock,
  deleteMovement,
  deleteStock,
  getLowStock,
  getMovements,
  getStock,
  listItems,
  listWarehouses,
  updateMovement,
} from "../api/inventory.api";
import { extractList } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { loadLookups } from "../utils/lookup";
import useFetch from "../hooks/useFetch";
import DataTable, { AutoTable } from "../components/DataTable";
import { formatValue } from "../utils/format";
import Pager from "../components/Pager";
import RefreshButton from "../components/RefreshButton";
import { pageSlice } from "../utils/paging";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import { ErrorMessage, Loading } from "../components/LoadingState";

const nameOf = (row, key) => row?.[key]?.name ?? "";
const errText = (err) =>
  err.details && Array.isArray(err.details)
    ? `${err.message}: ${err.details.join(", ")}`
    : err.message;

/* -------------------------------- Stock --------------------------------- */

export function StockPage() {
  const { role } = useAuth();
  const canManage = ["admin", "manager"].includes(role);

  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const warehouses = useFetch(() => listWarehouses());
  const { data, loading, error, reload } = useFetch(
    () => getStock({ warehouse_id: warehouseId, page, limit }),
    [warehouseId, page, limit]
  );

  // Latest stock movements: used so "Updated At" always shows the most recent in/out/edit time of an item.
  const recent = useFetch(() => getMovements({ limit: 200 }), []);
  const refresh = () => { reload(); recent.reload(); };
  const latestAt = useMemo(() => {
    const map = {};
    extractList(recent.data).forEach((m) => {
      const t = Date.parse(m.createdAt ?? m.created_at);
      if (Number.isNaN(t)) return;
      const k = `${m.warehouse_id}:${m.item_id}`;
      if (!(k in map) || t > map[k]) map[k] = t;
    });
    return map;
  }, [recent.data]);
  const updatedOf = (row) => {
    const own = Date.parse(row.updatedAt ?? row.updated_at);
    const t = Math.max(Number.isNaN(own) ? 0 : own, latestAt[`${row.warehouse_id}:${row.item_id}`] || 0);
    return t ? new Date(t).toISOString() : null;
  };

  const [viewing, setViewing] = useState(null); // stock row whose history is open
  const history = useFetch(
    () => (viewing ? getMovements({ item_id: viewing.item_id, warehouse_id: viewing.warehouse_id, limit: 200 }) : Promise.resolve(null)),
    [viewing?.id]
  );
  const historyRows = extractList(history.data);
  const totalIn = historyRows.reduce((sum, m) => sum + (Number(m.change) > 0 ? Number(m.change) : 0), 0);
  const totalOut = historyRows.reduce((sum, m) => sum + (Number(m.change) < 0 ? -Number(m.change) : 0), 0);
  const historyColumns = [
    { key: "when", label: "Date & time", render: (m) => formatValue(m.createdAt ?? m.created_at, "createdAt") },
    { key: "type", label: "Type", render: (m) => formatValue(m.type, "type") },
    { key: "change", label: "In / Out", render: (m) => (Number(m.change) > 0 ? `+${m.change}` : String(m.change)) },
    { key: "balance_after", label: "Balance after", render: (m) => formatValue(m.balance_after, "balance_after") },
    { key: "box", label: "Box", render: (m) => m.Box?.code || formatValue(null) },
    { key: "reference", label: "Reference", render: (m) => formatValue(m.reference, "reference") },
    { key: "source", label: "Source", render: (m) => formatValue(m.source, "source") },
    { key: "user", label: "By", render: (m) => m.User?.name || formatValue(null) },
    { key: "note", label: "Note", render: (m) => formatValue(m.note, "note") },
  ];

  const [editing, setEditing] = useState(null); // stock row
  const [form, setForm] = useState({ quantity: "", note: "" });
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);

  function openEdit(row) {
    setFormError("");
    setForm({ quantity: String(row.quantity ?? 0), note: "" });
    setEditing(row);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setFormError("");
    const counted = Number(form.quantity);
    if (form.quantity === "" || !Number.isInteger(counted) || counted < 0) {
      return setFormError("Enter a whole number, 0 or more.");
    }
    setBusy(true);
    try {
      await countStock({
        warehouse_id: editing.warehouse_id,
        item_id: editing.item_id,
        counted_quantity: counted,
        note: form.note || "Stock quantity edited",
      });
      setEditing(null);
      refresh();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    const label = `${nameOf(row, "Item") || "this item"} in ${nameOf(row, "Warehouse") || "this warehouse"}`;
    if (
      !window.confirm(
        `Delete the stock record for ${label}?\n\n` +
          `This permanently deletes the quantity (${row.quantity}), all its boxes, individual units and EVERY stock movement of this item in this warehouse.`
      )
    ) {
      return;
    }
    setPageError("");
    try {
      await deleteStock(row.id);
      await loadLookups(true);
      refresh();
    } catch (err) {
      setPageError(errText(err));
    }
  }

  const columns = [
    { key: "warehouse", label: "Warehouse", render: (r) => nameOf(r, "Warehouse") || formatValue(r.warehouse_id, "warehouse_id") },
    { key: "item", label: "Item", render: (r) => nameOf(r, "Item") || formatValue(r.item_id, "item_id") },
    { key: "quantity", label: "Quantity", render: (r) => formatValue(r.quantity, "quantity") },
    { key: "createdAt", label: "Created At", render: (r) => formatValue(r.createdAt ?? r.created_at, "createdAt") },
    { key: "updatedAt", label: "Updated At", render: (r) => formatValue(updatedOf(r), "updatedAt") },
    {
      key: "_actions",
      label: "Actions",
      render: (row) => (
        <div className="row-actions">
          <button className="link" onClick={() => setViewing(row)}>View</button>
          {canManage && <button className="link" onClick={() => openEdit(row)}>Edit</button>}
          {canManage && <button className="link danger" onClick={() => remove(row)}>Delete</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <style>{`
        .stock-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
        .stock-head h1 { margin: 0; }
        .stock-refresh { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 42px; padding: 0 17px; border: 1px solid var(--border, #e8ecf2); border-radius: 10px; background: var(--surface, #ffffff); color: var(--text, #172033); font-size: 13px; font-weight: 700; cursor: pointer; transition: border-color .2s, transform .2s; }
        .stock-refresh:hover { border-color: var(--primary, #4f46e5); transform: translateY(-1px); }
        .stock-refresh:disabled { cursor: wait; opacity: .65; }
        .stock-refresh span { display: inline-block; font-size: 18px; line-height: 1; }
      `}</style>
      <div className="stock-head">
        <h1>Stock</h1>
        <button className="stock-refresh" type="button" onClick={refresh} disabled={loading || recent.loading} aria-label="Refresh stock">
          <span aria-hidden="true">↻</span>
          Refresh data
        </button>
      </div>
      <div className="toolbar">
        <FormField label="Warehouse" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
      </div>
      <ErrorMessage error={error || pageError} onRetry={refresh} />
      {loading ? <Loading /> : <DataTable columns={columns} rows={extractList(data)} />}
      <Pager page={page} limit={limit} total={data?.meta?.total ?? extractList(data).length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />

      {viewing && (
        <Modal title={`History — ${nameOf(viewing, "Item")}`} onClose={() => setViewing(null)}>
          <ErrorMessage error={history.error} onRetry={history.reload} />
          <p className="muted">
            {nameOf(viewing, "Warehouse")} — current quantity: <b>{viewing.quantity}</b> · Total in: <b>{totalIn}</b> · Total out: <b>{totalOut}</b>
            {historyRows.length >= 200 ? " (showing the latest 200 entries)" : ""}
          </p>
          {history.loading ? <Loading /> : <DataTable columns={historyColumns} rows={historyRows} empty="No stock movements recorded for this item." />}
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit stock — ${nameOf(editing, "Item")}`} onClose={() => setEditing(null)}>
          <ErrorMessage error={formError} />
          <p className="muted">
            {nameOf(editing, "Warehouse")} — recorded quantity: <b>{editing.quantity}</b>.
            Saving records a correcting stock movement so the history stays accurate.
          </p>
          <form onSubmit={saveEdit}>
            <FormField label="Correct quantity" type="number" min="0" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            <FormField label="Reason (optional)" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className="primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------ Movements ------------------------------- */

const isTransfer = (m) => m.type === "TRANSFER_IN" || m.type === "TRANSFER_OUT";
const isUnitScan = (m) =>
  m.source === "SCAN" && Number(m.quantity) === 1 && String(m.reference || "").startsWith("UNT-");

export function MovementsPage() {
  const { role } = useAuth();
  const canManage = ["admin", "manager"].includes(role);

  const emptyFilters = { warehouse_id: "", item_id: "", box_code: "", type: "", from: "", to: "" };
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [f, setF] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [rangeError, setRangeError] = useState("");
  const items = useFetch(() => listItems({ limit: 500 }));
  const warehouses = useFetch(() => listWarehouses());
  // The date filter covers whole days: from 00:00 of the first day to 23:59 of the last day (your local time).
  const params = useMemo(() => {
    const p = { ...applied, from: "", to: "", page, limit };
    if (applied.from) p.from = new Date(`${applied.from}T00:00:00`).toISOString();
    if (applied.to) p.to = new Date(`${applied.to}T23:59:59.999`).toISOString();
    return p;
  }, [applied, page, limit]);
  const { data, loading, error, reload } = useFetch(() => getMovements(params), [JSON.stringify(params)]);

  function applyFilters(e) {
    e.preventDefault();
    if (f.from && f.to && f.from > f.to) return setRangeError("The 'From' date cannot be after the 'To' date.");
    setRangeError("");
    setPage(1);
    setApplied(f);
  }
  function resetFilters() {
    setRangeError("");
    setPage(1);
    setF(emptyFilters);
    setApplied(emptyFilters);
  }

  const [editing, setEditing] = useState(null); // movement row
  const [form, setForm] = useState({ quantity: "", note: "", reference: "" });
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);

  function openEdit(m) {
    setFormError("");
    setForm({ quantity: String(m.quantity ?? ""), note: m.note ?? "", reference: m.reference ?? "" });
    setEditing(m);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setFormError("");
    const payload = { note: form.note };
    if (!isTransfer(editing)) payload.reference = form.reference;
    if (!isTransfer(editing) && !isUnitScan(editing) && Number(form.quantity) !== Number(editing.quantity)) {
      const q = Number(form.quantity);
      if (!Number.isInteger(q) || q < 1) return setFormError("Quantity must be a whole number, 1 or more.");
      payload.quantity = q;
    }
    setBusy(true);
    try {
      await updateMovement(editing.id, payload);
      setEditing(null);
      await loadLookups(true);
      reload();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    let warning;
    if (isTransfer(m)) {
      warning = "This transfer will be undone: both of its entries are deleted and the pieces return to the source warehouse.";
    } else if (m.source === "RECEIVE" && m.box_id) {
      warning = `This is the receipt of box ${m.Box?.code || ""}. Deleting it deletes the WHOLE box, its pieces and all of its movements.`;
    } else {
      warning = "The stock, box quantity and individual pieces are changed back as if this movement never happened.";
    }
    if (!window.confirm(`Delete this ${m.type} movement of ${m.quantity} (${nameOf(m, "Item")})?\n\n${warning}`)) return;
    setPageError("");
    try {
      await deleteMovement(m.id);
      await loadLookups(true);
      reload();
    } catch (err) {
      setPageError(errText(err));
    }
  }

  const actions =
    canManage &&
    ((m) => (
      <div className="row-actions">
        <button className="link" onClick={() => openEdit(m)}>Edit</button>
        <button className="link danger" onClick={() => remove(m)}>Delete</button>
      </div>
    ));

  return (
    <>
      <style>{`
        .stock-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
        .stock-head h1 { margin: 0; }
        .stock-refresh { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 42px; padding: 0 17px; border: 1px solid var(--border, #e8ecf2); border-radius: 10px; background: var(--surface, #ffffff); color: var(--text, #172033); font-size: 13px; font-weight: 700; cursor: pointer; transition: border-color .2s, transform .2s; }
        .stock-refresh:hover { border-color: var(--primary, #4f46e5); transform: translateY(-1px); }
        .stock-refresh:disabled { cursor: wait; opacity: .65; }
        .stock-refresh span { display: inline-block; font-size: 18px; line-height: 1; }
      `}</style>
      <div className="stock-head">
        <h1>Movements</h1>
        <button className="stock-refresh" type="button" onClick={reload} disabled={loading} aria-label="Refresh movements">
          <span aria-hidden="true">↻</span>
          Refresh data
        </button>
      </div>
      <form className="toolbar" onSubmit={applyFilters}>
        <FormField label="Warehouse" value={f.warehouse_id} onChange={(e) => setF({ ...f, warehouse_id: e.target.value })}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
        <FormField label="Item" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}
          options={extractList(items.data).map((i) => ({ value: i.id, label: i.model ? `${i.name} (${i.model})` : i.name }))} />
        <FormField label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}
          options={[
            { value: "IN", label: "In" },
            { value: "OUT", label: "Out" },
            { value: "ADJUST", label: "Adjust (stock count)" },
            { value: "TRANSFER_IN", label: "Transfer in" },
            { value: "TRANSFER_OUT", label: "Transfer out" },
          ]} />
        <FormField label="From date" type="date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <FormField label="To date" type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <FormField label="Box code" value={f.box_code} onChange={(e) => setF({ ...f, box_code: e.target.value })} />
        <button className="primary">Apply</button>
        <button type="button" onClick={resetFilters}>Reset</button>
      </form>
      <ErrorMessage error={error || pageError || rangeError} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} actions={actions || undefined} />}
      <Pager page={page} limit={limit} total={data?.meta?.total ?? extractList(data).length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />

      {editing && (
        <Modal title={`Edit movement #${editing.id}`} onClose={() => setEditing(null)}>
          <ErrorMessage error={formError} />
          <p className="muted">
            {editing.type} · {nameOf(editing, "Item")} · {nameOf(editing, "Warehouse")}
            {editing.Box?.code ? ` · ${editing.Box.code}` : ""}
          </p>
          <p className="muted">
            Changing the quantity automatically updates warehouse stock, the box, the individual pieces and
            the running balance of every later movement.
          </p>
          <form onSubmit={saveEdit}>
            <FormField label="Quantity" type="number" min="1" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              disabled={isTransfer(editing) || isUnitScan(editing)}
              hint={isTransfer(editing) ? "Transfers cannot be re-quantified. Delete the transfer and create a new one."
                : isUnitScan(editing) ? "A single-piece scan is always quantity 1." : undefined} required />
            <FormField label="Reference" value={form.reference} disabled={isTransfer(editing)}
              onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            <FormField label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className="primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function LowStockPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const { data, loading, error, reload } = useFetch(getLowStock);
  return (
    <>
      <div className="rf-head">
        <h1>Low stock</h1>
        <RefreshButton onClick={reload} busy={loading} />
      </div>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={pageSlice(extractList(data), page, limit)} empty="Nothing is below minimum stock." />}
      <Pager page={page} limit={limit} total={extractList(data).length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />
    </>
  );
}
