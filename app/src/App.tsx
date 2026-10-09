import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { MorePage } from './components/MorePage'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { CatalogPage } from './features/catalog/CatalogPage'
import { ProjectDetailPage } from './features/projects/ProjectDetailPage'
import { ProjectNewPage } from './features/projects/ProjectNewPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { StaffPage } from './features/staff/StaffPage'
import { NotificationsPage } from './features/notifications/NotificationsPage'
import { BillDetailPage } from './features/supply/BillDetailPage'
import { BillEditPage } from './features/supply/BillEditPage'
import { DeliveryNewPage } from './features/supply/DeliveryNewPage'
import { PaymentDetailPage } from './features/supply/PaymentDetailPage'
import { PaymentNewPage } from './features/supply/PaymentNewPage'
import { SlipDetailPage } from './features/supply/SlipDetailPage'
import { SlipEditPage } from './features/supply/SlipEditPage'
import { SlipsPage } from './features/supply/SlipsPage'
import { SupplierDetailPage } from './features/supply/SupplierDetailPage'
import { SuppliersPage } from './features/supply/SuppliersPage'
import { AdminOnly, RedirectIfSignedIn, RequireCompany } from './routes/guards'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
        <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
        <Route element={<RequireCompany><Layout /></RequireCompany>}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<AdminOnly><ProjectNewPage /></AdminOnly>} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/staff" element={<AdminOnly><StaffPage /></AdminOnly>} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/:supplierId" element={<SupplierDetailPage />} />
          <Route path="/slips" element={<SlipsPage />} />
          <Route path="/slips/new" element={<SlipEditPage />} />
          <Route path="/slips/:slipId" element={<SlipDetailPage />} />
          <Route path="/slips/:slipId/edit" element={<SlipEditPage />} />
          <Route path="/deliveries/new" element={<DeliveryNewPage />} />
          <Route path="/bills/new" element={<BillEditPage />} />
          <Route path="/bills/:billId" element={<BillDetailPage />} />
          <Route path="/bills/:billId/edit" element={<BillEditPage />} />
          <Route path="/payments/new" element={<PaymentNewPage />} />
          <Route path="/payments/:paymentId" element={<PaymentDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
