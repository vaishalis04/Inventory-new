import { useState } from "react";
import { getLowStock, getMovements, getStock, listItems, listWarehouses } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import { ErrorMessage, Loading } from "../components/LoadingState";

export function StockPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const warehouses = useFetch(() => listWarehouses());
  const { data, loading, error, reload } = useFetch(() => getStock({ warehouse_id: warehouseId }), [warehouseId]);
  return (
    <>
      <h1>Stock</h1>
      <div className="toolbar">
        <FormField label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
      </div>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} />}
    </>
  );
}

export function MovementsPage() {
  const [f, setF] = useState({ item_id: "", box_code: "", limit: "50" });
  const [applied, setApplied] = useState(f);
  const items = useFetch(() => listItems({ limit: 500 }));
  const { data, loading, error, reload } = useFetch(() => getMovements(applied), [JSON.stringify(applied)]);
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
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} />}
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
