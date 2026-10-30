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
  const valid = (t) => /^[A-Z0-9]{8,24}$/.test(t) && /[A-Z]/.test(t) && /\d/.test(t);
  let snLine = -1; const cands = [];
  lines.forEach((line, i) => { if (/^S\s*[/.]?\s*N\b/.test(line)) snLine = i; line.split(/\s+/).forEach((t) => { if (valid(t)) cands.push({ t, i }); }); });
  if (!cands.length) return "";
  if (snLine >= 0) { const near = cands.filter((c) => c.i >= snLine).sort((a, b) => a.i - b.i)[0]; if (near) return near.t; }
  return cands[0].t;
}
async function ocrSerial(canvas) { const worker = await getOcrWorker(); const { data } = await worker.recognize(canvas); return pickSerial(data.text); }
function decodeBarcodeFromCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const lum = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = (img.data[p] * 306 + img.data[p + 1] * 601 + img.data[p + 2] * 117) >> 10;
  const zx = new MultiFormatReader(); const hints = new Map(); hints.set(DecodeHintType.TRY_HARDER, true); zx.setHints(hints);
  try { const t = zx.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, img.width, img.height)))).getText(); if (t) return t; } catch { /* none */ }
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data || "";
}

/** Continuous camera scanner: keeps running until the parent unmounts it (when all items are scanned). */
function BarcodeCamera({ onScan, onClose, progress }) {
  const videoRef = useRef(null); const canvasRef = useRef(null); const scanRef = useRef(onScan);
  const [status, setStatus] = useState("Starting camera..."); const [error, setError] = useState("");
  scanRef.current = onScan;
  useEffect(() => {
    let stream; let raf; let stopped = false; let lastText = ""; let lastAt = 0;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError("Camera is not available. Use HTTPS (or localhost) and a supported browser."); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
      catch (err) { setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser and try again." : err.name === "NotFoundError" ? "No camera found on this device." : `Unable to start camera: ${err.message}`); return; }
      const video = videoRef.current;
      if (stopped || !video) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream; try { await video.play(); } catch { /* delayed playback */ }
      if (stopped) return;
      setStatus("Point the camera at the barcode of each item");
      const canvas = canvasRef.current; const ctx = canvas.getContext("2d", { willReadFrequently: true });
      let detector = null;
      if (typeof window.BarcodeDetector !== "undefined") { try { detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "data_matrix"] }); } catch { detector = null; } }
      const zx = new MultiFormatReader(); const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]);
      hints.set(DecodeHintType.TRY_HARDER, true); zx.setHints(hints);
      let last = 0; let detecting = false; let lastHit = Date.now(); let ocrBusy = false; let ocrOff = false; let pending = "";
      const tick = async (time) => {
        if (stopped) return; raf = requestAnimationFrame(tick);
        if (detecting || time - last < 200 || video.readyState < 2 || !video.videoWidth) return;
        last = time; detecting = true;
        try {
          let text = "";
          if (detector) { try { const found = await detector.detect(video); text = found[0]?.rawValue || ""; } catch { /* fall back to jsQR */ } }
          if (!text) {
            const scale = Math.min(1, 1280 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // ZXing reads 1D barcodes (EAN, Code 128, ...) in every browser; jsQR is the QR fallback.
            const lum = new Uint8ClampedArray(img.width * img.height);
            for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = (img.data[p] * 306 + img.data[p + 1] * 601 + img.data[p + 2] * 117) >> 10;
            try { text = zx.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, img.width, img.height)))).getText() || ""; } catch { /* no barcode in this frame */ }
            if (!text) text = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data || "";
          }
          const now = Date.now();
          // Same code still in front of the camera: ignore until it has been away for 2.5 s.
          if (text && !(text === lastText && now - lastAt < 2500)) { lastText = text; lastAt = now; lastHit = now; pending = ""; setStatus("Point the camera at the barcode of each item"); navigator.vibrate?.(60); scanRef.current(text); }
          else if (text) { lastAt = now; lastHit = now; }
          else if (!ocrOff && !ocrBusy && now - lastHit > 4000 && canvas.width) {
            // Barcode not readable for a few seconds: read the printed serial number instead (must match twice in a row).
            ocrBusy = true; setStatus("Barcode not readable — reading the printed serial number…");
            const snap = document.createElement("canvas"); snap.width = canvas.width; snap.height = canvas.height; snap.getContext("2d").drawImage(canvas, 0, 0);
            ocrSerial(snap).then((code) => {
              if (stopped) return;
              if (code && code === pending) { pending = ""; lastHit = Date.now(); setStatus("Point the camera at the barcode of each item"); navigator.vibrate?.(60); scanRef.current(code, "ocr"); }
              else { pending = code || ""; lastHit = Date.now() - 2500; }
            }).catch(() => { ocrOff = true; setStatus("Could not read the printed text (OCR unavailable). Type the number manually."); }).finally(() => { ocrBusy = false; });
          }
        } catch { /* unreadable frame */ } finally { detecting = false; }
      };
      raf = requestAnimationFrame(tick);
    }
    start();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return <div className="card scanner"><div className="scanner-view"><video ref={videoRef} playsInline muted /><div className="scanner-frame" /><canvas ref={canvasRef} hidden /></div><p><b>{progress}</b></p>{error ? <p className="alert error">{error}</p> : <p className="muted">{status}</p>}<button type="button" onClick={onClose}>Stop camera</button></div>;
}
export default function ReceiveStockPage() {
  const warehouses = useFetch(() => listWarehouses()); const categories = useFetch(listCategories); const suppliers = useFetch(() => listSuppliers()); const items = useFetch(() => listItems({limit:200}));
  const [mode,setMode]=useState("existing"); const [warehouseId,setWarehouseId]=useState(""); const [itemId,setItemId]=useState(""); const [item,setItem]=useState(EMPTY_ITEM); const [count,setCount]=useState("20"); const [started,setStarted]=useState(false); const [method,setMethod]=useState(""); const [codes,setCodes]=useState([]); const [scanMsg,setScanMsg]=useState(""); const [imgBusy,setImgBusy]=useState(false); const fileRef=useRef(null);
  const [extra,setExtra]=useState({supplier_id:"",batch_no:"",location:"",reference:"",note:""}); const [print,setPrint]=useState({enabled:true,print_item_labels:true}); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [result,setResult]=useState(null);
  const itemRows=useMemo(()=>extractList(items.data),[items.data]); const categoryRows=useMemo(()=>extractList(categories.data),[categories.data]); const selected=itemRows.find(x=>String(x.id)===String(itemId)); const category=categoryRows.find(x=>String(x.id)===String(mode==="new"?item.category_id:selected?.category_id)); const schema=parseSchema(category?.field_schema);
  const totalPieces=started?codes.length:0; const filled=codes.filter(c=>normCode(c)).length; const allFilled=started&&codes.length>0&&filled===codes.length;
  function start(){setError("");const n=Number(count);if(!Number.isSafeInteger(n)||n<1)return setError("Enter a whole number of items (1 or more).");if(n>MAX_ITEMS)return setError(`You can receive at most ${MAX_ITEMS} items at a time.`);setCodes(Array(n).fill(""));setMethod("");setScanMsg("");setStarted(true);}
  async function scanImageFile(file){if(!file)return;setImgBusy(true);setScanMsg("Reading image…");let url="";try{url=URL.createObjectURL(file);const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("Could not open this image."));im.src=url;});const scale=Math.min(1,1600/img.naturalWidth);const canvas=document.createElement("canvas");canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);let code=decodeBarcodeFromCanvas(canvas);if(code){handleScan(code);}else{setScanMsg("Barcode not readable — reading the printed serial number…");code=await ocrSerial(canvas);if(code)handleScan(code,"ocr");else setScanMsg("Could not find a barcode or serial number in this image. Try a clearer photo or type it manually.");}}catch(err){setScanMsg(err.message||"Could not read this image.");}finally{if(url)URL.revokeObjectURL(url);setImgBusy(false);}}
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
