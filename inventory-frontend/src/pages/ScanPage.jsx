
import { useCallback, useState } from "react";
import {
  adjustScannedCode,
  listWarehouses,
  scanCode,
} from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import DataTable from "../components/DataTable";
import { formatValue, pretty } from "../utils/format";
import { loadLookups, resolveName, useLookups } from "../utils/lookup";
import { ErrorMessage, Success } from "../components/LoadingState";
import CameraScanner from "../components/ScanCamera";

const has = (v) => v !== null && v !== undefined && v !== "";

/** One block with only the relevant facts (no repeated item / unit / warehouse sections). */
function ScanDetails({ result }) {
  useLookups();
  const item = result.item || {};
  const fields = [];
  const add = (label, value) => { if (has(value) && !fields.some(([l]) => l === label)) fields.push([label, value]); };
  const category = item.Category?.name || resolveName("category_id", item.category_id);

  if (result.type === "UNIT") {
    const unit = result.unit || {};
    add("Barcode / serial", unit.code);
    add("Status", has(unit.status) ? formatValue(unit.status, "status") : null);
    add("Item", item.name); add("SKU", item.sku); add("Brand", item.brand); add("Model", item.model); add("Category", category);
    add("Warehouse", result.warehouse?.name || resolveName("warehouse_id", unit.warehouse_id));
    add("Box", result.box?.code);
    add("Received at", has(unit.received_at) ? formatValue(unit.received_at, "received_at") : null);
    add("Note", unit.note);
  } else if (result.type === "BOX") {
    const box = result.box || result;
    add("Box code", box.code);
    add("Quantity", has(box.quantity ?? result.current_quantity) ? `${box.quantity ?? result.current_quantity}${has(box.initial_quantity ?? result.initial_quantity) ? ` of ${box.initial_quantity ?? result.initial_quantity}` : ""}` : null);
    add("Status", has(box.status) ? formatValue(box.status, "status") : null);
    add("Item", item.name); add("SKU", item.sku); add("Brand", item.brand); add("Model", item.model); add("Category", category);
    add("Warehouse", result.warehouse?.name || resolveName("warehouse_id", box.warehouse_id));
    add("Location", box.location); add("Batch no", box.batch_no);
    add("Supplier", result.supplier?.name);
    add("Received at", has(box.received_at) ? formatValue(box.received_at, "received_at") : null);
  } else {
    add("Item", item.name); add("SKU", item.sku); add("Brand", item.brand); add("Model", item.model); add("Category", category);
    add("Unit", item.unit); add("Min stock", item.min_stock);
    add("Item QR code", item.qr_code);
    add("Total quantity", result.total_quantity);
  }
  if (item.custom_fields && typeof item.custom_fields === "object") {
    Object.entries(item.custom_fields).forEach(([key, value]) => {
      if (value !== null && typeof value !== "object" && has(value)) add(pretty(key), String(value));
    });
  }

  const section = (title, node) => (<section className="sub dark-sub"><h3>{title}</h3>{node}</section>);
  const stock = Array.isArray(result.stock) ? result.stock : [];
  const boxes = Array.isArray(result.boxes) ? result.boxes : [];
  const units = Array.isArray(result.units) ? result.units : [];
  const moves = Array.isArray(result.recent_movements) ? result.recent_movements : [];

  return (
    <div className="dark-data-view">
      <dl className="kv dark-kv">
        {fields.map(([label, value]) => (<div key={label}><dt>{label}</dt><dd>{value}</dd></div>))}
      </dl>

      {stock.length > 0 && section("Stock by warehouse", <DataTable rows={stock} columns={[
        { key: "warehouse", label: "Warehouse", render: (r) => r.Warehouse?.name || resolveName("warehouse_id", r.warehouse_id) || "—" },
        { key: "quantity", label: "Quantity", render: (r) => formatValue(r.quantity, "quantity") },
      ]} />)}
      {boxes.length > 0 && section("Active boxes", <DataTable rows={boxes} columns={[
        { key: "code", label: "Box code", render: (r) => r.code },
        { key: "warehouse", label: "Warehouse", render: (r) => resolveName("warehouse_id", r.warehouse_id) || "—" },
        { key: "quantity", label: "Quantity", render: (r) => `${r.quantity}${has(r.initial_quantity) ? ` of ${r.initial_quantity}` : ""}` },
        { key: "location", label: "Location", render: (r) => formatValue(r.location, "location") },
      ]} />)}
      {units.length > 0 && section("Individual items in this box", <DataTable rows={units} columns={[
        { key: "code", label: "Code", render: (r) => r.code },
        { key: "status", label: "Status", render: (r) => formatValue(r.status, "status") },
        { key: "received_at", label: "Received at", render: (r) => formatValue(r.received_at, "received_at") },
      ]} />)}
      {moves.length > 0 && section("Recent movements", <DataTable rows={moves} columns={[
        { key: "when", label: "Date & time", render: (m) => formatValue(m.createdAt ?? m.created_at, "createdAt") },
        { key: "type", label: "Type", render: (m) => formatValue(m.type, "type") },
        { key: "change", label: "In / Out", render: (m) => (Number(m.change) > 0 ? `+${m.change}` : String(m.change)) },
        { key: "balance_after", label: "Balance after", render: (m) => formatValue(m.balance_after, "balance_after") },
        { key: "user", label: "By", render: (m) => m.User?.name || "—" },
        { key: "note", label: "Note", render: (m) => formatValue(m.note, "note") },
      ]} />)}
    </div>
  );
}

export default function ScanPage() {
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);

  const [adj, setAdj] = useState({
    action: "OUT",
    quantity: "",
    note: "",
    warehouse_id: "",
    box_code: "",
    performed_by: "",
  });

  const warehouses = useFetch(() => listWarehouses());

  const lookup = useCallback(async (value) => {
    const clean = String(value ?? "").trim();

    if (!clean) {
      setError("Enter or scan a box/item code.");
      return;
    }

    setError("");
    setNotice("");
    setBusy(true);

    try {
      const res = await scanCode(clean);

      setResult(res.data);
      setScanned(clean);
      if (res.data?.type === "UNIT") setAdj(previous => ({ ...previous, quantity: "1" }));
    } catch (err) {
      setResult(null);

      setError(
        err.status === 404
          ? `No box or item found for "${clean}".`
          : err.message || "Unable to look up the scanned code."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  function handleCameraDetect(text) {
    setCamera(false);
    setCode(text);
    lookup(text);
  }

  async function handleAdjust(e) {
    e.preventDefault();

    setError("");
    setNotice("");

    if (!result || !scanned) {
      setError("Scan or look up an item before adjusting stock.");
      return;
    }

    const performedBy = adj.performed_by.trim();

    if (!performedBy) {
      setError(
        "Please enter the name of the person performing this adjustment."
      );
      return;
    }

    const quantity = Number(adj.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }

    const payload = {
      action: adj.action,
      quantity: isUnit ? 1 : quantity,
      performed_by: performedBy,
      note: adj.note.trim() || undefined,
    };

    if (result.type === "ITEM") {
      if (adj.warehouse_id) {
        payload.warehouse_id = Number(adj.warehouse_id);
      }

      if (adj.action === "OUT") {
        if (adj.box_code.trim()) {
          payload.box_code = adj.box_code.trim();
        } else {
          payload.auto_box = true;
        }
      }
    }

    setBusy(true);

    try {
      await adjustScannedCode(scanned, payload);

      setNotice(
        `${adj.action} of ${quantity} recorded successfully by ${performedBy}.`
      );

      setAdj((previous) => ({
        ...previous,
        quantity: "",
        note: "",
        box_code: "",
      }));

      await lookup(scanned);
    } catch (err) {
      setError(
        err.message || "Unable to record the stock adjustment."
      );

      if (err.status === 409) {
        await lookup(scanned);
      }
    } finally {
      setBusy(false);
    }
  }

  // Refresh: reload names/warehouses and re-read the currently looked-up code (new quantities, status, history).
  async function refreshPage() {
    setNotice("");
    await loadLookups(true);
    warehouses.reload();
    if (scanned) await lookup(scanned);
  }

  const isBox = result?.type === "BOX";
  const isItem = result?.type === "ITEM";
  const isUnit = result?.type === "UNIT";

  const warehouseOptions = extractList(
    warehouses.data
  ).map((warehouse) => ({
    value: warehouse.id,
    label: warehouse.name,
  }));

  return (
    <div className="page page-scan">
      <style>{`
        .stock-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
        .stock-head h1 { margin: 0; }
        .stock-refresh { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 42px; padding: 0 17px; border: 1px solid var(--border, #e8ecf2); border-radius: 10px; background: var(--surface, #ffffff); color: var(--text, #172033); font-size: 13px; font-weight: 700; cursor: pointer; transition: border-color .2s, transform .2s; }
        .stock-refresh:hover { border-color: var(--primary, #4f46e5); transform: translateY(-1px); }
        .stock-refresh:disabled { cursor: wait; opacity: .65; }
        .stock-refresh span { display: inline-block; font-size: 18px; line-height: 1; }
      `}</style>
      <div className="stock-head">
        <h1>Scan</h1>
        <button className="stock-refresh" type="button" onClick={refreshPage} disabled={busy} aria-label="Refresh scan page">
          <span aria-hidden="true">↻</span>
          Refresh data
        </button>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setError("");
            setCamera((previous) => !previous);
          }}
        >
          {camera ? "Close camera" : "Scan with camera"}
        </button>
      </div>

      {camera && (
        <CameraScanner
          onDetect={handleCameraDetect}
          onClose={() => setCamera(false)}
        />
      )}

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(code);
        }}
      >
        <FormField
          label="Or type / use a USB scanner"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="BOX-3F9A1C22AB"
        />

        <button
          type="submit"
          className="primary"
          disabled={busy}
        >
          {busy ? "Please wait..." : "Look up"}
        </button>
      </form>

      <ErrorMessage error={error} />
      <Success>{notice}</Success>

      {result && (
        <>
          <div className="card">
            <h2>
              <span className="badge">{result.type}</span>{" "}
              {result.item?.name ??
                result.name ??
                scanned}
            </h2>

            <ScanDetails result={result} />
          </div>

          <form
            className="card"
            onSubmit={handleAdjust}
          >
            <h2>Adjust stock</h2>

            <div className="grid">
              <FormField
                label="Action"
                value={adj.action}
                onChange={(e) =>
                  setAdj({
                    ...adj,
                    action: e.target.value,
                  })
                }
                options={[
                  {
                    value: "OUT",
                    label: "OUT (remove)",
                  },
                  {
                    value: "IN",
                    label: "IN (add)",
                  },
                ]}
              />

              {!isUnit && <FormField
                label="Quantity"
                type="number"
                min="0.01"
                step="any"
                value={adj.quantity}
                onChange={(e) =>
                  setAdj({
                    ...adj,
                    quantity: e.target.value,
                  })
                }
                required
              />}

              {isItem && (
                <FormField
                  label="Warehouse"
                  value={adj.warehouse_id}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      warehouse_id: e.target.value,
                    })
                  }
                  options={warehouseOptions}
                />
              )}

              {isItem && adj.action === "OUT" && (
                <FormField
                  label="Box code (optional)"
                  value={adj.box_code}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      box_code: e.target.value,
                    })
                  }
                  hint="Leave empty to auto-pick a box"
                />
              )}
            </div>

            <FormField
              label="Adjustment performed by"
              value={adj.performed_by}
              onChange={(e) =>
                setAdj({
                  ...adj,
                  performed_by: e.target.value,
                })
              }
              placeholder="Enter the person's full name"
              required
            />

            <FormField
              label="Note"
              value={adj.note}
              onChange={(e) =>
                setAdj({
                  ...adj,
                  note: e.target.value,
                })
              }
              placeholder="Site installation"
            />

            <div className="row-actions">
              <button
                type="submit"
                className="primary"
                disabled={busy}
              >
                {busy
                  ? "Saving..."
                  : `Confirm ${adj.action}`}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setResult(null);
                  setScanned("");
                  setCode("");
                  setError("");
                  setNotice("");
                  setCamera(true);
                }}
              >
                Scan next
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
