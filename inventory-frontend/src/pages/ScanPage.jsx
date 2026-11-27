import { useCallback, useEffect, useState } from "react";
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
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const dateAtCurrentLocalTime = (date) => {
  if (!date) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  const now = new Date();
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
};

const STATUS_STYLES = {
  AVAILABLE: { text: "✔ AVAILABLE", bg: "#dcfce7", color: "#166534", border: "#4ade80" },
  ISSUED: { text: "⛔ ALREADY ISSUED", bg: "#fee2e2", color: "#b91c1c", border: "#f87171" },
  DAMAGED: { text: "⚠ DAMAGED", bg: "#ffedd5", color: "#c2410c", border: "#fb923c" },
  LOST: { text: "⛔ LOST", bg: "#fee2e2", color: "#b91c1c", border: "#f87171" },
};
/** Big, colour-coded status: green = available, red = already out. */
function UnitStatusBadge({ status, large = false }) {
  const key = String(status || "").toUpperCase();
  const s = STATUS_STYLES[key] || { text: key || "—", bg: "#e5e7eb", color: "#374151", border: "#9ca3af" };
  return (
    <span style={{ display: "inline-block", padding: large ? "8px 18px" : "4px 12px", borderRadius: 999, fontWeight: 800, letterSpacing: ".04em", fontSize: large ? 16 : 13, background: s.bg, color: s.color, border: `2px solid ${s.border}` }}>
      {s.text}
    </span>
  );
}
const localDay = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
    add("Status", has(unit.status) ? <UnitStatusBadge status={unit.status} /> : null);
    add("Item", item.name); add("SKU", item.sku); add("Brand", item.brand); add("Model", item.model); add("Category", category);
    add("Warehouse", result.warehouse?.name || resolveName("warehouse_id", unit.warehouse_id));
    add("Box", result.box?.code);
    add("Received at", has(unit.received_at) ? formatValue(unit.received_at, "received_at") : null);
    const dates = result.unit_dates || {};
    add("Out date", has(dates.out_date) ? `${formatValue(dates.out_date, "received_at")}${dates.out_by ? ` · by ${dates.out_by}` : ""}` : null);
    add("Re-in date", has(dates.reentry_date) ? `${formatValue(dates.reentry_date, "received_at")}${dates.reentry_by ? ` · by ${dates.reentry_by}` : ""}` : null);
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
    movement_date: todayLocal(),
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

    if (adj.action === "IN" && !adj.note.trim()) {
      setError("Please enter the reason for the return (why is this item coming back in?).");
      return;
    }

    if (isUnit && adj.action === "IN" && adj.movement_date && unitDates.out_date && adj.movement_date < localDay(unitDates.out_date)) {
      setError(`The re-in date cannot be before the out date (${localDay(unitDates.out_date)}).`);
      return;
    }

    const payload = {
      action: adj.action,
      quantity: isUnit ? 1 : quantity,
      performed_by: performedBy,
      note: adj.note.trim() || undefined,
      movement_at: dateAtCurrentLocalTime(adj.movement_date),
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
        `${actionLabel} of ${quantity} recorded successfully by ${performedBy}.`
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

  // Only offer the actions that can actually happen:
  //  - a single piece that is out (issued/damaged/lost) can only come back IN; one that is available can only go OUT
  //  - a box or item with nothing left in stock cannot go OUT
  const unitStatus = isUnit ? String(result.unit?.status || "").toUpperCase() : "";
  const qtyLeft = isBox
    ? Number(result.box?.quantity ?? result.current_quantity)
    : isItem ? Number(result.total_quantity) : NaN;
  const canOut = isUnit ? unitStatus === "AVAILABLE" : !(qtyLeft <= 0);
  const canIn = isUnit ? unitStatus !== "AVAILABLE" : true;
  const actionOptions = [
    ...(canOut ? [{ value: "OUT", label: "OUT (remove)" }] : []),
    ...(canIn ? [{ value: "IN", label: isUnit ? "RE-IN (return)" : "IN (add)" }] : []),
  ];
  const unitDates = isUnit ? result.unit_dates || {} : {};
  const dateLabel = adj.action === "OUT" ? "Out date" : isUnit ? "Re-in date" : "In date";
  const actionLabel = adj.action === "IN" && isUnit ? "RE-IN" : adj.action;
  const allowedKey = actionOptions.map((o) => o.value).join(",");

  // Keep the selected action valid whenever the scanned code (or its status) changes.
  useEffect(() => {
    if (!result) return;
    const allowed = allowedKey.split(",").filter(Boolean);
    if (allowed.length && !allowed.includes(adj.action)) {
      setAdj((previous) => ({ ...previous, action: allowed[0] }));
    }
  }, [result, allowedKey, adj.action]);

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

            {isUnit && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", margin: "4px 0 16px", padding: "12px 16px", borderRadius: 12, background: unitStatus === "AVAILABLE" ? "#f0fdf4" : "#fef2f2", border: `2px solid ${unitStatus === "AVAILABLE" ? "#4ade80" : "#f87171"}` }}>
                <UnitStatusBadge status={unitStatus} large />
                <span style={{ fontWeight: 600 }}>
                  {unitStatus === "AVAILABLE"
                    ? "In stock — it can be taken OUT."
                    : `This item is already out${unitDates.out_date ? ` (out on ${formatValue(unitDates.out_date, "received_at")})` : ""} — only RE-IN is possible.`}
                </span>
              </div>
            )}

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
                options={actionOptions}
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

              <FormField
                label={dateLabel}
                type="date"
                value={adj.movement_date}
                onChange={(e) => setAdj({ ...adj, movement_date: e.target.value })}
                hint="Defaults to today. Clear the date to record the current date and time."
              />

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
              label={adj.action === "IN" ? (isUnit ? "Reason for re-in *" : "Reason for return / re-in *") : "Note"}
              value={adj.note}
              onChange={(e) =>
                setAdj({
                  ...adj,
                  note: e.target.value,
                })
              }
              placeholder={adj.action === "IN" ? "Sent back by the customer: faulty unit" : "Site installation"}
            />

            <div className="row-actions">
              <button
                type="submit"
                className="primary"
                disabled={busy}
              >
                {busy
                  ? "Saving..."
                  : `Confirm ${actionLabel}`}
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