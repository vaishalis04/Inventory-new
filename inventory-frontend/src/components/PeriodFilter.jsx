import FormField from "./FormField";
import { PERIOD_OPTIONS, periodRange } from "../utils/dateRange";

/**
 * "Date range" selector (Today, Last 7 days, Custom…) plus From / To dates.
 * value = { period, from, to }; onChange receives the next { period, from, to }.
 */
export default function PeriodFilter({ value, onChange }) {
  const { period = "all", from = "", to = "" } = value;
  function choosePeriod(key) {
    if (key === "custom") return onChange({ period: "custom", from, to });
    const range = periodRange(key);
    onChange({ period: key, from: range?.from ?? "", to: range?.to ?? "" });
  }
  return (
    <>
      <FormField label="Date range" value={period} onChange={(e) => choosePeriod(e.target.value || "all")} options={PERIOD_OPTIONS} />
      <FormField label="From date" type="date" value={from} max={to || undefined} onChange={(e) => onChange({ period: "custom", from: e.target.value, to })} />
      <FormField label="To date" type="date" value={to} min={from || undefined} onChange={(e) => onChange({ period: "custom", from, to: e.target.value })} />
    </>
  );
}
