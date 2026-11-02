
import { useCallback, useState } from "react";
import {
  adjustScannedCode,
  listWarehouses,
  scanCode,
} from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import DataView from "../components/DataView";
import { ErrorMessage, Success } from "../components/LoadingState";
import CameraScanner from "../components/ScanCamera";

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
    <>
      <h1>Scan</h1>

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

            {isBox && (
              <p>
                Quantity:{" "}
                <b>
                  {result.current_quantity ??
                    result.quantity}
                </b>

                {result.initial_quantity != null && (
                  <> of {result.initial_quantity}</>
                )}

                {result.status && (
                  <>
                    {" "}· Status: <b>{result.status}</b>
                  </>
                )}

                {result.location && (
                  <>
                    {" "}· Location:{" "}
                    <b>{result.location}</b>
                  </>
                )}
              </p>
            )}

            {isUnit && <p>Individual item code: <b>{result.unit?.code}</b> · Status: <b>{result.unit?.status}</b></p>}

            {isItem && result.total_quantity != null && (
              <p>
                Total quantity:{" "}
                <b>{result.total_quantity}</b>
              </p>
            )}

            <DataView
              data={result}
              skip={["type"]}
            />
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
    </>
  );
}
