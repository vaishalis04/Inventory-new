import { useState } from "react";
import { listPrintJobs, openPrintSheet } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import Pager from "../components/Pager";
import RefreshButton from "../components/RefreshButton";
import { ErrorMessage, Loading } from "../components/LoadingState";

export default function PrintJobsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const { data, loading, error, reload } = useFetch(() => listPrintJobs({ page, limit }), [page, limit]);
  const [err, setErr] = useState("");
  const open = async (job) => {
    setErr("");
    try { await openPrintSheet(job.id); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="page page-printjobs">
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Print jobs</h1>
        <RefreshButton onClick={reload} busy={loading} />
      </div>
      <ErrorMessage error={error || err} onRetry={reload} />
      {loading ? <Loading /> : (
        <AutoTable rows={extractList(data)} hide={["Item", "box_id", "Box", "include_box_label"]} actions={(job) => <button className="link" onClick={() => open(job)}>Open sheet</button>} />
      )}
      <Pager page={page} limit={limit} total={data?.meta?.total ?? extractList(data).length} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }} loading={loading} />
    </div>
  );
}