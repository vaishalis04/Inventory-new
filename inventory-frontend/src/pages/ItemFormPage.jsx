import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadLookups } from "../utils/lookup";
import { createItem, getItem, listCategories, updateItem } from "../api/inventory.api";
import { extractList } from "../api/http";
import FormField from "../components/FormField";
import { ErrorMessage, Loading } from "../components/LoadingState";

const EMPTY = { category_id: "", sku: "", name: "", model: "", brand: "", description: "", unit: "pcs", min_stock: "0", custom_fields: {} };
const safeSchema = (schema) => { if (Array.isArray(schema)) return schema; if (typeof schema === "string") { try { const v = JSON.parse(schema); return Array.isArray(v) ? v : []; } catch { return []; } } return []; };
export default function ItemFormPage() {
  const { id } = useParams(); const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY); const [categories, setCategories] = useState([]); const [extraFields, setExtraFields] = useState([]);
  const [loading, setLoading] = useState(Boolean(id)); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { listCategories().then(r => setCategories(extractList(r))).catch(e => setError(e.message)); if (id) getItem(id).then(r => { const it = r.data?.item ?? r.data; setForm({ ...EMPTY, ...it, category_id: it.category_id ?? "", custom_fields: it.custom_fields && typeof it.custom_fields === "object" ? it.custom_fields : {} }); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, [id]);
  const category = useMemo(() => categories.find(c => String(c.id) === String(form.category_id)), [categories, form.category_id]);
  const schema = safeSchema(category?.field_schema);
  const set = key => e => setForm(old => ({ ...old, [key]: e.target.value }));
  const setCustom = (key, value) => setForm(old => ({ ...old, custom_fields: { ...(old.custom_fields || {}), [key]: value } }));
  async function submit(e) { e.preventDefault(); setError(""); setBusy(true); try { const payload = { ...form, category_id: form.category_id ? Number(form.category_id) : null, custom_fields: form.custom_fields || {} }; if (id) await updateItem(id, payload); else await createItem(payload); await loadLookups(true); navigate("/items"); } catch (err) { setError(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message); } finally { setBusy(false); } }
  if (loading) return <Loading />;
  return <><h1>{id ? "Edit item" : "Create item"}</h1><p className="muted">Define the product once. Stock quantity and box quantities are entered only when receiving stock.</p><ErrorMessage error={error} /><form className="card" onSubmit={submit}><div className="grid">
    <FormField label="Category" value={form.category_id} onChange={set("category_id")} options={categories.map(c => ({ value: c.id, label: c.name }))} />
    <FormField label="Item name *" value={form.name} onChange={set("name")} required />
    <FormField label="SKU (optional)" value={form.sku || ""} onChange={set("sku")} />
    <FormField label="Brand" value={form.brand || ""} onChange={set("brand")} />
    <FormField label="Model" value={form.model || ""} onChange={set("model")} />
    <FormField label="Unit of measure" value={form.unit || "pcs"} onChange={set("unit")} hint="For example: pcs, metre, kg. This is not a box capacity." />
    <FormField label="Minimum stock alert" type="number" min="0" value={form.min_stock ?? 0} onChange={set("min_stock")} />
  </div><FormField label="Description" type="textarea" value={form.description || ""} onChange={set("description")} />
  {schema.length > 0 && <><h2>Category details</h2><div className="grid">{schema.map((field, i) => { const key = field.key || field.name || `field_${i}`; const type = field.type || "text"; const options = Array.isArray(field.options) ? field.options.map(v => typeof v === "object" ? v : ({ value: v, label: v })) : undefined; return <FormField key={key} label={`${field.label || key}${field.required ? " *" : ""}`} type={type === "select" ? "text" : type} options={options} required={Boolean(field.required)} value={form.custom_fields?.[key] ?? ""} onChange={e => setCustom(key, e.target.value)} />; })}</div></>}
  <h2>Additional details</h2><p className="muted">Add normal fields here; no JSON is required.</p>{extraFields.map((f, i) => <div className="grid" key={i}><FormField label="Field name" value={f.key} onChange={e => setExtraFields(old => old.map((x,j) => i === j ? {...x,key:e.target.value} : x))} required /><FormField label="Value" value={form.custom_fields?.[f.key] ?? f.value ?? ""} onChange={e => { setCustom(f.key,e.target.value); setExtraFields(old => old.map((x,j) => i === j ? {...x,value:e.target.value} : x)); }} /><button type="button" onClick={() => { setForm(old => { const cf={...(old.custom_fields||{})}; delete cf[f.key]; return {...old,custom_fields:cf}; }); setExtraFields(old => old.filter((_,j)=>j!==i)); }}>Remove field</button></div>)}<button type="button" onClick={() => setExtraFields(old => [...old,{key:"",value:""}])}>+ Add custom field</button>
  <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save item"}</button><button type="button" onClick={() => navigate("/items")}>Cancel</button></div></form></>;
}
