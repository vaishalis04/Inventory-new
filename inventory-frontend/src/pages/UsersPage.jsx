import { useState } from "react";
import { loadLookups } from "../utils/lookup";
import { createUser, listUsers } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import { ErrorMessage, Loading } from "../components/LoadingState";

const EMPTY = { name: "", email: "", password: "", role: "staff" };

export default function UsersPage() {
  const { data, loading, error, reload } = useFetch(listUsers);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(""); setBusy(true);
    try { await createUser(form); setOpen(false); setForm(EMPTY); loadLookups(true); reload(); }
    catch (err) { setFormError(err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Users</h1>
        <button className="primary" onClick={() => setOpen(true)}>+ New user</button>
      </div>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <AutoTable rows={extractList(data)} hide={["password", "password_hash"]} />}
      {open && (
        <Modal title="New user" onClose={() => setOpen(false)}>
          <ErrorMessage error={formError} />
          <form onSubmit={handleSubmit}>
            <FormField label="Name" value={form.name} onChange={set("name")} required />
            <FormField label="Email" type="email" value={form.email} onChange={set("email")} required />
            <FormField label="Password" type="password" value={form.password} onChange={set("password")} required minLength={6} autoComplete="new-password" />
            <FormField label="Role" value={form.role} onChange={set("role")} options={["admin", "manager", "staff"].map((r) => ({ value: r, label: r }))} required />
            <button className="primary" disabled={busy}>{busy ? "Saving..." : "Create user"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
