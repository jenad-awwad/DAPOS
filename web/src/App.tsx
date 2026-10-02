import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { GuestRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { CalendarPage } from "./pages/CalendarPage";
import { CategoriesAdminPage } from "./pages/CategoriesAdminPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PosPage } from "./pages/PosPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ProductsAdminPage } from "./pages/ProductsAdminPage";
import { RolesPoliciesPage } from "./pages/RolesPoliciesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VendorsPage } from "./pages/VendorsPage";
import { StaffPage } from "./pages/StaffPage";
import { StockPage } from "./pages/StockPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory/:id" element={<ProductDetailPage />} />
            <Route path="admin/products" element={<ProductsAdminPage />} />
            <Route path="admin/categories" element={<CategoriesAdminPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="admin/staff" element={<StaffPage />} />
            <Route path="admin/roles" element={<RolesPoliciesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
