import jsQR from "jsqr";
import { MultiFormatReader, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from "@zxing/library";

// ---- Barcode decoding: zxing-wasm first (fast and reliable for 1D barcodes), ZXing-js/jsQR as a fallback ----
let wasmReaderPromise;
export function getWasmReader() {
  if (!wasmReaderPromise) wasmReaderPromise = import("zxing-wasm/reader").then((m) => (typeof m.readBarcodes === "function" ? m.readBarcodes : null)).catch(() => null);
  return wasmReaderPromise;
}
const OWN_CODE = /^(UNT|BOX|ITM)-/i;
const barcodeKind = (r) => (/^(EAN|UPC)/i.test(r.format || "") ? "product" : /QR|Matrix|Aztec|PDF417|MaxiCode/i.test(r.format || "") ? "matrix" : "linear");

/**
 * A label can hold several codes. Preference: this system's own labels (UNT-/BOX-/ITM-), then the topmost
 * normal barcode (the serial number), then EAN/UPC only when it is the only code in view, then other QR codes.
 */
export function pickBest(results) {
  const ok = (results || []).filter((r) => r.isValid !== false && r.text);
  const own = ok.find((r) => OWN_CODE.test(r.text));
  if (own) return own.text;
  const rest = ok.filter((r) => !/^https?:\/\//i.test(r.text));
  const y = (r) => r.position?.topLeft?.y ?? 0;
  const linear = rest.filter((r) => barcodeKind(r) === "linear").sort((a, b) => y(a) - y(b));
  if (linear.length) return linear[0].text;
  const product = rest.filter((r) => barcodeKind(r) === "product");
  if (product.length && rest.length === 1) return product[0].text;
  const matrix = rest.filter((r) => barcodeKind(r) === "matrix");
  if (matrix.length && !product.length) return matrix[0].text;
  return "";
}

export async function decodeCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const readBarcodes = await getWasmReader();
  if (readBarcodes) {
    try { return pickBest(await readBarcodes(img, { tryHarder: true, maxNumberOfSymbols: 8 })); }
    catch { wasmReaderPromise = Promise.resolve(null); /* use the fallback decoder from now on */ }
  }
  const lum = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = (img.data[p] * 306 + img.data[p + 1] * 601 + img.data[p + 2] * 117) >> 10;
  const zx = new MultiFormatReader(); const hints = new Map(); hints.set(DecodeHintType.TRY_HARDER, true); zx.setHints(hints);
  try { const t = zx.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, img.width, img.height)))).getText(); if (t) return t; } catch { /* none */ }
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || "";
}

// ---- Fallback: read the printed serial number (OCR) when the barcode itself cannot be decoded ----
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/:-. " });
      return worker;
    })().catch((err) => { ocrWorkerPromise = null; throw err; });
  }
  return ocrWorkerPromise;
}
const serialOk = (t, minLen) => new RegExp(`^[A-Z0-9]{${minLen},24}$`).test(t) && /[A-Z]/.test(t) && /\d/.test(t);
/** Serial from plain OCR text: the letters+digits token after the "S/N" (or "SN") label. */
export function pickSerial(text, minLen = 8) {
  const lines = String(text || "").toUpperCase().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let snLine = -1; const cands = [];
  lines.forEach((line, i) => { if (/^S\s*[/.]?\s*N\b/.test(line)) snLine = i; line.split(/\s+/).forEach((t) => { if (serialOk(t, minLen)) cands.push({ t, i }); }); });
  if (!cands.length) return "";
  if (snLine >= 0) { const near = cands.filter((c) => c.i >= snLine).sort((a, b) => a.i - b.i)[0]; if (near) return near.t; }
  return cands[0].t;
}
/** Serial from word positions: the token on/just below the "S/N" label. */
export function pickSerialFromWords(words, minLen = 8) {
  const ws = (words || []).map((w) => ({ t: String(w.text || "").toUpperCase().replace(/[^A-Z0-9/:.-]/g, ""), b: w.bbox })).filter((w) => w.t && w.b);
  const anchor = ws.find((w) => /^S[/.]?N[:.]?$/.test(w.t));
  if (!anchor) return "";
  const h = Math.max(1, anchor.b.y1 - anchor.b.y0);
  const near = ws.filter((w) => serialOk(w.t, minLen) && w.b.y0 >= anchor.b.y0 - h && w.b.y0 <= anchor.b.y1 + h * 6 && w.b.x1 > anchor.b.x0)
    .sort((a, b) => Math.abs(a.b.y0 - anchor.b.y1) - Math.abs(b.b.y0 - anchor.b.y1));
  return near[0]?.t || "";
}
/** Grayscale + contrast stretch + resize to the given width (small text needs ~25px letter height for OCR). */
export function prepForOcr(canvas, targetW) {
  const scale = targetW / canvas.width; const out = document.createElement("canvas"); out.width = Math.max(1, Math.round(canvas.width * scale)); out.height = Math.max(1, Math.round(canvas.height * scale));
  const c = out.getContext("2d", { willReadFrequently: true }); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; c.drawImage(canvas, 0, 0, out.width, out.height);
  const img = c.getImageData(0, 0, out.width, out.height); const d = img.data; const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
  const total = out.width * out.height; let lo = 0; let hi = 255; let acc = 0;
  while (lo < 255 && acc + hist[lo] < total * 0.01) { acc += hist[lo]; lo++; }
  acc = 0; while (hi > 0 && acc + hist[hi] < total * 0.01) { acc += hist[hi]; hi--; }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range)); d[i] = d[i + 1] = d[i + 2] = v; }
  c.putImageData(img, 0, 0); return out;
}
export function cropCanvas(canvas, fx, fy, fw, fh) {
  const out = document.createElement("canvas"); out.width = Math.round(canvas.width * fw); out.height = Math.round(canvas.height * fh);
  out.getContext("2d").drawImage(canvas, Math.round(canvas.width * fx), Math.round(canvas.height * fy), out.width, out.height, 0, 0, out.width, out.height); return out;
}
export async function ocrSerial(canvas, modes = ["11"], minLen = 8) {
  const worker = await getOcrWorker();
  for (const mode of modes) {
    await worker.setParameters({ tessedit_pageseg_mode: mode });
    const { data } = await worker.recognize(canvas);
    const code = pickSerialFromWords(data.words, minLen) || pickSerial(data.text, minLen);
    if (code) return code;
  }
  return "";
}
