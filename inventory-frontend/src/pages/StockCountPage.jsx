import { useState } from "react";
import { countStock, listItems, listWarehouses } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import { ErrorMessage, Success } from "../components/LoadingState";
import DataView from "../components/DataView";

export default function StockCountPage() {
  const warehouses = useFetch(() => listWarehouses());
  const items = useFetch(() => listItems({ limit: 200 }));
  const [f, setF] = useState({ warehouse_id: "", item_id: "", counted_quantity: "", note: "" });
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setResult(null);
    const counted = Number(f.counted_quantity);
    if (!(counted >= 0) || f.counted_quantity === "") return setError("Enter the counted quantity (0 or more).");
    const itemName = extractList(items.data).find((i) => String(i.id) === f.item_id)?.name;
    const whName = extractList(warehouses.data).find((w) => String(w.id) === f.warehouse_id)?.name;
    if (!window.confirm(`Set the stock of "${itemName}" in "${whName}" to ${counted}? This corrects recorded stock.`)) return;
    setBusy(true);
    try {
      const res = await countStock({ warehouse_id: Number(f.warehouse_id), item_id: Number(f.item_id), counted_quantity: counted, note: f.note || undefined });
      setResult(res.data ?? {});
      setF({ ...f, counted_quantity: "", note: "" });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h1>Stock count</h1>
      <ErrorMessage error={error} />
      {result && (
        <>
          <Success>Stock count recorded.</Success>
          <div className="card"><h2>Count result</h2><DataView data={result} /></div>
        </>
      )}
      <form className="card" onSubmit={handleSubmit}>
        <div className="grid">
          <FormField label="Warehouse" value={f.warehouse_id} onChange={set("warehouse_id")} required
            options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
          <FormField label="Item" value={f.item_id} onChange={set("item_id")} required
            options={extractList(items.data).map((i) => ({ value: i.id, label: [i.name, i.model].filter(Boolean).join(" — ") }))} />
          <FormField label="Counted quantity" type="number" min="0" value={f.counted_quantity} onChange={set("counted_quantity")} required />
        </div>
        <FormField label="Note / reason" value={f.note} onChange={set("note")} placeholder="Monthly stock take" />
        <button className="primary" disabled={busy}>{busy ? "Saving..." : "Submit count"}</button>
      </form>
    </>
  );
}
