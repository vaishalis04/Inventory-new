import { useState } from "react";
import { deleteBox, getBoxQr, listBoxes, listPrinters, listSuppliers, listWarehouses, printBoxLabels, updateBox } from "../api/inventory.api";
import { extractList } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { loadLookups } from "../utils/lookup";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import QrImage from "../components/QrImage";
import { ErrorMessage, Loading, Success } from "../components/LoadingState";

export default function BoxesPage() {
  const { role } = useAuth();
  const canManage = ["admin", "manager"].includes(role);
  const suppliers = useFetch(() => listSuppliers());
  const [filters, setFilters] = useState({ warehouse_id: "", status: "" });
  const warehouses = useFetch(() => listWarehouses());
  const printers = useFetch(listPrinters);
  const { data, loading, error, reload } = useFetch(() => listBoxes(filters), [filters.warehouse_id, filters.status]);
  const [modal, setModal] = useState(null); // {type:'qr'|'edit'|'print', box, data}
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [form, setForm] = useState({});

  const codeOf = (b) => b.code ?? b.box_code;

  async function openQr(box) {
    setMsg({ error: "", ok: "" });
    setModal({ type: "qr", box });
    try { const r = await getBoxQr(codeOf(box)); setModal({ type: "qr", box, data: r.data }); }
    catch (e) { setMsg({ error: e.message, ok: "" }); }
  }

  async function save(e) {
    e.preventDefault();
    setMsg({ error: "", ok: "" });
    const payload = {
      location: form.location ?? "",
      batch_no: form.batch_no ?? "",
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
    };
    if (form.status === "ACTIVE" || form.status === "ARCHIVED") payload.status = form.status;
    try {
      await updateBox(codeOf(modal.box), payload);
      setModal(null); await loadLookups(true); reload();
    } catch (err) { setMsg({ error: err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message, ok: "" }); }
  }

  async function remove(box) {
    if (!window.confirm(
      `Delete box ${codeOf(box)}?\n\n` +
      `This permanently removes the box, its ${box.quantity ?? 0} piece(s) and ALL of its stock movements. ` +
      `Warehouse stock goes down by ${box.quantity ?? 0}.`
    )) return;
    setMsg({ error: "", ok: "" });
    try { await deleteBox(codeOf(box)); await loadLookups(true); reload(); }
    catch (err) { setMsg({ error: err.message, ok: "" }); }
  }

  async function doPrint(e) {
    e.preventDefault();
    setMsg({ error: "", ok: "" });
    try {
      await printBoxLabels(codeOf(modal.box), form.printer_id ? { printer_id: Number(form.printer_id) } : {});
      setMsg({ error: "", ok: "Print job created. Open it from Print Jobs." });
    } catch (err) { setMsg({ error: err.message, ok: "" }); }
  }

  const actions = (box) => (
    <div className="row-actions">
      <button className="link" onClick={() => openQr(box)}>QR</button>
      {canManage && <button className="link" onClick={() => { setMsg({ error: "", ok: "" }); setForm({ status: box.status === "EMPTY" ? "ACTIVE" : box.status ?? "ACTIVE", location: box.location ?? "", batch_no: box.batch_no ?? "", supplier_id: box.supplier_id ?? "" }); setModal({ type: "edit", box }); }}>Edit</button>}
      <button className="link" onClick={() => { setMsg({ error: "", ok: "" }); setForm({ printer_id: "" }); setModal({ type: "print", box }); }}>Print</button>
      {canManage && <button className="link danger" onClick={() => remove(box)}>Delete</button>}
    </div>
  );

  return (
    <>
      <h1>Boxes</h1>
      <div className="toolbar">
        <FormField label="Warehouse" value={filters.warehouse_id} onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
        <FormField label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          options={["ACTIVE", "EMPTY", "ARCHIVED"].map((s) => ({ value: s, label: s }))} />
      </div>
      <ErrorMessage error={!modal ? error : ""} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} actions={actions} rowKey={(b) => codeOf(b) ?? b.id} />}

      {modal && (
        <Modal title={`Box ${codeOf(modal.box)}`} onClose={() => setModal(null)}>
          <ErrorMessage error={msg.error} />
          <Success>{msg.ok}</Success>
          {modal.type === "qr" && (modal.data ? <QrImage data={modal.data} size={220} /> : !msg.error && <Loading />)}
          {modal.type === "edit" && (
            <form onSubmit={save}>
              <FormField label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                options={[{ value: "ACTIVE", label: "ACTIVE" }, { value: "ARCHIVED", label: "ARCHIVED (box must be empty)" }]}
                hint="A box becomes EMPTY automatically when its quantity reaches 0." />
              <FormField label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              <FormField label="Batch no." value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} />
              <FormField label="Supplier" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                options={extractList(suppliers.data).map((x) => ({ value: x.id, label: x.name }))} />
              <button className="primary">Save</button>
            </form>
          )}
          {modal.type === "print" && (
            <form onSubmit={doPrint}>
              <FormField label="Printer (optional)" value={form.printer_id} onChange={(e) => setForm({ ...form, printer_id: e.target.value })}
                options={extractList(printers.data).map((p) => ({ value: p.id, label: p.name }))} />
              <button className="primary">Create print job</button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
