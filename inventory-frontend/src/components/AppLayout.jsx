
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { loadLookups } from "../utils/lookup";
import { useAuth } from "../context/AuthContext";

const NAV = [
  ["/dashboard", "Dashboard", "▦"],
  ["/items", "Items", "◈"],
  ["/receive", "Receive Stock", "↓"],
  ["/scan", "Scan", "⌗"],
  ["/boxes", "Boxes", "▣"],
  ["/stock", "Stock", "▤"],
  ["/movements", "Movements", "⇄"],
  ["/low-stock", "Low Stock", "!"],
  ["/transfers", "Transfers", "↗", ["admin", "manager"]],
  ["/stock-count", "Stock Count", "☷", ["admin", "manager"]],
  ["/print-jobs", "Print Jobs", "▧"],
  ["/warehouses", "Warehouses", "⌂"],
  ["/categories", "Categories", "⊞"],
  ["/suppliers", "Suppliers", "♧"],
  ["/printers", "Printers", "▤"],
  ["/users", "Users", "♙", ["admin"]],
];

export default function AppLayout() {
  const { user, role, logout } = useAuth();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    loadLookups();
  }, [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const visible = NAV.filter(
    ([, , , roles]) => !roles || !role || roles.includes(role)
  );

  return (
    <div className="shell dark-shell">
      {mobileNavOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <NavLink to="/dashboard" className="brand">
          <span className="brand-mark">I</span>
          <span className="brand-copy">
            <strong>INVENTORY</strong>
            <small>MANAGEMENT SYSTEM</small>
          </span>
        </NavLink>

        <div className="sidebar-caption">WORKSPACE</div>

        <nav className="sidebar-nav">
          {visible.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              <span>{label}</span>
              <span className="nav-active-mark" />
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-dot" />
            <span>
              <strong>System workspace</strong>
              <small>Inventory operations</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button"
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              ☰
            </button>

            <div className="breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-separator">/</span>
              <strong>
                {NAV.find(([to]) =>
                  to === "/dashboard"
                    ? pathname === to
                    : pathname === to || pathname.startsWith(`${to}/`)
                )?.[1] || "Inventory"}
              </strong>
            </div>
          </div>

          <div className="topbar-right">
            <div className="user-profile">
              <div className="user-avatar">
                {(user?.name || user?.email || "U")
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="user-details">
                <strong>{user?.name || user?.email || "Signed in"}</strong>
                <span>{role ? role.replace(/_/g, " ") : "Team member"}</span>
              </div>
            </div>

            <button
              className="logout-button"
              type="button"
              onClick={logout}
              title="Log out"
            >
              <span aria-hidden="true">↗</span>
              <span className="logout-label">Log out</span>
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
