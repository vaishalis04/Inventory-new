import { resolveName } from "./lookup";

export const isScalar = (v) => v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v);
export const HIDDEN_KEY = /password|token|hash|secret/i;

export const pretty = (k) =>
  String(k).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Id$/, "");

const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const STATUS = /status|state|type|action|role/i;

const two = (n) => String(n).padStart(2, "0");
/** dd/mm/yyyy (and, when the value has a time, ", h:mm:ss am/pm" in local time). */
export function formatDate(v, withTime = true) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const date = `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (!withTime) return date;
  const h = d.getHours();
  return `${date}, ${h % 12 || 12}:${two(d.getMinutes())}:${two(d.getSeconds())} ${h < 12 ? "am" : "pm"}`;
}

/** Human-friendly rendering of a single value. */
export function formatValue(v, key = "") {
  if (v === null || v === undefined || v === "") return <span className="muted">—</span>;
  const name = resolveName(key, v); // warehouse_id: 2 -> "Main Warehouse"
  if (name) return name;
  if (typeof v === "boolean") return <span className={`badge ${v ? "ok" : "off"}`}>{v ? "Yes" : "No"}</span>;
  if (typeof v === "number") return /(^|_)(id|code|no)$/i.test(key) ? String(v) : v.toLocaleString();
  if (typeof v === "string") {
    if (ISO.test(v) && !Number.isNaN(Date.parse(v))) {
      // date-only values (YYYY-MM-DD) are shown without a time, and without timezone shifting
      return v.length <= 10 ? formatDate(`${v}T00:00:00`, false) : formatDate(v);
    }
    if (STATUS.test(key) && v.length < 24) return <span className={`badge st-${v.toLowerCase().replace(/\W+/g, "-")}`}>{v}</span>;
  }
  return String(v);
}
