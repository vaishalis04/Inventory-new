import { useState } from "react";
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
import { AutoTable } from "../components/DataTable";
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
  const warehouses = useFetch(() => listWarehouses());
  const { data, loading, error, reload } = useFetch(
    () => getStock({ warehouse_id: warehouseId }),
    [warehouseId]
  );

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
      reload();
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
      reload();
    } catch (err) {
      setPageError(errText(err));
    }
  }

  const actions =
    canManage &&
    ((row) => (
      <div className="row-actions">
        <button className="link" onClick={() => openEdit(row)}>Edit</button>
        <button className="link danger" onClick={() => remove(row)}>Delete</button>
      </div>
    ));

  return (
    <>
      <h1>Stock</h1>
      <div className="toolbar">
        <FormField label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
      </div>
      <ErrorMessage error={error || pageError} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} actions={actions || undefined} />}

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

  const [f, setF] = useState({ item_id: "", box_code: "", limit: "50" });
  const [applied, setApplied] = useState(f);
  const items = useFetch(() => listItems({ limit: 500 }));
  const { data, loading, error, reload } = useFetch(() => getMovements(applied), [JSON.stringify(applied)]);

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
      <h1>Movements</h1>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <FormField label="Item" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}
          options={extractList(items.data).map((i) => ({ value: i.id, label: i.model ? `${i.name} (${i.model})` : i.name }))} />
        <FormField label="Box code" value={f.box_code} onChange={(e) => setF({ ...f, box_code: e.target.value })} />
        <FormField label="Limit" type="number" min="1" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
        <button className="primary">Apply</button>
      </form>
      <ErrorMessage error={error || pageError} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} actions={actions || undefined} />}

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
  const { data, loading, error, reload } = useFetch(getLowStock);
  return (
    <>
      <h1>Low stock</h1>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} empty="Nothing is below minimum stock." />}
    </>
  );
}
