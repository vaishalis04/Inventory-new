import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ItemsPage from "./pages/ItemsPage";
import ItemFormPage from "./pages/ItemFormPage";
import ReceiveStockPage from "./pages/ReceiveStockPage";
import ScanPage from "./pages/ScanPage";
import BoxesPage from "./pages/BoxesPage";
import { StockPage, MovementsPage, LowStockPage } from "./pages/ReportPages";
import { WarehousesPage, CategoriesPage, SuppliersPage, PrintersPage } from "./pages/MasterPages";
import TransfersPage from "./pages/TransfersPage";
import StockCountPage from "./pages/StockCountPage";
import PrintJobsPage from "./pages/PrintJobsPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/items/new" element={<ItemFormPage />} />
        <Route path="/items/:id/edit" element={<ItemFormPage />} />
        <Route path="/receive" element={<ReceiveStockPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/boxes" element={<BoxesPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/movements" element={<MovementsPage />} />
        <Route path="/low-stock" element={<LowStockPage />} />
        <Route path="/warehouses" element={<WarehousesPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/printers" element={<PrintersPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/stock-count" element={<StockCountPage />} />
        <Route path="/print-jobs" element={<PrintJobsPage />} />
        <Route path="/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
