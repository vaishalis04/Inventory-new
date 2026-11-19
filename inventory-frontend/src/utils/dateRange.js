/** Quick date ranges shared by the Stock and Movements filters. */
export const PERIOD_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** { from, to } as YYYY-MM-DD (local time) for a quick period, or null for "all" / "custom". */
export function periodRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case "today": return { from: ymd(today), to: ymd(today) };
    case "yesterday": { const y = addDays(today, -1); return { from: ymd(y), to: ymd(y) }; }
    case "7d": return { from: ymd(addDays(today, -6)), to: ymd(today) };
    case "30d": return { from: ymd(addDays(today, -29)), to: ymd(today) };
    case "month": return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(today) };
    default: return null;
  }
}

/** Whole-day bounds for the API: from 00:00 of the first day to 23:59:59 of the last day (local time). */
export function dayBounds(from, to) {
  const out = {};
  if (from) out.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) out.to = new Date(`${to}T23:59:59.999`).toISOString();
  return out;
}
