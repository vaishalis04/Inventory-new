import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteItem, getItemQr, listItems } from "../api/inventory.api";
import { extractList } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { loadLookups } from "../utils/lookup";
import useFetch from "../hooks/useFetch";
import { DataTable } from "../components/DataTable";
import { ErrorMessage, Loading } from "../components/LoadingState";
import Modal from "../components/Modal";
import QrImage from "../components/QrImage";

const LIMIT = 20;

export default function ItemsPage() {
  const { role } = useAuth();
  const canManage = ["admin", "manager"].includes(role);
  const [deleteError, setDeleteError] = useState("");
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

  // Top 5 most-issued items, shown above the table (hidden while searching).
  const popular = useFetch(() => listItems({ limit: 5 }), []);
  const popularItems = extractList(popular.data).filter((i) => Number(i.popularity) > 0);
  const popularIds = new Set(popularItems.map((i) => i.id));
  const days = popular.data?.meta?.popular_days ?? 90;

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

  async function removeItem(item) {
    if (!window.confirm(
      `Delete "${item.name}" permanently?\n\n` +
      `This also deletes ALL of its stock, boxes, individual units, stock movements and print jobs. This cannot be undone.`
    )) return;
    setDeleteError("");
    try {
      await deleteItem(item.id);
      await loadLookups(true);
      reload();
      popular.reload();
    } catch (err) { setDeleteError(err.message); }
  }

  const columns = [
    {
      key: "name", label: "Name",
      render: (item) => (
        <>
          {item.name}
          {popularIds.has(item.id) && <span title={`Top item, last ${days} days`} style={{ marginLeft: 6 }}>🔥</span>}
        </>
      ),
    },
    { key: "model", label: "Model" },
    { key: "brand", label: "Brand" },
    { key: "unit", label: "Unit" },
    { key: "popularity", label: `Issued (${days}d)`, render: (item) => Number(item.popularity) || 0 },
    {
      key: "actions", label: "",
      render: (item) => (
        <div className="row-actions">
          <Link to={`/items/${item.id}/edit`}>Edit</Link>
          <button className="link" onClick={() => showQr(item)}>QR</button>
          {canManage && <button className="link danger" onClick={() => removeItem(item)}>Delete</button>}
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
      {!debounced && popularItems.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>🔥 Popular items <span className="muted" style={{ fontSize: 14 }}>(most issued, last {days} days)</span></h2>
          <div className="grid">
            {popularItems.map((item) => (
              <div className="card" key={item.id}>
                <strong>{item.name}</strong>
                <p className="muted" style={{ margin: "4px 0" }}>{[item.brand, item.model].filter(Boolean).join(" · ") || "—"}</p>
                <p style={{ margin: 0 }}>Issued: <b>{item.popularity}</b> {item.unit}</p>
                <div className="row-actions">
                  <Link to={`/items/${item.id}/edit`}>Edit</Link>
                  <button className="link" onClick={() => showQr(item)}>QR</button>
                  {canManage && <button className="link danger" onClick={() => removeItem(item)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ErrorMessage error={error || deleteError} onRetry={reload} />
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