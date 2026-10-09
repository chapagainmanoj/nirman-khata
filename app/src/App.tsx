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
import { ExpenseNewPage } from './features/costs/ExpenseNewPage'
import { LabourNewPage } from './features/costs/LabourNewPage'
import { PartiesPage } from './features/parties/PartiesPage'
import { PartyDetailPage } from './features/parties/PartyDetailPage'
import { WorkPackageDetailPage } from './features/subcontract/WorkPackageDetailPage'
import { WorkPackageEditPage } from './features/subcontract/WorkPackageEditPage'
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
          <Route path="/subcontractors" element={<PartiesPage key="subcontractor" kind="subcontractor" />} />
          <Route path="/subcontractors/:partyId" element={<PartyDetailPage key="subcontractor" kind="subcontractor" />} />
          <Route path="/crews" element={<PartiesPage key="crew" kind="crew" />} />
          <Route path="/crews/:partyId" element={<PartyDetailPage key="crew" kind="crew" />} />
          <Route path="/payees" element={<PartiesPage key="payee" kind="payee" />} />
          <Route path="/payees/:partyId" element={<PartyDetailPage key="payee" kind="payee" />} />
          <Route path="/work/new" element={<WorkPackageEditPage />} />
          <Route path="/work/:packageId" element={<WorkPackageDetailPage />} />
          <Route path="/work/:packageId/edit" element={<WorkPackageEditPage />} />
          <Route path="/labour/new" element={<LabourNewPage />} />
          <Route path="/expenses/new" element={<ExpenseNewPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
