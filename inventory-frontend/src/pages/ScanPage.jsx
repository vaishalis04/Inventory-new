
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
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

/**
 * Camera QR scanner.
 * Calls onDetect(text) once, then stops the camera.
 */
function CameraScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("Starting camera...");
  const [error, setError] = useState("");
  const detectRef = useRef(onDetect);

  detectRef.current = onDetect;

  useEffect(() => {
    let stream;
    let raf;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera is not available. Use HTTPS (or localhost) and a supported browser."
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser and try again."
            : err.name === "NotFoundError"
              ? "No camera found on this device."
              : `Unable to start camera: ${err.message}`
        );
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;

      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      video.srcObject = stream;

      try {
        await video.play();
      } catch {
        // Some browsers may delay video playback.
      }

      if (stopped) return;

      setStatus("Point the camera at a QR code");

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      const hasDetector =
        typeof window.BarcodeDetector !== "undefined";

      let detector = null;

      if (hasDetector) {
        try {
          detector = new window.BarcodeDetector({
            formats: [
              "qr_code",
              "code_128",
              "ean_13",
              "code_39",
            ],
          });
        } catch {
          detector = null;
        }
      }

      let last = 0;
      let detecting = false;

      const tick = async (time) => {
        if (stopped) return;

        raf = requestAnimationFrame(tick);

        if (
          detecting ||
          time - last < 120 ||
          video.readyState < 2 ||
          !video.videoWidth
        ) {
          return;
        }

        last = time;
        detecting = true;

        try {
          let text = "";

          if (detector) {
            try {
              const found = await detector.detect(video);
              text = found[0]?.rawValue || "";
            } catch {
              // Fall back to jsQR below.
            }
          }

          if (!text) {
            const scale = Math.min(
              1,
              640 / video.videoWidth
            );

            canvas.width = Math.round(
              video.videoWidth * scale
            );
            canvas.height = Math.round(
              video.videoHeight * scale
            );

            ctx.drawImage(
              video,
              0,
              0,
              canvas.width,
              canvas.height
            );

            const image = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );

            text =
              jsQR(
                image.data,
                image.width,
                image.height,
                { inversionAttempts: "attemptBoth" }
              )?.data || "";
          }

          if (text && !stopped) {
            stopped = true;
            cancelAnimationFrame(raf);

            stream
              .getTracks()
              .forEach((track) => track.stop());

            navigator.vibrate?.(80);
            detectRef.current(text);
          }
        } catch {
          // Ignore an unreadable camera frame.
        } finally {
          detecting = false;
        }
      };

      raf = requestAnimationFrame(tick);
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);

      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  return (
    <div className="card scanner">
      <div className="scanner-view">
        <video
          ref={videoRef}
          playsInline
          muted
        />
        <div className="scanner-frame" />
        <canvas ref={canvasRef} hidden />
      </div>

      {error ? (
        <p className="alert error">{error}</p>
      ) : (
        <p className="muted">{status}</p>
      )}

      <button type="button" onClick={onClose}>
        Stop camera
      </button>
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
