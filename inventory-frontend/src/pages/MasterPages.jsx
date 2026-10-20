import { useState } from "react";
import { loadLookups } from "../utils/lookup";
import {
  createCategory, createPrinter, createSupplier, createWarehouse, deactivateWarehouse,
  listCategories, listPrinters, listSuppliers, listWarehouses, updateWarehouse,
} from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import { ErrorMessage, Loading } from "../components/LoadingState";

/**
 * Generic list + create (+ optional edit / deactivate) page.
 * The field names below are best guesses — edit `fields` to match your backend's validation.
 * field: { name, label, type?, required?, json? (parse textarea as JSON), options? }
 */
function MasterPage({ title, list, create, update, remove, fields }) {
  const { data, loading, error, reload } = useFetch(list);
  const [editing, setEditing] = useState(null); // null | {} (new) | row
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const openForm = (row = {}) => {
    setFormError("");
    setForm(Object.fromEntries(fields.map((f) => {
      const v = row[f.name];
      return [f.name, v == null ? "" : f.json ? JSON.stringify(v, null, 2) : v];
    })));
    setEditing(row);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const payload = {};
    for (const f of fields) {
      const v = form[f.name];
      if (v === "" || v === undefined) continue;
      if (f.json) {
        try { payload[f.name] = JSON.parse(v); } catch { return setFormError(`${f.label} must be valid JSON.`); }
      } else payload[f.name] = f.type === "number" ? Number(v) : v;
    }
    setBusy(true);
    try {
      if (editing.id) await update(editing.id, payload);
      else await create(payload);
      setEditing(null);
      loadLookups(true);
      reload();
    } catch (err) {
      setFormError(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(row) {
    if (!window.confirm(`Deactivate "${row.name}"?`)) return;
    try { await remove(row.id); reload(); } catch (err) { alert(err.message); }
  }

  const actions = (update || remove) && ((row) => (
    <div className="row-actions">
      {update && <button className="link" onClick={() => openForm(row)}>Edit</button>}
      {remove && <button className="link danger" onClick={() => handleRemove(row)}>Deactivate</button>}
    </div>
  ));

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>{title}</h1>
        <button className="primary" onClick={() => openForm({})}>+ New</button>
      </div>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} actions={actions || undefined} />}
      {editing && (
        <Modal title={editing.id ? `Edit ${title}` : `New ${title}`} onClose={() => setEditing(null)}>
          <ErrorMessage error={formError} />
          <form onSubmit={handleSubmit}>
            {fields.map((f) => (
              <FormField key={f.name} label={f.label} type={f.json ? "textarea" : f.type} options={f.options}
                value={form[f.name] ?? ""} required={f.required} placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            ))}
            <button className="primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export const WarehousesPage = () => (
  <MasterPage title="Warehouses" list={() => listWarehouses()} create={createWarehouse} update={updateWarehouse} remove={deactivateWarehouse}
    fields={[
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code" },
      { name: "address", label: "Address" },
    ]} />
);

export function CategoriesPage() {
  const { data, loading, error, reload } = useFetch(listCategories);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState([]);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  function open() { setName(""); setFields([]); setFormError(""); setEditing(true); }
  async function submit(e) {
    e.preventDefault(); setFormError("");
    const cleaned = fields.filter(f => f.label.trim()).map((f, i) => ({ key: (f.key || f.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: f.label.trim(), type: f.type || "text", required: !!f.required, ...(f.type === "select" ? { options: (f.options || "").split(",").map(x => x.trim()).filter(Boolean) } : {}) }));
    setBusy(true); try { await createCategory({ name: name.trim(), field_schema: cleaned }); setEditing(false); await loadLookups(true); reload(); } catch (err) { setFormError(err.message); } finally { setBusy(false); }
  }
  return <><div className="toolbar"><h1 style={{margin:0,flex:1}}>Categories</h1><button className="primary" onClick={open}>+ New category</button></div><p className="muted">Define extra item fields using a visual builder. Users will see ordinary inputs on item forms.</p><ErrorMessage error={error} onRetry={reload}/>{loading ? <Loading/> : <AutoTable rows={extractList(data)} />}{editing && <Modal title="New category" onClose={()=>setEditing(false)}><ErrorMessage error={formError}/><form onSubmit={submit}><FormField label="Category name *" value={name} onChange={e=>setName(e.target.value)} required/><h3>Custom fields</h3>{fields.map((f,i)=><div className="card" key={i}><FormField label="Field label" value={f.label} onChange={e=>setFields(old=>old.map((x,j)=>i===j?{...x,label:e.target.value}:x))} required/><FormField label="Input type" value={f.type} options={[{value:"text",label:"Text"},{value:"number",label:"Number"},{value:"date",label:"Date"},{value:"select",label:"Dropdown"},{value:"checkbox",label:"Checkbox"}]} onChange={e=>setFields(old=>old.map((x,j)=>i===j?{...x,type:e.target.value}:x))}/>{f.type==="select"&&<FormField label="Options (comma separated)" value={f.options||""} onChange={e=>setFields(old=>old.map((x,j)=>i===j?{...x,options:e.target.value}:x))}/>}<label className="inline"><input type="checkbox" checked={!!f.required} onChange={e=>setFields(old=>old.map((x,j)=>i===j?{...x,required:e.target.checked}:x))}/> Required field</label><button type="button" onClick={()=>setFields(old=>old.filter((_,j)=>j!==i))}>Remove field</button></div>)}<button type="button" onClick={()=>setFields(old=>[...old,{label:"",type:"text",required:false}])}>+ Add field</button><div className="row-actions"><button className="primary" disabled={busy||!name.trim()}>{busy?"Saving…":"Save category"}</button></div></form></Modal>}</>;
}

export const SuppliersPage = () => (
  <MasterPage title="Suppliers" list={() => listSuppliers()} create={createSupplier}
    fields={[
      { name: "name", label: "Name", required: true },
      { name: "contact_name", label: "Contact person" },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Address" },
    ]} />
);

export const PrintersPage = () => (
  <MasterPage title="Printers" list={listPrinters} create={createPrinter}
    fields={[
      { name: "name", label: "Name", required: true },
      { name: "type", label: "Type", options: [{ value: "browser", label: "Browser" }, { value: "network", label: "Network" }] },
      { name: "ip_address", label: "IP address (network printers)" },
      { name: "port", label: "Port", type: "number" },
    ]} />
);
