import { resolveName } from "./lookup";

export const isScalar = (v) => v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v);
export const HIDDEN_KEY = /password|token|hash|secret/i;

export const pretty = (k) =>
  String(k).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Id$/, "");

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const STATUS = /status|state|type|action|role/i;

/** Human-friendly rendering of a single value. */
export function formatValue(v, key = "") {
  if (v === null || v === undefined || v === "") return <span className="muted">—</span>;
  const name = resolveName(key, v); // warehouse_id: 2 -> "Main Warehouse"
  if (name) return name;
  if (typeof v === "boolean") return <span className={`badge ${v ? "ok" : "off"}`}>{v ? "Yes" : "No"}</span>;
  if (typeof v === "number") return /(^|_)(id|code|no)$/i.test(key) ? String(v) : v.toLocaleString();
  if (typeof v === "string") {
    if (ISO.test(v) && !Number.isNaN(Date.parse(v))) {
      const d = new Date(v);
      return v.length <= 10 ? d.toLocaleDateString() : d.toLocaleString();
    }
    if (STATUS.test(key) && v.length < 24) return <span className={`badge st-${v.toLowerCase().replace(/\W+/g, "-")}`}>{v}</span>;
  }
  return String(v);
}
