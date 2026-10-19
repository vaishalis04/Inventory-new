import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import FormField from "../components/FormField";
import { ErrorMessage } from "../components/LoadingState";

export default function LoginPage() {
  const { login, register, isAuthed, sessionMessage } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ company_name: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAuthed) return <Navigate to="/dashboard" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login({ email: form.email, password: form.password });
      else await register(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Unable to continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Inventory Management</h1>
        <div className="tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register company</button>
        </div>
        {sessionMessage && <p className="alert error">{sessionMessage}</p>}
        <ErrorMessage error={error} />
        {mode === "register" && (
          <>
            <FormField label="Company name" value={form.company_name} onChange={set("company_name")} required />
            <FormField label="Your name" value={form.name} onChange={set("name")} required />
          </>
        )}
        <FormField label="Email" type="email" value={form.email} onChange={set("email")} required autoComplete="username" />
        <FormField label="Password" type="password" value={form.password} onChange={set("password")} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
        <button className="primary" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
