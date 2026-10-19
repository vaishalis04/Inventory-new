import { useEffect, useState } from "react";
import { loadLookups } from "../utils/lookup";
import { useNavigate, useParams } from "react-router-dom";
import { createItem, getItem, listCategories, updateItem } from "../api/inventory.api";
import { extractList } from "../api/http";
import FormField from "../components/FormField";
import { ErrorMessage, Loading } from "../components/LoadingState";

const EMPTY = { category_id: "", name: "", model: "", brand: "", description: "", unit: "pcs", purchase_price: "", sale_price: "", min_stock: "", custom_fields: "" };

export default function ItemFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCategories().then((r) => setCategories(extractList(r))).catch((e) => setError(e.message));
    if (id) {
      getItem(id)
        .then((r) => {
          const it = r.data?.item ?? r.data;
          setForm({
            ...EMPTY,
            ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, it[k] ?? ""])),
            custom_fields: it.custom_fields ? JSON.stringify(it.custom_fields, null, 2) : "",
          });
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    let custom_fields;
    try {
      custom_fields = form.custom_fields.trim() ? JSON.parse(form.custom_fields) : undefined;
    } catch {
      return setError("Custom fields must be valid JSON, e.g. {\"resolution\":\"2MP\"}");
    }
    const num = (v) => (v === "" ? undefined : Number(v));
    const payload = {
      category_id: num(form.category_id), name: form.name.trim(), model: form.model, brand: form.brand,
      description: form.description, unit: form.unit, purchase_price: num(form.purchase_price),
      sale_price: num(form.sale_price), min_stock: num(form.min_stock), custom_fields,
    };
    setBusy(true);
    try {
      if (id) await updateItem(id, payload);
      else await createItem(payload);
      loadLookups(true);
      navigate("/items");
    } catch (err) {
      setError(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  return (
    <>
      <h1>{id ? "Edit item" : "New item"}</h1>
      <ErrorMessage error={error} />
      <form className="card" onSubmit={handleSubmit}>
        <div className="grid">
          <FormField label="Category" value={form.category_id} onChange={set("category_id")} options={categories.map((c) => ({ value: c.id, label: c.name }))} required />
          <FormField label="Name" value={form.name} onChange={set("name")} required />
          <FormField label="Model" value={form.model} onChange={set("model")} />
          <FormField label="Brand" value={form.brand} onChange={set("brand")} />
          <FormField label="Unit" value={form.unit} onChange={set("unit")} />
          <FormField label="Purchase price" type="number" min="0" step="any" value={form.purchase_price} onChange={set("purchase_price")} />
          <FormField label="Sale price" type="number" min="0" step="any" value={form.sale_price} onChange={set("sale_price")} />
          <FormField label="Minimum stock" type="number" min="0" value={form.min_stock} onChange={set("min_stock")} />
        </div>
        <FormField label="Description" type="textarea" value={form.description} onChange={set("description")} />
        <FormField label="Custom fields (JSON)" type="textarea" value={form.custom_fields} onChange={set("custom_fields")} placeholder='{"resolution":"2MP","lens":"3.6mm"}' />
        <div className="row-actions">
          <button className="primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          <button type="button" onClick={() => navigate("/items")}>Cancel</button>
        </div>
      </form>
    </>
  );
}
