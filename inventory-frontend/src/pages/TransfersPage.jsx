import { useState } from "react";
import { listItems, listWarehouses, transferStock } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import { ErrorMessage, Success } from "../components/LoadingState";

export default function TransfersPage() {
  const warehouses = useFetch(() => listWarehouses());
  const items = useFetch(() => listItems({ limit: 200 }));
  const [mode, setMode] = useState("box");
  const [f, setF] = useState({ box_code: "", item_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "", note: "" });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const whOpts = extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setOk("");
    const payload = { to_warehouse_id: Number(f.to_warehouse_id), note: f.note || undefined };
    if (mode === "box") payload.box_code = f.box_code.trim();
    else {
      payload.item_id = Number(f.item_id);
      payload.from_warehouse_id = Number(f.from_warehouse_id);
      payload.quantity = Number(f.quantity);
      if (!(payload.quantity > 0)) return setError("Quantity must be greater than 0.");
      if (payload.from_warehouse_id === payload.to_warehouse_id) return setError("Source and destination must differ.");
    }
    const what = mode === "box" ? `box ${payload.box_code}` : `${payload.quantity} loose unit(s)`;
    if (!window.confirm(`Transfer ${what} to the selected warehouse?`)) return;
    setBusy(true);
    try {
      await transferStock(payload);
      setOk("Transfer completed.");
      setF({ ...f, box_code: "", quantity: "", note: "" });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h1>Transfer stock</h1>
      <ErrorMessage error={error} />
      <Success>{ok}</Success>
      <form className="card" onSubmit={handleSubmit}>
        <div className="tabs">
          <button type="button" className={mode === "box" ? "active" : ""} onClick={() => setMode("box")}>Whole box</button>
          <button type="button" className={mode === "loose" ? "active" : ""} onClick={() => setMode("loose")}>Loose units</button>
        </div>
        {mode === "box" ? (
          <FormField label="Box code" value={f.box_code} onChange={set("box_code")} placeholder="BOX-3F9A1C22AB" required />
        ) : (
          <div className="grid">
            <FormField label="Item" value={f.item_id} onChange={set("item_id")} required
              options={extractList(items.data).map((i) => ({ value: i.id, label: [i.name, i.model].filter(Boolean).join(" — ") }))} />
            <FormField label="From warehouse" value={f.from_warehouse_id} onChange={set("from_warehouse_id")} options={whOpts} required />
            <FormField label="Quantity" type="number" min="1" value={f.quantity} onChange={set("quantity")} required />
          </div>
        )}
        <FormField label="To warehouse" value={f.to_warehouse_id} onChange={set("to_warehouse_id")} options={whOpts} required />
        <FormField label="Note" value={f.note} onChange={set("note")} />
        <button className="primary" disabled={busy}>{busy ? "Transferring..." : "Transfer"}</button>
      </form>
    </>
  );
}
