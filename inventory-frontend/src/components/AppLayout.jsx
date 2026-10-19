import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { loadLookups } from "../utils/lookup";
import { useAuth } from "../context/AuthContext";

const NAV = [
  ["/dashboard", "Dashboard"],
  ["/items", "Items"],
  ["/receive", "Receive Stock"],
  ["/scan", "Scan"],
  ["/boxes", "Boxes"],
  ["/stock", "Stock"],
  ["/movements", "Movements"],
  ["/low-stock", "Low Stock"],
  ["/transfers", "Transfer", ["admin", "manager"]],
  ["/stock-count", "Stock Count", ["admin", "manager"]],
  ["/print-jobs", "Print Jobs"],
  ["/warehouses", "Warehouses"],
  ["/categories", "Categories"],
  ["/suppliers", "Suppliers"],
  ["/printers", "Printers"],
  ["/users", "Users", ["admin"]],
];

export default function AppLayout() {
  const { user, role, logout } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => { loadLookups(); }, [pathname]); // refreshed (throttled) on navigation
  // Hide links for roles known NOT to have access; the backend is the real security boundary.
  const visible = NAV.filter(([, , roles]) => !roles || !role || roles.includes(role));
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Inventory</div>
        <nav>
          {visible.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="muted">
            {user?.name || user?.email || "Signed in"} {role && <em>({role})</em>}
          </span>
          <button onClick={logout}>Log out</button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
