import { useEffect, useRef, useState } from "react";
import { getWasmReader, decodeCanvas, prepForOcr, cropCanvas, ocrSerial } from "../utils/barcodeScan";

/**
 * Camera scanner for the Scan page: reads this system's QR labels and item barcodes.
 * Auto-scans continuously, has a "Click & scan" button (full-resolution picture) and falls back to the
 * printed serial number. Calls onDetect(text) once, then the parent closes the camera.
 */
export default function ScanCamera({ onDetect, onClose }) {
  const videoRef = useRef(null); const canvasRef = useRef(null); const detectRef = useRef(onDetect);
  const busyRef = useRef(false); const doneRef = useRef(false);
  const [status, setStatus] = useState("Starting camera..."); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  detectRef.current = onDetect;

  function finish(code) { if (doneRef.current) return; doneRef.current = true; navigator.vibrate?.(80); detectRef.current(code); }

  /** "Click & scan": full-resolution picture of the current view -> barcode, else the printed serial number. */
  async function capture() {
    const video = videoRef.current; if (!video || !video.videoWidth || busyRef.current || doneRef.current) return;
    busyRef.current = true; setBusy(true); setStatus("Taking picture…");
    try {
      const scale = Math.min(1, 3000 / video.videoWidth); const shot = document.createElement("canvas");
      shot.width = Math.round(video.videoWidth * scale); shot.height = Math.round(video.videoHeight * scale);
      shot.getContext("2d").drawImage(video, 0, 0, shot.width, shot.height);
      setStatus("Reading code…");
      let code = await decodeCanvas(shot);
      if (!code && shot.width < 1800) code = await decodeCanvas(prepForOcr(shot, shot.width * 2));
      if (!code) {
        setStatus("Code not readable — reading the printed serial number…");
        code = await ocrSerial(prepForOcr(cropCanvas(shot, 0.15, 0.15, 0.7, 0.7), 1800), ["11"]);
        if (!code) code = await ocrSerial(prepForOcr(shot, 2200), ["11", "6"]);
      }
      if (code) finish(code); else setStatus("Nothing readable in this picture. Move closer, hold steady with the code inside the frame, and click again.");
    } catch { setStatus("Could not read this picture. Try again or type the code below."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  useEffect(() => {
    let stream; let stopped = false; let lastHit = Date.now(); let ocrBusy = false; let ocrOff = false; let seen = {};
    let READY = "Hold the QR code / barcode inside the white frame (about 10-20 cm away), or click “Click & scan”";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError("Camera is not available. Use HTTPS (or localhost) and a supported browser."); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
      catch (err) { setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser and try again." : err.name === "NotFoundError" ? "No camera found on this device." : `Unable to start camera: ${err.message}`); return; }
      const video = videoRef.current;
      if (stopped || !video) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream; try { await video.play(); } catch { /* delayed playback */ }
      try { const track = stream.getVideoTracks()[0]; const caps = track.getCapabilities?.() || {}; if (caps.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { /* focus control not supported */ }
      if (stopped) return;
      setStatus("Loading scanner…"); const engine = (await getWasmReader()) ? "fast scanner" : "backup scanner"; if (stopped) return;
      READY += ` [${engine}]`; setStatus(READY);
      const canvas = canvasRef.current; const ctx = canvas.getContext("2d", { willReadFrequently: true });
      while (!stopped && !doneRef.current) {
        if (busyRef.current) { await sleep(150); continue; }
        const t0 = performance.now();
        if (video.readyState >= 2 && video.videoWidth) {
          try {
            const scale = video.videoWidth < 1000 ? 2 : Math.min(1, 1600 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const text = await decodeCanvas(canvas); if (stopped) break;
            if (text) { finish(text); break; }
            if (!ocrOff && !ocrBusy && Date.now() - lastHit > 8000) {
              // No code decoded for 8 s: read the printed serial number instead (must match twice).
              ocrBusy = true; setStatus("Code not readable — reading the printed serial number (the first time can take a moment)…");
              const snap = prepForOcr(cropCanvas(canvas, 0.15, 0.15, 0.7, 0.7), 1800);
              ocrSerial(snap).then((code) => {
                if (stopped || doneRef.current) return;
                if (code) seen[code] = (seen[code] || 0) + 1;
                if (code && seen[code] >= 2) { finish(code); } else { lastHit = Date.now() - 6000; }
              }).catch(() => { ocrOff = true; setStatus("Could not read the printed text. Type the code below."); }).finally(() => { ocrBusy = false; });
            }
          } catch { /* unreadable frame */ }
        }
        await sleep(Math.max(40, 150 - (performance.now() - t0)));
      }
    }
    start();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div className="card scanner">
      <div className="scanner-view"><video ref={videoRef} playsInline muted /><div className="scanner-frame" /><canvas ref={canvasRef} hidden /></div>
      {error ? <p className="alert error">{error}</p> : <p className="muted">{status}</p>}
      <div className="tabs">
        <button type="button" className="primary" onClick={capture} disabled={busy}>{busy ? "Reading…" : "Click & scan"}</button>
        <button type="button" onClick={onClose}>Stop camera</button>
      </div>
    </div>
  );
}
