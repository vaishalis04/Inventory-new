import { useEffect, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from "@zxing/library";
import { loadLookups } from "../utils/lookup";
import { listCategories, listItems, listSuppliers, listWarehouses, openPrintSheet, receiveStock } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import FormField from "../components/FormField";
import QrImage from "../components/QrImage";
import { ErrorMessage } from "../components/LoadingState";

const EMPTY_ITEM = { category_id:"", name:"", sku:"", brand:"", model:"", description:"", unit:"pcs", min_stock:"0", custom_fields:{} };
const parseSchema = (v) => { if(Array.isArray(v)) return v; if(typeof v === "string"){try {const x=JSON.parse(v); return Array.isArray(x)?x:[]}catch{return []}} return []; };

const MAX_ITEMS = 1000;
const normCode = (v) => String(v ?? "").trim().toUpperCase();

// ---- Barcode decoding: zxing-wasm first (fast and reliable for 1D barcodes), ZXing-js/jsQR as a fallback ----
let wasmReaderPromise;
function getWasmReader() {
  if (!wasmReaderPromise) wasmReaderPromise = import("zxing-wasm/reader").then((m) => (typeof m.readBarcodes === "function" ? m.readBarcodes : null)).catch(() => null);
  return wasmReaderPromise;
}
const barcodeKind = (r) => (/^(EAN|UPC)/i.test(r.format || "") ? "product" : /QR|Matrix|Aztec|PDF417|MaxiCode/i.test(r.format || "") ? "matrix" : "linear");
/** A label can hold several barcodes (S/N, EAN, MAC, unit sticker). Choose the serial number: topmost linear barcode; EAN/UPC only when it is the only code in view. */
function pickBest(results) {
  const ok = (results || []).filter((r) => r.isValid !== false && r.text && !/^(UNT|BOX|ITM)-/i.test(r.text) && !/^https?:\/\//i.test(r.text));
  const y = (r) => r.position?.topLeft?.y ?? 0;
  const linear = ok.filter((r) => barcodeKind(r) === "linear").sort((a, b) => y(a) - y(b));
  if (linear.length) return linear[0].text;
  const product = ok.filter((r) => barcodeKind(r) === "product");
  if (product.length && ok.length === 1) return product[0].text;
  const matrix = ok.filter((r) => barcodeKind(r) === "matrix");
  if (matrix.length && !product.length) return matrix[0].text;
  return "";
}
async function decodeCanvas(canvas) {
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
/** Picks the serial number (letters + digits, 8-24 chars) printed after the "S/N" label. Ignores model (has dashes), EAN (digits only) and MAC (has colons). */
function pickSerial(text) {
  const lines = String(text || "").toUpperCase().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const valid = (t) => /^[A-Z0-9]{12,24}$/.test(t) && /[A-Z]/.test(t) && /\d/.test(t);
  let snLine = -1; const cands = [];
  lines.forEach((line, i) => { if (/^S\s*[/.]?\s*N\b/.test(line)) snLine = i; line.split(/\s+/).forEach((t) => { if (valid(t)) cands.push({ t, i }); }); });
  if (!cands.length) return "";
  if (snLine >= 0) { const near = cands.filter((c) => c.i >= snLine).sort((a, b) => a.i - b.i)[0]; if (near) return near.t; }
  return cands[0].t;
}
/** Uses word positions: the serial is the alphanumeric token printed just below the "S/N" label. */
function pickSerialFromWords(words) {
  const ws = (words || []).map((w) => ({ t: String(w.text || "").toUpperCase().replace(/[^A-Z0-9/:.-]/g, ""), b: w.bbox })).filter((w) => w.t && w.b);
  const anchor = ws.find((w) => /^S[/.]?N[:.]?$/.test(w.t));
  if (!anchor) return "";
  const h = Math.max(1, anchor.b.y1 - anchor.b.y0);
  const near = ws.filter((w) => /^[A-Z0-9]{12,24}$/.test(w.t) && /[A-Z]/.test(w.t) && /\d/.test(w.t) && w.b.y0 >= anchor.b.y0 - h && w.b.y0 <= anchor.b.y1 + h * 6 && w.b.x1 > anchor.b.x0)
    .sort((a, b) => Math.abs(a.b.y0 - anchor.b.y1) - Math.abs(b.b.y0 - anchor.b.y1));
  return near[0]?.t || "";
}
/** Grayscale + contrast stretch + resize to the given width (small text needs ~25px letter height for OCR). */
function prepForOcr(canvas, targetW) {
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
function cropCanvas(canvas, fx, fy, fw, fh) {
  const out = document.createElement("canvas"); out.width = Math.round(canvas.width * fw); out.height = Math.round(canvas.height * fh);
  out.getContext("2d").drawImage(canvas, Math.round(canvas.width * fx), Math.round(canvas.height * fy), out.width, out.height, 0, 0, out.width, out.height); return out;
}
async function ocrSerial(canvas, modes = ["11"]) {
  const worker = await getOcrWorker();
  for (const mode of modes) {
    await worker.setParameters({ tessedit_pageseg_mode: mode });
    const { data } = await worker.recognize(canvas);
    const code = pickSerialFromWords(data.words) || pickSerial(data.text);
    if (code) return code;
  }
  return "";
}
function shrinkCanvas(canvas, maxWidth) {
  const scale = Math.min(1, maxWidth / canvas.width); const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale); out.height = Math.round(canvas.height * scale); out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height); return out;
}

/** Continuous camera scanner: keeps running until the parent unmounts it (when all items are scanned). */
function BarcodeCamera({ onScan, onClose, progress }) {
  const videoRef = useRef(null); const canvasRef = useRef(null); const scanRef = useRef(onScan);
  const [status, setStatus] = useState("Starting camera..."); const [error, setError] = useState("");
  scanRef.current = onScan;
  const busyRef = useRef(false); const [busy, setBusy] = useState(false);
  /** "Click & scan": take a full-resolution picture of the current view, read the barcode, else the printed serial number. */
  async function capture() {
    const video = videoRef.current; if (!video || !video.videoWidth || busyRef.current) return;
    busyRef.current = true; setBusy(true); setStatus("Taking picture…");
    try {
      const scale = Math.min(1, 3000 / video.videoWidth); const shot = document.createElement("canvas");
      shot.width = Math.round(video.videoWidth * scale); shot.height = Math.round(video.videoHeight * scale);
      shot.getContext("2d").drawImage(video, 0, 0, shot.width, shot.height);
      setStatus("Reading barcode…");
      let code = await decodeCanvas(shot);
      if (!code && shot.width < 1800) code = await decodeCanvas(prepForOcr(shot, shot.width * 2));
      if (code) { navigator.vibrate?.(60); scanRef.current(code); setStatus("Done. Point at the next item and click again."); return; }
      setStatus("Barcode not readable — reading the printed serial number…");
      code = await ocrSerial(prepForOcr(cropCanvas(shot, 0.15, 0.15, 0.7, 0.7), 1800), ["11"]);
      if (!code) code = await ocrSerial(prepForOcr(shot, 2200), ["11", "6"]);
      if (code) { navigator.vibrate?.(60); scanRef.current(code, "ocr"); setStatus("Done. Point at the next item and click again."); }
      else setStatus("Nothing readable in this picture. Move closer, hold steady with the S/N inside the frame, and click again.");
    } catch { setStatus("Could not read this picture. Try again or type the number manually."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  useEffect(() => {
    let stream; let stopped = false; let lastText = ""; let lastAt = 0; let lastHit = Date.now(); let ocrBusy = false; let ocrOff = false; let seen = {};
    let READY = "Hold the S/N barcode and its number inside the white frame, filling most of it (about 10-20 cm away)";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError("Camera is not available. Use HTTPS (or localhost) and a supported browser."); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
      catch (err) { setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser and try again." : err.name === "NotFoundError" ? "No camera found on this device." : `Unable to start camera: ${err.message}`); return; }
      const video = videoRef.current;
      if (stopped || !video) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream; try { await video.play(); } catch { /* delayed playback */ }
      try { const track = stream.getVideoTracks()[0]; const caps = track.getCapabilities?.() || {}; if (caps.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { /* focus control not supported */ }
      if (stopped) return;
      setStatus("Loading scanner…"); const engine = (await getWasmReader()) ? "fast scanner" : "backup scanner"; if (stopped) return; READY += ` [${engine}]`; setStatus(READY);
      const canvas = canvasRef.current; const ctx = canvas.getContext("2d", { willReadFrequently: true });
      while (!stopped) {
        if (busyRef.current) { await sleep(150); continue; }
        const t0 = performance.now();
        if (video.readyState >= 2 && video.videoWidth) {
          try {
            const scale = video.videoWidth < 1000 ? 2 : Math.min(1, 1600 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const text = await decodeCanvas(canvas); if (stopped) break;
            const now = Date.now();
            // Same code still in front of the camera: ignore until it has been away for 2.5 s.
            if (text && !(text === lastText && now - lastAt < 2500)) { lastText = text; lastAt = now; lastHit = now; seen = {}; setStatus(READY); navigator.vibrate?.(60); scanRef.current(text); }
            else if (text) { lastAt = now; lastHit = now; }
            else if (!ocrOff && !ocrBusy && now - lastHit > 8000) {
              // No barcode decoded for 8 s: read the printed serial number instead (must match twice in a row).
              ocrBusy = true; setStatus("Barcode not readable — reading the printed serial number (the first time can take a moment)…");
              const snap = prepForOcr(cropCanvas(canvas, 0.15, 0.15, 0.7, 0.7), 1800);
              ocrSerial(snap).then((code) => {
                if (stopped) return;
                if (code) { seen[code] = (seen[code] || 0) + 1; }
                if (code && seen[code] >= 2) { seen = {}; lastHit = Date.now(); setStatus(READY); navigator.vibrate?.(60); scanRef.current(code, "ocr"); }
                else { lastHit = Date.now() - 6000; }
              }).catch(() => { ocrOff = true; setStatus("Could not read the printed text. Type the number manually."); }).finally(() => { ocrBusy = false; });
            }
          } catch { /* unreadable frame */ }
        }
        await sleep(Math.max(40, 150 - (performance.now() - t0)));
      }
    }
    start();
    return () => { stopped = true; stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return <div className="card scanner"><div className="scanner-view"><video ref={videoRef} playsInline muted /><div className="scanner-frame" /><canvas ref={canvasRef} hidden /></div><p><b>{progress}</b></p>{error ? <p className="alert error">{error}</p> : <p className="muted">{status}</p>}<div className="tabs"><button type="button" className="primary" onClick={capture} disabled={busy}>{busy ? "Reading…" : "Click & scan"}</button><button type="button" onClick={onClose}>Stop camera</button></div></div>;
}

export default function ReceiveStockPage() {
  const warehouses = useFetch(() => listWarehouses()); const categories = useFetch(listCategories); const suppliers = useFetch(() => listSuppliers()); const items = useFetch(() => listItems({limit:200}));
  const [mode,setMode]=useState("existing"); const [warehouseId,setWarehouseId]=useState(""); const [itemId,setItemId]=useState(""); const [item,setItem]=useState(EMPTY_ITEM); const [count,setCount]=useState("20"); const [started,setStarted]=useState(false); const [method,setMethod]=useState(""); const [codes,setCodes]=useState([]); const [scanMsg,setScanMsg]=useState(""); const [imgBusy,setImgBusy]=useState(false); const fileRef=useRef(null);
  const [extra,setExtra]=useState({supplier_id:"",batch_no:"",location:"",reference:"",note:""}); const [print,setPrint]=useState({enabled:true,print_item_labels:true}); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [result,setResult]=useState(null);
  const itemRows=useMemo(()=>extractList(items.data),[items.data]); const categoryRows=useMemo(()=>extractList(categories.data),[categories.data]); const selected=itemRows.find(x=>String(x.id)===String(itemId)); const category=categoryRows.find(x=>String(x.id)===String(mode==="new"?item.category_id:selected?.category_id)); const schema=parseSchema(category?.field_schema);
  const totalPieces=started?codes.length:0; const filled=codes.filter(c=>normCode(c)).length; const allFilled=started&&codes.length>0&&filled===codes.length;
  function start(){setError("");const n=Number(count);if(!Number.isSafeInteger(n)||n<1)return setError("Enter a whole number of items (1 or more).");if(n>MAX_ITEMS)return setError(`You can receive at most ${MAX_ITEMS} items at a time.`);setCodes(Array(n).fill(""));setMethod("");setScanMsg("");setStarted(true);}
  async function scanImageFile(file){if(!file)return;setImgBusy(true);setScanMsg("Reading image…");let url="";try{url=URL.createObjectURL(file);const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("Could not open this image."));im.src=url;});const scale=Math.min(1,3000/img.naturalWidth);const canvas=document.createElement("canvas");canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);let code=await decodeCanvas(canvas);if(!code&&canvas.width<1800){code=await decodeCanvas(prepForOcr(canvas,canvas.width*2));}if(code){handleScan(code);}else{setScanMsg("Barcode too small or blurry — reading the printed serial number…");code=await ocrSerial(prepForOcr(canvas,2200),["11","6"]);if(!code)code=await ocrSerial(prepForOcr(canvas,3000),["11"]);if(code)handleScan(code,"ocr");else setScanMsg("Could not find a barcode or serial number in this image. Use a closer, sharper photo of the S/N label or type it manually.");}}catch(err){setScanMsg(err.message||"Could not read this image.");}finally{if(url)URL.revokeObjectURL(url);setImgBusy(false);}}
  function resetCount(){setStarted(false);setMethod("");setCodes([]);setScanMsg("");}
  function setCode(i,value){setCodes(old=>old.map((c,j)=>i===j?value:c));}
  function handleScan(raw,source){const code=normCode(raw);if(!code)return;if(/[\s/?#]/.test(code)||code.length>40){setScanMsg(`Ignored "${code.slice(0,40)}": not a valid barcode.`);return;}setCodes(old=>{if(old.some(c=>normCode(c)===code)){setScanMsg(`${code} is already scanned.`);return old;}const idx=old.findIndex(c=>!normCode(c));if(idx===-1)return old;setScanMsg(source==="ocr"?`Filled ${code} from the printed serial number. Please verify it.`:`Scanned ${code}`);const next=[...old];next[idx]=code;return next;});}
  useEffect(()=>{if(method==="camera"&&started&&codes.length>0&&codes.every(c=>normCode(c))){setMethod("manual");setScanMsg("All items scanned. Review the list, then receive the stock.");}},[codes,method,started]);
  const changeItem=(key,value)=>setItem(old=>({...old,[key]:value})); const changeCustom=(key,value)=>setItem(old=>({...old,custom_fields:{...(old.custom_fields||{}),[key]:value}}));
  const changeExtra=(key,value)=>setExtra(old=>({...old,[key]:value}));
  async function submit(e){e.preventDefault();setError("");if(!warehouseId)return setError("Select a warehouse.");if(mode==="existing"&&!selected)return setError("Select an existing item.");if(!started)return setError("Enter the number of items and click Start.");if(!allFilled)return setError(`Scan or enter all ${codes.length} barcodes (${filled} done).`);const clean=codes.map(normCode);if(new Set(clean).size!==clean.length)return setError("Duplicate barcodes found. Every item must have a unique barcode.");if(clean.some(c=>/[\s/?#]/.test(c)||c.length>40))return setError("Barcodes cannot contain spaces, / ? # or be longer than 40 characters.");if(mode==="new"&&(!item.name.trim()))return setError("Enter an item name.");
    const payload={warehouse_id:Number(warehouseId),...(mode==="existing"?{item_id:Number(itemId)}:{item:{...item,category_id:item.category_id?Number(item.category_id):null,custom_fields:item.custom_fields||{}}}),barcodes:codes.map(normCode),supplier_id:extra.supplier_id?Number(extra.supplier_id):undefined,batch_no:extra.batch_no||undefined,location:extra.location||undefined,reference:extra.reference||undefined,note:extra.note||undefined,print};setBusy(true);try{const r=await receiveStock(payload);const data=r?.data?.data??r?.data;if(!data||!Array.isArray(data.boxes))throw new Error("Unexpected response from server. Check stock before retrying.");setResult(data);try{await loadLookups(true);items.refetch?.();}catch{}}catch(err){setError(err.details?`${err.message}: ${JSON.stringify(err.details)}`:err.message||"Unable to receive stock.");}finally{setBusy(false)}}
  async function openSheet(job){try{await openPrintSheet(job.id)}catch(e){setError(e.message)}}
  if(result){const units=result.units||[];return <><h1>Stock received</h1><p className="alert success">Receipt completed successfully.</p><div className="card"><h2>Receipt summary</h2>{result.boxes.length>0&&<p>Boxes received: <b>{result.boxes.length}</b></p>}<p>Individual items received: <b>{units.length}</b></p><p>Item: <b>{result.item?.name}</b></p><p>Each physical item has its own unique QR code.</p></div>{result.boxes.length>0&&<div className="card"><h2>Boxes and box QR codes</h2><div className="qr-list">{result.boxes.map(b=><div className="card" key={b.code}><QrImage data={b.qr} label={b.code}/><p>Items inside: <b>{b.initial_quantity}</b></p><p>Individual QR codes created: <b>{b.units?.length||0}</b></p></div>)}</div></div>}<div className="card"><h2>Individual item QR codes ({units.length})</h2><p className="muted">Every code below is unique and identifies one physical item.</p><div className="qr-list">{units.map(u=><div className="card" key={u.code}>{u.qr?.image?<QrImage data={u.qr} label={u.code}/>:<strong>{u.code}</strong>}<p>Status: {u.status}</p></div>)}</div></div>{(result.print_jobs||[]).map(j=><div className="card" key={j.id}><p>Print job: {j.status} · {j.total_labels} labels</p><button type="button" onClick={()=>openSheet(j)}>Open printable label sheet</button></div>)}<ErrorMessage error={error}/><button className="primary" onClick={()=>{setResult(null);resetCount();setCount("20");setError("");}}>Receive more stock</button></>}
  return <><h1>Receive stock</h1><p className="muted">Enter the number of items, click Start, then scan or type the barcode of every item.</p><ErrorMessage error={error}/><form className="card" onSubmit={submit}><div className="tabs"><button type="button" className={mode==="existing"?"active":""} onClick={()=>setMode("existing")}>Existing item</button><button type="button" className={mode==="new"?"active":""} onClick={()=>setMode("new")}>Create item and receive</button></div>
    <FormField label="Warehouse *" value={warehouseId} onChange={e=>setWarehouseId(e.target.value)} options={extractList(warehouses.data).map(w=>({value:w.id,label:w.name}))} required/>
    {mode==="existing"?<FormField label="Item *" value={itemId} onChange={e=>setItemId(e.target.value)} options={itemRows.map(i=>({value:i.id,label:[i.name,i.sku,i.model].filter(Boolean).join(" — ")}))} required/>:<><h2>Product details</h2><div className="grid"><FormField label="Category" value={item.category_id} onChange={e=>changeItem("category_id",e.target.value)} options={categoryRows.map(c=>({value:c.id,label:c.name}))}/><FormField label="Item name *" value={item.name} onChange={e=>changeItem("name",e.target.value)} required/><FormField label="SKU (optional)" value={item.sku} onChange={e=>changeItem("sku",e.target.value)}/><FormField label="Brand" value={item.brand} onChange={e=>changeItem("brand",e.target.value)}/><FormField label="Model" value={item.model} onChange={e=>changeItem("model",e.target.value)}/><FormField label="Unit of measure" value={item.unit} onChange={e=>changeItem("unit",e.target.value)} hint="pcs, kg, metre, etc. Not a box capacity."/></div><FormField label="Description" type="textarea" value={item.description} onChange={e=>changeItem("description",e.target.value)}/>{schema.length>0&&<><h3>Category fields</h3><div className="grid">{schema.map((f,i)=>{const k=f.key||f.name||`field_${i}`;return <FormField key={k} label={f.label||k} type={f.type||"text"} value={item.custom_fields?.[k]||""} required={!!f.required} onChange={e=>changeCustom(k,e.target.value)} options={Array.isArray(f.options)?f.options.map(v=>typeof v==="object"?v:{value:v,label:v}):undefined}/>})}</div></>}</>}
    <h2>Items received</h2><p className="muted">Enter how many individual items you are receiving, then click Start.</p><div className="grid"><FormField label="Number of items *" type="number" min="1" max={MAX_ITEMS} value={count} onChange={e=>setCount(e.target.value)} disabled={started}/><div className="field"><span>&nbsp;</span>{started?<button type="button" onClick={resetCount}>Change number of items</button>:<button type="button" className="primary" onClick={start}>Start</button>}</div></div>
    {started&&<><h3>Add barcodes — {filled} / {codes.length}</h3><div className="tabs"><button type="button" className={method==="camera"?"active":""} onClick={()=>{setMethod("camera");setScanMsg("");}} disabled={allFilled}>Open camera</button><button type="button" className={method==="manual"?"active":""} onClick={()=>{setMethod("manual");setScanMsg("");}}>Enter manually</button><button type="button" onClick={()=>fileRef.current?.click()} disabled={allFilled||imgBusy}>{imgBusy?"Reading image…":"Scan from image"}</button><input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value="";scanImageFile(f);}}/></div>
    {method==="camera"&&<BarcodeCamera onScan={handleScan} onClose={()=>setMethod("")} progress={`${filled} / ${codes.length} scanned`}/>}{scanMsg&&<p className="muted">{scanMsg}</p>}
    {method&&<div className="grid">{codes.map((c,i)=><FormField key={i} label={`Item ${i+1} barcode *`} value={c} onChange={e=>setCode(i,e.target.value)} placeholder={method==="camera"?"Waiting for scan…":"Type barcode number"}/>)}</div>}</>}
    <div className="card"><h3>Automatic total</h3><p>Individual items: <b>{totalPieces}</b></p><p>Barcodes added: <b>{filled} / {codes.length}</b></p><p>Total QR codes: <b>{totalPieces}</b></p></div>
    <h2>Receipt details (optional)</h2><div className="grid"><FormField label="Supplier" value={extra.supplier_id} onChange={e=>changeExtra("supplier_id",e.target.value)} options={extractList(suppliers.data).map(s=>({value:s.id,label:s.name}))}/><FormField label="Batch number" value={extra.batch_no} onChange={e=>changeExtra("batch_no",e.target.value)}/><FormField label="Rack / shelf" value={extra.location} onChange={e=>changeExtra("location",e.target.value)}/><FormField label="Reference / invoice" value={extra.reference} onChange={e=>changeExtra("reference",e.target.value)}/></div><FormField label="Notes" value={extra.note} onChange={e=>changeExtra("note",e.target.value)}/><label className="inline"><input type="checkbox" checked={print.enabled} onChange={e=>setPrint(old=>({...old,enabled:e.target.checked}))}/> Create printable labels after receiving</label><label className="inline"><input type="checkbox" checked={print.print_item_labels} onChange={e=>setPrint(old=>({...old,print_item_labels:e.target.checked}))}/> Include individual item labels</label><div className="row-actions"><button className="primary" disabled={busy}>{busy?"Receiving…":"Receive stock and generate QR codes"}</button></div></form></>;
}
