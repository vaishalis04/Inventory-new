import { useState } from "react";

/** "Refresh data" button used on every page. onClick may be async; the icon spins briefly so the click is visible. */
export default function RefreshButton({ onClick, busy = false, label = "Refresh data" }) {
  const [spinning, setSpinning] = useState(false);
  async function handle() {
    if (spinning) return;
    setSpinning(true);
    try { await onClick?.(); } finally { setTimeout(() => setSpinning(false), 600); }
  }
  return (
    <>
      <style>{`
        .rf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 42px; padding: 0 17px; border: 1px solid var(--border, #e8ecf2); border-radius: 10px; background: var(--surface, #ffffff); color: var(--text, #172033); font-size: 13px; font-weight: 700; cursor: pointer; transition: border-color .2s, transform .2s; }
        .rf-btn:hover { border-color: var(--primary, #4f46e5); transform: translateY(-1px); }
        .rf-btn:disabled { cursor: wait; opacity: .65; }
        .rf-btn span { display: inline-block; font-size: 18px; line-height: 1; }
        .rf-btn.spin span { animation: rf-spin .7s linear infinite; }
        @keyframes rf-spin { to { transform: rotate(360deg); } }
        .rf-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
        .rf-head h1 { margin: 0; }
      `}</style>
      <button className={`rf-btn${spinning ? " spin" : ""}`} type="button" onClick={handle} disabled={busy || spinning} aria-label="Refresh data">
        <span aria-hidden="true">↻</span>
        {label}
      </button>
    </>
  );
}
