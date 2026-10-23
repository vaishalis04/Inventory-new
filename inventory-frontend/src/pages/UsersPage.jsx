import { useState } from "react";
import { loadLookups } from "../utils/lookup";
import { createUser, deleteUser, listUsers, updateUser } from "../api/inventory.api";
import { extractList } from "../api/http";
import { useAuth } from "../context/AuthContext";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import Modal from "../components/Modal";
import { ErrorMessage, Loading } from "../components/LoadingState";

const EMPTY = { name: "", email: "", password: "", role: "staff", is_active: "true" };
const ROLE_OPTIONS = ["admin", "manager", "staff"].map((r) => ({ value: r, label: r }));
const ACTIVE_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Disabled (cannot sign in)" },
];

const errText = (err) => (err.details ? `${err.message}: ${JSON.stringify(err.details)}` : err.message);

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch(listUsers);
  const [editing, setEditing] = useState(null); // null | {} (new) | user row
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const isEdit = Boolean(editing?.id);

  function openNew() {
    setFormError("");
    setForm(EMPTY);
    setEditing({});
  }

  function openEdit(row) {
    setFormError("");
    setForm({
      name: row.name ?? "",
      email: row.email ?? "",
      password: "",
      role: row.role ?? "staff",
      is_active: String(row.is_active !== false),
    });
    setEditing(row);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      if (isEdit) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          is_active: form.is_active === "true",
        };
        if (form.password) payload.password = form.password; // blank = keep the current password
        await updateUser(editing.id, payload);
      } else {
        await createUser({ name: form.name, email: form.email, password: form.password, role: form.role });
      }
      setEditing(null);
      setForm(EMPTY);
      loadLookups(true);
      reload();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(
      `Delete user "${row.name}" (${row.email})?\n\n` +
      `Their past stock movements stay in the history, but will no longer show their name.`
    )) return;
    setPageError("");
    try {
      await deleteUser(row.id);
      loadLookups(true);
      reload();
    } catch (err) {
      setPageError(errText(err));
    }
  }

  const actions = (row) => (
    <div className="row-actions">
      <button className="link" onClick={() => openEdit(row)}>Edit</button>
      {Number(row.id) !== Number(me?.id) && (
        <button className="link danger" onClick={() => handleDelete(row)}>Delete</button>
      )}
    </div>
  );

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Users</h1>
        <button className="primary" onClick={openNew}>+ New user</button>
      </div>
      <ErrorMessage error={error || pageError} onRetry={reload} />
      {loading ? <Loading /> : (
        <AutoTable rows={extractList(data)} hide={["password", "password_hash"]} actions={actions} />
      )}
      {editing && (
        <Modal title={isEdit ? `Edit user — ${editing.name}` : "New user"} onClose={() => setEditing(null)}>
          <ErrorMessage error={formError} />
          <form onSubmit={handleSubmit}>
            <FormField label="Name" value={form.name} onChange={set("name")} required />
            <FormField label="Email" type="email" value={form.email} onChange={set("email")} required />
            <FormField
              label={isEdit ? "New password (leave blank to keep current)" : "Password"}
              type="password" value={form.password} onChange={set("password")}
              required={!isEdit} minLength={6} autoComplete="new-password"
            />
            <FormField label="Role" value={form.role} onChange={set("role")} options={ROLE_OPTIONS} required />
            {isEdit && (
              <FormField label="Status" value={form.is_active} onChange={set("is_active")} options={ACTIVE_OPTIONS} required />
            )}
            <button className="primary" disabled={busy}>{busy ? "Saving..." : isEdit ? "Save changes" : "Create user"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
