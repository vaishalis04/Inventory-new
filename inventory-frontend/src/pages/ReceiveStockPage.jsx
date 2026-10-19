
import { useMemo, useState } from "react";
import { loadLookups } from "../utils/lookup";
import {
  listCategories,
  listItems,
  listSuppliers,
  listWarehouses,
  openPrintSheet,
  receiveStock,
} from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import QrImage from "../components/QrImage";
import { ErrorMessage } from "../components/LoadingState";
import DataView from "../components/DataView";
import { AutoTable } from "../components/DataTable";

const NEW_ITEM = {
  category_id: "",
  name: "",
  model: "",
  brand: "",
  description: "",
  unit: "pcs",
  units_per_box: "50",
  purchase_price: "",
  sale_price: "",
  min_stock: "",
  custom_fields: "",
};

const opt = (rows, label = "name") =>
  extractList(rows).map((row) => ({
    value: row.id,
    label: row[label] ?? row.id,
  }));

const validPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
};

export default function ReceiveStockPage() {
  const warehouses = useFetch(() => listWarehouses());
  const categories = useFetch(listCategories);
  const suppliers = useFetch(() => listSuppliers());
  const items = useFetch(() => listItems({ limit: 200 }));

  const [mode, setMode] = useState("new");
  const [warehouseId, setWarehouseId] = useState("");
  const [itemId, setItemId] = useState("");
  const [item, setItem] = useState(NEW_ITEM);

  // Each row represents a group of physical boxes with the same
  // number of individual pieces per box.
  const [boxes, setBoxes] = useState([{ count: "1" }]);

  const [extra, setExtra] = useState({
    supplier_id: "",
    batch_no: "",
    location: "",
    reference: "",
  });

  const [print, setPrint] = useState({
    enabled: true,
    print_item_labels: true,
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const itemRows = useMemo(
    () => extractList(items.data),
    [items.data]
  );

  const selectedItem = useMemo(
    () => itemRows.find((row) => String(row.id) === String(itemId)),
    [itemRows, itemId]
  );

  const unitsPerBox = Number(
    mode === "new"
      ? item.units_per_box
      : selectedItem?.units_per_box
  );

  const validUnitsPerBox = validPositiveInteger(unitsPerBox);

  const itemUnit =
    mode === "new"
      ? item.unit || "pcs"
      : selectedItem?.unit || "pcs";

  const totalPhysicalBoxes = boxes.reduce(
    (sum, box) => sum + (validPositiveInteger(box.count) ? Number(box.count) : 0),
    0
  );

  const totalPieces = validUnitsPerBox
    ? totalPhysicalBoxes * unitsPerBox
    : 0;

  const setI = (key) => (e) =>
    setItem((previous) => ({
      ...previous,
      [key]: e.target.value,
    }));

  const setE = (key) => (e) =>
    setExtra((previous) => ({
      ...previous,
      [key]: e.target.value,
    }));

  const setBox = (index, value) =>
    setBoxes((previous) =>
      previous.map((box, i) =>
        i === index ? { count: value } : box
      )
    );

  function resetForAnotherReceipt() {
    setResult(null);
    setError("");
    setBoxes([{ count: "1" }]);
    setExtra({
      supplier_id: "",
      batch_no: "",
      location: "",
      reference: "",
    });
    setPrint({
      enabled: true,
      print_item_labels: true,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!warehouseId) {
      setError("Select a warehouse.");
      return;
    }

    if (mode === "existing" && !itemId) {
      setError("Select an item.");
      return;
    }

    if (mode === "existing" && !selectedItem) {
      setError(
        "The selected item could not be loaded. Refresh the item list and try again."
      );
      return;
    }

    if (!validUnitsPerBox) {
      setError(
        mode === "existing"
          ? "The selected item does not have a valid Units Per Box value. Update the item or reload the item list."
          : "Enter a valid positive whole number for Pieces Per Box."
      );
      return;
    }

    if (!boxes.length) {
      setError("Add at least one box entry.");
      return;
    }

    const boxCounts = boxes.map((box) => Number(box.count));

    if (boxCounts.some((count) => !validPositiveInteger(count))) {
      setError(
        "Every box entry must have a positive whole number of physical boxes."
      );
      return;
    }

    const num = (value) =>
      value === "" ? undefined : Number(value);

    let itemPart;

    if (mode === "new") {
      if (!item.name.trim()) {
        setError("Enter the item name.");
        return;
      }

      if (!item.category_id) {
        setError("Select a category.");
        return;
      }

      let customFields;

      try {
        customFields = item.custom_fields.trim()
          ? JSON.parse(item.custom_fields)
          : undefined;

        if (
          customFields !== undefined &&
          (customFields === null ||
            Array.isArray(customFields) ||
            typeof customFields !== "object")
        ) {
          setError("Custom fields must be a JSON object.");
          return;
        }
      } catch {
        setError("Custom fields must be valid JSON.");
        return;
      }

      itemPart = {
        item: {
          ...item,
          category_id: Number(item.category_id),
          units_per_box: unitsPerBox,
          purchase_price: num(item.purchase_price),
          sale_price: num(item.sale_price),
          min_stock: num(item.min_stock),
          custom_fields: customFields,
        },
      };
    } else {
      itemPart = {
        item_id: Number(itemId),
      };
    }

    // One Box row represents one physical box.
    // quantity represents individual pieces inside each box.
    //
    // Example:
    // 2 physical boxes × 50 pieces = 100 individual pieces.
    //
    // The backend receive service creates one row per physical box
    // and increases warehouse stock by the total pieces received.
    const boxList = boxCounts.map((count) => ({
      count,
      quantity: unitsPerBox,
    }));

    const payload = {
      warehouse_id: Number(warehouseId),
      ...itemPart,
      boxes: boxList,
      supplier_id: extra.supplier_id
        ? Number(extra.supplier_id)
        : undefined,
      batch_no: extra.batch_no.trim() || undefined,
      location: extra.location.trim() || undefined,
      reference: extra.reference.trim() || undefined,
      print: {
        enabled: print.enabled,
        print_item_labels: print.print_item_labels,
      },
    };

    setBusy(true);

    try {
      const res = await receiveStock(payload);
      const responseData = res?.data?.data ?? res?.data;

      if (!responseData || !Array.isArray(responseData.boxes)) {
        throw new Error(
          "Stock may have been received, but the server returned an unexpected response. Check the stock list before retrying."
        );
      }

      setResult(responseData);

      try {
        await loadLookups(true);
      } catch {
        // A lookup refresh failure should not hide a successful receipt.
      }

      if (typeof items.refetch === "function") {
        items.refetch();
      }
    } catch (err) {
      setError(
        err.details
          ? `${err.message}: ${JSON.stringify(err.details)}`
          : err.message || "Unable to receive stock."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openSheet(job) {
    try {
      await openPrintSheet(job.id ?? job.job_id);
    } catch (err) {
      setError(err.message || "Unable to open the print sheet.");
    }
  }

  if (result) {
    const jobs = result.print_jobs ?? [];
    const receivedBoxes = result.boxes ?? [];

    const receivedPieces = receivedBoxes.reduce(
      (sum, box) => sum + Number(box.initial_quantity ?? box.quantity ?? 0),
      0
    );

    return (
      <>
        <h1>Stock received</h1>

        <p className="alert success">
          Stock was received successfully.
        </p>

        <div className="card">
          <h2>Receipt summary</h2>

          <p>
            Physical boxes received: <b>{receivedBoxes.length}</b>
          </p>

          <p>
            Pieces per box:{" "}
            <b>{result.item?.units_per_box ?? unitsPerBox}</b>
          </p>

          <p>
            Total pieces received in boxes: <b>{receivedPieces}</b>
          </p>

          <p>
            Loose pieces received: <b>{result.loose_quantity ?? 0}</b>
          </p>

          <p>
            Total pieces received:{" "}
            <b>{receivedPieces + Number(result.loose_quantity ?? 0)}</b>
          </p>

          <p>
            Unit: <b>{result.item?.unit ?? itemUnit}</b>
          </p>
        </div>

        {result.item && (
          <div className="card">
            <h2>Item</h2>
            <DataView data={result.item} />
          </div>
        )}

        <div className="card">
          <h2>Item QR</h2>
          <QrImage
            data={result.item_qr}
            label={result.item?.name}
          />
        </div>

        <div className="card">
          <h2>Boxes ({receivedBoxes.length})</h2>

          <AutoTable
            rows={receivedBoxes}
            hide={[
              "qr",
              "qr_code",
              "qr_image",
              "qr_base64",
            ]}
          />

          <div className="qr-list" style={{ marginTop: "1rem" }}>
            {receivedBoxes.map((box, index) => (
              <QrImage
                key={box.code ?? box.box_code ?? index}
                data={box.qr ?? box}
                label={`${box.code ?? box.box_code ?? "Box"} · ${
                  box.initial_quantity ?? box.quantity ?? 0
                } ${result.item?.unit ?? itemUnit}`}
              />
            ))}
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="card">
            <h2>Print jobs</h2>

            {jobs.map((job, index) => (
              <div className="inline" key={job.id ?? index}>
                <span>
                  Print job {index + 1}{" "}
                  {job.status && (
                    <span className="badge">{job.status}</span>
                  )}
                </span>

                {(job.id ?? job.job_id) && (
                  <button
                    type="button"
                    onClick={() => openSheet(job)}
                  >
                    Open label sheet
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <ErrorMessage error={error} />

        <button
          type="button"
          className="primary"
          onClick={resetForAnotherReceipt}
        >
          Receive more
        </button>
      </>
    );
  }

  return (
    <>
      <h1>Receive stock</h1>

      <ErrorMessage error={error} />

      <form className="card" onSubmit={handleSubmit}>
        <div className="tabs">
          <button
            type="button"
            className={mode === "new" ? "active" : ""}
            onClick={() => {
              setMode("new");
              setError("");
            }}
          >
            New item
          </button>

          <button
            type="button"
            className={mode === "existing" ? "active" : ""}
            onClick={() => {
              setMode("existing");
              setError("");
            }}
          >
            Existing item
          </button>
        </div>

        <FormField
          label="Warehouse"
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          options={opt(warehouses.data)}
          required
        />

        {mode === "existing" ? (
          <>
            <FormField
              label="Item"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setError("");
              }}
              options={itemRows.map((row) => ({
                value: row.id,
                label: [
                  row.name,
                  row.model,
                  row.units_per_box != null
                    ? `${row.units_per_box} ${row.unit || "pcs"}/box`
                    : "Units per box not set",
                ]
                  .filter(Boolean)
                  .join(" — "),
              }))}
              required
            />

            {selectedItem && (
              <div className="card">
                <h3>Selected item details</h3>

                <p>
                  Name: <b>{selectedItem.name}</b>
                </p>

                <p>
                  Unit: <b>{selectedItem.unit || "pcs"}</b>
                </p>

                <p>
                  Pieces per box:{" "}
                  <b>
                    {validPositiveInteger(selectedItem.units_per_box)
                      ? selectedItem.units_per_box
                      : "Not configured"}
                  </b>
                </p>

                {!validPositiveInteger(selectedItem.units_per_box) && (
                  <p className="alert">
                    Set a valid Units Per Box value for this item before
                    receiving boxes. Make sure the item API returns
                    <code> units_per_box </code>.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid">
              <FormField
                label="Category"
                value={item.category_id}
                onChange={setI("category_id")}
                options={opt(categories.data)}
                required
              />

              <FormField
                label="Name"
                value={item.name}
                onChange={setI("name")}
                required
              />

              <FormField
                label="Model"
                value={item.model}
                onChange={setI("model")}
              />

              <FormField
                label="Brand"
                value={item.brand}
                onChange={setI("brand")}
              />

              <FormField
                label="Unit"
                value={item.unit}
                onChange={setI("unit")}
                required
              />

              <FormField
                label="Pieces per box"
                type="number"
                min="1"
                step="1"
                value={item.units_per_box}
                onChange={setI("units_per_box")}
                required
              />

              <FormField
                label="Purchase price"
                type="number"
                min="0"
                step="any"
                value={item.purchase_price}
                onChange={setI("purchase_price")}
              />

              <FormField
                label="Sale price"
                type="number"
                min="0"
                step="any"
                value={item.sale_price}
                onChange={setI("sale_price")}
              />

              <FormField
                label="Minimum stock (pieces)"
                type="number"
                min="0"
                step="1"
                value={item.min_stock}
                onChange={setI("min_stock")}
              />
            </div>

            <FormField
              label="Description"
              value={item.description}
              onChange={setI("description")}
            />

            <FormField
              label="Custom fields (JSON)"
              type="textarea"
              value={item.custom_fields}
              onChange={setI("custom_fields")}
              placeholder='{"resolution":"2MP"}'
            />
          </>
        )}

        <h2>Boxes</h2>

        <p className="muted">
          Enter the number of physical boxes. Each full box contains{" "}
          <b>
            {validUnitsPerBox ? unitsPerBox : "—"} {itemUnit}
          </b>
          . Warehouse stock is tracked in individual pieces.
        </p>

        {boxes.map((box, index) => (
          <div className="inline" key={index}>
            <input
              type="number"
              min="1"
              step="1"
              placeholder={`Number of boxes (entry ${index + 1})`}
              aria-label={`Number of boxes entry ${index + 1}`}
              value={box.count}
              onChange={(e) => setBox(index, e.target.value)}
              required
            />

            <span>
              {validPositiveInteger(box.count) && validUnitsPerBox
                ? `= ${Number(box.count) * unitsPerBox} ${itemUnit}`
                : "Enter valid box and piece quantities"}
            </span>

            {boxes.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setBoxes((previous) =>
                    previous.filter((_, i) => i !== index)
                  )
                }
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setBoxes((previous) => [
              ...previous,
              { count: "1" },
            ])
          }
        >
          + Add box entry
        </button>

        <div className="card">
          <h3>Receipt calculation</h3>

          <p>
            Physical boxes: <b>{totalPhysicalBoxes}</b>
          </p>

          <p>
            Pieces per box:{" "}
            <b>{validUnitsPerBox ? unitsPerBox : "—"}</b>
          </p>

          <p>
            Total individual pieces: <b>{totalPieces}</b>
          </p>
        </div>

        <div className="grid" style={{ marginTop: "1rem" }}>
          <FormField
            label="Supplier"
            value={extra.supplier_id}
            onChange={setE("supplier_id")}
            options={opt(suppliers.data)}
          />

          <FormField
            label="Batch no."
            value={extra.batch_no}
            onChange={setE("batch_no")}
          />

          <FormField
            label="Location"
            value={extra.location}
            onChange={setE("location")}
            placeholder="Rack A1"
          />

          <FormField
            label="Reference"
            value={extra.reference}
            onChange={setE("reference")}
            placeholder="PO-1001"
          />
        </div>

        <label className="inline">
          <input
            type="checkbox"
            checked={print.enabled}
            onChange={(e) =>
              setPrint((previous) => ({
                ...previous,
                enabled: e.target.checked,
              }))
            }
          />
          Generate print jobs
        </label>

        <label className="inline">
          <input
            type="checkbox"
            checked={print.print_item_labels}
            onChange={(e) =>
              setPrint((previous) => ({
                ...previous,
                print_item_labels: e.target.checked,
              }))
            }
          />
          Include item labels
        </label>

        <button
          className="primary"
          disabled={busy}
          type="submit"
        >
          {busy ? "Receiving..." : "Receive stock"}
        </button>
      </form>
    </>
  );
}
