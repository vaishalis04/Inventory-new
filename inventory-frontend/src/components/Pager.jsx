import { useEffect } from "react";

const SIZES = [10, 20, 50, 100];

/** Pagination bar: "Showing 21–40 of 78", first/prev/page numbers/next/last and a rows-per-page selector. */
export default function Pager({ page, limit, total, onPage, onLimit, loading = false }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  // If the current page no longer exists (e.g. the last row was deleted or a filter changed), go to the last page.
  useEffect(() => {
    if (!loading && page > pages) onPage(pages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages, loading]);
  if (!total) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = [];
  for (let n = start; n <= Math.min(pages, start + 4); n++) numbers.push(n);
  const go = (n) => onPage(Math.min(pages, Math.max(1, n)));

  return (
    <div className="pager-bar">
      <style>{`
        .pager-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 14px 0 6px; }
        .pager-bar .pager-info { font-size: 13px; opacity: .8; }
        .pager-bar .pager-nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .pager-bar button { min-width: 36px; min-height: 36px; padding: 0 10px; }
        .pager-bar button.current { background: var(--primary, #4f46e5); color: #fff; border-color: var(--primary, #4f46e5); }
        .pager-bar select { min-height: 36px; width: auto; padding: 0 8px; }
      `}</style>
      <div className="pager-info">Showing {from}–{to} of {total}</div>
      <div className="pager-nav">
        <button type="button" onClick={() => go(1)} disabled={loading || page <= 1} aria-label="First page">«</button>
        <button type="button" onClick={() => go(page - 1)} disabled={loading || page <= 1}>‹ Prev</button>
        {numbers.map((n) => (
          <button type="button" key={n} className={n === page ? "current" : ""} onClick={() => go(n)} disabled={loading}>{n}</button>
        ))}
        <button type="button" onClick={() => go(page + 1)} disabled={loading || page >= pages}>Next ›</button>
        <button type="button" onClick={() => go(pages)} disabled={loading || page >= pages} aria-label="Last page">»</button>
        {onLimit && (
          <label className="pager-info" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            Rows
            <select value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
