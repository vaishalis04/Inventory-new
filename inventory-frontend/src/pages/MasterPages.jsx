import { useState } from "react";
import { loadLookups } from "../utils/lookup";
import {
  createCategory, createPrinter, createSupplier, createWarehouse,
  deleteCategory, deletePrinter, deleteSupplier, deleteWarehouse,
  listCategories, listPrinters, listSuppliers, listWarehouses,
  updateCategory, updatePrinter, updateSupplier, updateWarehouse,
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
function MasterPage({ title, list, create, update, remove, fields, removeNote }) {
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
      if (v === "" || v === undefined) {
        // when editing, an emptied text field clears the stored value
        if (editing.id && editing[f.name] != null && editing[f.name] !== "" && !f.json && !f.options && f.type !== "number") {
          payload[f.name] = null;
        }
        continue;
      }
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
    if (!window.confirm(removeNote ? `Delete "${row.name}"?\n\n${removeNote}` : `Delete "${row.name}"? This cannot be undone.`)) return;
    try { await remove(row.id); loadLookups(true); reload(); } catch (err) { alert(err.message); }
  }

  const actions = (update || remove) && ((row) => (
    <div className="row-actions">
      {update && <button className="link" onClick={() => openForm(row)}>Edit</button>}
      {remove && <button className="link danger" onClick={() => handleRemove(row)}>Delete</button>}
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

// Deleting a warehouse that still holds data needs a second, explicit confirmation.
async function removeWarehouse(id) {
  try {
    await deleteWarehouse(id);
  } catch (err) {
    if (!err.details?.needs_cascade) throw err;
    if (!window.confirm(`${err.message}\n\nDelete the warehouse AND all of that data permanently?`)) return;
    await deleteWarehouse(id, true);
  }
}

export const WarehousesPage = () => (
  <MasterPage title="Warehouses" list={() => listWarehouses()} create={createWarehouse} update={updateWarehouse} remove={removeWarehouse}
    removeNote="If it holds stock, you will be asked to confirm deleting that stock and its movements too."
    fields={[
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code" },
      { name: "address", label: "Address" },
    ]} />
);

const toSchemaList = (schema) => {
  let v = schema;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = []; } }
  return Array.isArray(v) ? v : [];
};

export function CategoriesPage() {
  const { data, loading, error, reload } = useFetch(listCategories);
  const [editing, setEditing] = useState(null); // null | {} (new) | category row
  const [name, setName] = useState("");
  const [fields, setFields] = useState([]);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(editing?.id);

  function open(row = {}) {
    setName(row.name ?? "");
    setFields(toSchemaList(row.field_schema).map((f) => ({
      key: f.key, label: f.label ?? f.key ?? "", type: f.type || "text", required: !!f.required,
      options: Array.isArray(f.options) ? f.options.map((o) => (typeof o === "object" ? o.label ?? o.value : o)).join(", ") : (f.options || ""),
    })));
    setFormError("");
    setEditing(row);
  }

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    const cleaned = fields.filter((f) => f.label.trim()).map((f) => ({
      // existing fields keep their key so saved item values stay linked to them
      key: (f.key || f.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: f.label.trim(), type: f.type || "text", required: !!f.required,
      ...(f.type === "select" ? { options: (f.options || "").split(",").map((x) => x.trim()).filter(Boolean) } : {}),
    }));
    const payload = { name: name.trim(), field_schema: cleaned };
    setBusy(true);
    try {
      if (isEdit) await updateCategory(editing.id, payload);
      else await createCategory(payload);
      setEditing(null);
      await loadLookups(true);
      reload();
    } catch (err) {
      setFormError(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete category "${row.name}"?\n\nIts items are kept; they just become uncategorised.`)) return;
    try { await deleteCategory(row.id); await loadLookups(true); reload(); } catch (err) { alert(err.message); }
  }

  const patchField = (i, patch) => setFields((old) => old.map((x, j) => (i === j ? { ...x, ...patch } : x)));

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Categories</h1>
        <button className="primary" onClick={() => open({})}>+ New category</button>
      </div>
      <p className="muted">Define extra item fields using a visual builder. Users will see ordinary inputs on item forms.</p>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : (
        <AutoTable rows={extractList(data)} actions={(row) => (
          <div className="row-actions">
            <button className="link" onClick={() => open(row)}>Edit</button>
            <button className="link danger" onClick={() => remove(row)}>Delete</button>
          </div>
        )} />
      )}
      {editing && (
        <Modal title={isEdit ? `Edit category — ${editing.name}` : "New category"} onClose={() => setEditing(null)}>
          <ErrorMessage error={formError} />
          <form onSubmit={submit}>
            <FormField label="Category name *" value={name} onChange={(e) => setName(e.target.value)} required />
            <h3>Custom fields</h3>
            {fields.map((f, i) => (
              <div className="card" key={i}>
                <FormField label="Field label" value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} required />
                <FormField label="Input type" value={f.type}
                  options={[{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "select", label: "Dropdown" }, { value: "checkbox", label: "Checkbox" }]}
                  onChange={(e) => patchField(i, { type: e.target.value })} />
                {f.type === "select" && (
                  <FormField label="Options (comma separated)" value={f.options || ""} onChange={(e) => patchField(i, { options: e.target.value })} />
                )}
                <label className="inline">
                  <input type="checkbox" checked={!!f.required} onChange={(e) => patchField(i, { required: e.target.checked })} /> Required field
                </label>
                <button type="button" onClick={() => setFields((old) => old.filter((_, j) => j !== i))}>Remove field</button>
              </div>
            ))}
            <button type="button" onClick={() => setFields((old) => [...old, { label: "", type: "text", required: false }])}>+ Add field</button>
            <div className="row-actions">
              <button className="primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : isEdit ? "Save changes" : "Save category"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export const SuppliersPage = () => (
  <MasterPage title="Suppliers" list={() => listSuppliers()} create={createSupplier} update={updateSupplier} remove={deleteSupplier}
    removeNote="Boxes received from this supplier are kept; they just lose the supplier link."
    fields={[
      { name: "name", label: "Name", required: true },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email", type: "email" },
      { name: "address", label: "Address" },
    ]} />
);

export const PrintersPage = () => (
  <MasterPage title="Printers" list={listPrinters} create={createPrinter} update={updatePrinter} remove={deletePrinter}
    removeNote="Print job history is kept; it just loses the printer link."
    fields={[
      { name: "name", label: "Name", required: true },
      { name: "connection", label: "Connection", options: [{ value: "NETWORK", label: "Network (ZPL label printer)" }, { value: "BROWSER", label: "Browser (printable sheet)" }] },
      { name: "host", label: "IP address / host (network printers)" },
      { name: "port", label: "Port", type: "number" },
      { name: "label_width_mm", label: "Label width (mm)", type: "number" },
      { name: "label_height_mm", label: "Label height (mm)", type: "number" },
      { name: "is_default", label: "Default printer", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
    ]} />
);
