import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getItemQr, listItems } from "../api/inventory.api";
import { extractList } from "../api/http";
import useFetch from "../hooks/useFetch";
import { DataTable } from "../components/DataTable";
import { ErrorMessage, Loading } from "../components/LoadingState";
import Modal from "../components/Modal";
import QrImage from "../components/QrImage";

const LIMIT = 20;

export default function ItemsPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [qr, setQr] = useState(null);
  const [qrError, setQrError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const { data, loading, error, reload } = useFetch(
    () => listItems({ q: debounced, page, limit: LIMIT }),
    [debounced, page]
  );
  const items = extractList(data);

  async function showQr(item) {
    setQrError("");
    setQr({ item, data: null });
    try {
      const res = await getItemQr(item.id);
      setQr({ item, data: res.data });
    } catch (err) {
      setQrError(err.message);
    }
  }

  const columns = [
    { key: "name", label: "Name" },
    { key: "model", label: "Model" },
    { key: "brand", label: "Brand" },
    { key: "unit", label: "Unit" },
    {
      key: "actions", label: "",
      render: (item) => (
        <div className="row-actions">
          <Link to={`/items/${item.id}/edit`}>Edit</Link>
          <button className="link" onClick={() => showQr(item)}>QR</button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="toolbar">
        <h1 style={{ margin: 0, flex: 1 }}>Items</h1>
        <input style={{ maxWidth: 280 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, model or brand" />
        <Link to="/items/new"><button className="primary">+ New item</button></Link>
      </div>
      <ErrorMessage error={error} onRetry={reload} />
      {loading ? <Loading /> : <DataTable columns={columns} rows={items} />}
      <div className="pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {page}</span>
        <button disabled={items.length < LIMIT} onClick={() => setPage(page + 1)}>Next</button>
      </div>
      {qr && (
        <Modal title={`QR — ${qr.item.name}`} onClose={() => setQr(null)}>
          <ErrorMessage error={qrError} />
          {qr.data ? <QrImage data={qr.data} size={220} /> : !qrError && <Loading />}
        </Modal>
      )}
    </>
  );
}
