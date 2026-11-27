import { useMemo, useState } from "react";
import { listItems, listPrintJobs, openPrintSheet } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import FormField from "../components/FormField";
import SearchableSelect from "../components/SearchableSelect";
import PeriodFilter from "../components/PeriodFilter";
import { dayBounds } from "../utils/dateRange";
import Pager from "../components/Pager";
import RefreshButton from "../components/RefreshButton";
import { ErrorMessage, Loading } from "../components/LoadingState";

const emptyFilters = { q: "", item_id: "", status: "", period: "all", from: "", to: "" };

export default function PrintJobsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [f, setF] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [rangeError, setRangeError] = useState("");
  const items = useFetch(() => listItems({ limit: 500 }));

  // The date filter covers whole days (00:00 of the first day to 23:59 of the last day, local time).
  const params = useMemo(() => {
    const p = { ...applied, from: "", to: "", page, limit };
    delete p.period;
    Object.assign(p, dayBounds(applied.from, applied.to));
    return p;
  }, [applied, page, limit]);
  const { data, loading, error, reload } = useFetch(() => listPrintJobs(params), [JSON.stringify(params)]);

  const [err, setErr] = useState("");
  const open = async (job) => {
    setErr("");
    try { await openPrintSheet(job.id); } catch (e) { setErr(e.message); }
  };

  function applyFilters(e) {
    e.preventDefault();
    if (f.from && f.to && f.from > f.to) return setRangeError("The 'From' date cannot be after the 'To' date.");
    setRangeError("");
    setPage(1);
    setApplied(f);
  }
  function resetFilters() {
    setRangeError("");
    setPage(1);
    setF(emptyFilters);
    setApplied(emptyFilters);
  }

  return (
    <div className="page page-printjobs">
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Print jobs</h1>
        <RefreshButton onClick={reload} busy={loading} />
      </div>
      <form className="toolbar" onSubmit={applyFilters}>
        <FormField label="Search" placeholder="Item, SKU, created by or job no." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <SearchableSelect label="Item" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}
          options={extractList(items.data).map((i) => ({ value: i.id, label: [i.name, i.model, i.sku].filter(Boolean).join(" — ") }))} />
        <FormField label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}
          options={[
            { value: "PRINTED", label: "Printed" },
            { value: "SHEET", label: "Sheet" },
            { value: "FAILED", label: "Failed" },
          ]} />
        <PeriodFilter value={{ period: f.period, from: f.from, to: f.to }} onChange={(v) => setF({ ...f, ...v })} />
        <button className="primary">Apply</button>
        <button type="button" onClick={resetFilters}>Reset</button>
      </form>
      <ErrorMessage error={error || err || rangeError} onRetry={reload} />
      {loading ? <Loading /> : (
        <AutoTable rows={extractList(data)} hide={["Item", "box_id", "Box", "include_box_label"]} actions={(job) => <button className="link" onClick={() => open(job)}>Open sheet</button>} />
      )}
      <Pager page={page} limit={limit} total={data?.meta?.total ?? extractList(data).length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />
    </div>
  );
}