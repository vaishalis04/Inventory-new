import { useState } from "react";
import { listPrintJobs, openPrintSheet } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { AutoTable } from "../components/DataTable";
import { ErrorMessage, Loading } from "../components/LoadingState";

export default function PrintJobsPage() {
  const { data, loading, error, reload } = useFetch(listPrintJobs);
  const [err, setErr] = useState("");
  const open = async (job) => {
    setErr("");
    try { await openPrintSheet(job.id); } catch (e) { setErr(e.message); }
  };
  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Print jobs</h1>
        <button onClick={reload}>Refresh</button>
      </div>
      <ErrorMessage error={error || err} onRetry={reload} />
      {loading ? <Loading /> : (
        <AutoTable rows={extractList(data)} actions={(job) => <button className="link" onClick={() => open(job)}>Open sheet</button>} />
      )}
    </>
  );
}
