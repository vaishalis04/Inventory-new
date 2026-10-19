import { useState } from "react";
import { getBoxQr, listBoxes, listPrinters, listWarehouses, printBoxLabels, updateBox } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import QrImage from "../components/QrImage";
import { ErrorMessage, Loading, Success } from "../components/LoadingState";

export default function BoxesPage() {
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
    const payload = {};
    if (form.status) payload.status = form.status;
    if (form.location !== undefined && form.location !== "") payload.location = form.location;
    try {
      await updateBox(codeOf(modal.box), payload);
      setModal(null); reload();
    } catch (err) { setMsg({ error: err.message, ok: "" }); }
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
      <button className="link" onClick={() => { setMsg({ error: "", ok: "" }); setForm({ status: box.status ?? "", location: box.location ?? "" }); setModal({ type: "edit", box }); }}>Edit</button>
      <button className="link" onClick={() => { setMsg({ error: "", ok: "" }); setForm({ printer_id: "" }); setModal({ type: "print", box }); }}>Print</button>
    </div>
  );

  return (
    <>
      <h1>Boxes</h1>
      <div className="toolbar">
        <FormField label="Warehouse" value={filters.warehouse_id} onChange={(e) => setFilters({ ...filters, warehouse_id: e.target.value })}
          options={extractList(warehouses.data).map((w) => ({ value: w.id, label: w.name }))} />
        <FormField label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          options={["ACTIVE", "EMPTY", "TRANSFERRED"].map((s) => ({ value: s, label: s }))} hint="Adjust to your backend's statuses" />
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
              <FormField label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
              <FormField label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
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
