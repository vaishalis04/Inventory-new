import { useEffect, useState } from "react";
import { listItems, listPrintJobs, openPrintSheet } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import Pager from "../components/Pager";
import RefreshButton from "../components/RefreshButton";
import FormField from "../components/FormField";
import SearchableSelect from "../components/SearchableSelect";
import { ErrorMessage, Loading } from "../components/LoadingState";

export default function PrintJobsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [status, setStatus] = useState("");
  const items = useFetch(() => listItems({ limit: 500 }));
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, loading, error, reload } = useFetch(
    () => listPrintJobs({ page, limit, q: debouncedSearch, item_id: itemId, status }),
    [page, limit, debouncedSearch, itemId, status]
  );
  const [err, setErr] = useState("");
  const open = async (job) => {
    setErr("");
    try { await openPrintSheet(job.id); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="page page-printjobs">
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Print jobs</h1>
        <RefreshButton onClick={() => { reload(); items.reload(); }} busy={loading || items.loading} />
      </div>
      <form className="toolbar" onSubmit={(event) => event.preventDefault()}>
        <FormField
          label="Search"
          type="search"
          placeholder="Item, SKU, model, box or error"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SearchableSelect
          label="Item"
          value={itemId}
          onChange={(event) => { setItemId(event.target.value); setPage(1); }}
          options={extractList(items.data).map((item) => ({
            value: item.id,
            label: [item.name, item.model, item.sku].filter(Boolean).join(" — "),
          }))}
        />
        <FormField
          label="Status"
          value={status}
          onChange={(event) => { setStatus(event.target.value); setPage(1); }}
          options={[
            { value: "SHEET", label: "Sheet" },
            { value: "PRINTED", label: "Printed" },
            { value: "FAILED", label: "Failed" },
          ]}
        />
        <button type="button" onClick={() => { setSearch(""); setItemId(""); setStatus(""); setPage(1); }}>Reset</button>
      </form>
      <ErrorMessage error={error || err} onRetry={reload} />
      {loading ? <Loading /> : (
        <AutoTable rows={extractList(data)} hide={["created_by"]} actions={(job) => <button className="link" onClick={() => open(job)}>Open sheet</button>} />
      )}
      <Pager page={page} limit={limit} total={data?.meta?.total ?? extractList(data).length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />
    </div>
  );
}
