import { lazy, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { AdminOnly, Home, RedirectIfSignedIn, RequireCompany } from './routes/guards'

// Each screen is its own chunk, so the first load is only sign-in, the frame and Projects
// (/impeccable optimize). The service worker precaches the rest for later visits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page<M extends Record<K, ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({ default: (await load())[name] as M[K] }))
}

const MorePage = page(() => import('./components/MorePage'), 'MorePage')
const CatalogPage = page(() => import('./features/catalog/CatalogPage'), 'CatalogPage')
const ProjectDetailPage = page(() => import('./features/projects/ProjectDetailPage'), 'ProjectDetailPage')
const ProjectNewPage = page(() => import('./features/projects/ProjectNewPage'), 'ProjectNewPage')
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage')
const StaffPage = page(() => import('./features/staff/StaffPage'), 'StaffPage')
const NotificationsPage = page(() => import('./features/notifications/NotificationsPage'), 'NotificationsPage')
const BillDetailPage = page(() => import('./features/supply/BillDetailPage'), 'BillDetailPage')
const BillEditPage = page(() => import('./features/supply/BillEditPage'), 'BillEditPage')
const DeliveryNewPage = page(() => import('./features/supply/DeliveryNewPage'), 'DeliveryNewPage')
const PaymentDetailPage = page(() => import('./features/supply/PaymentDetailPage'), 'PaymentDetailPage')
const PaymentNewPage = page(() => import('./features/supply/PaymentNewPage'), 'PaymentNewPage')
const SlipDetailPage = page(() => import('./features/supply/SlipDetailPage'), 'SlipDetailPage')
const SlipEditPage = page(() => import('./features/supply/SlipEditPage'), 'SlipEditPage')
const SlipsPage = page(() => import('./features/supply/SlipsPage'), 'SlipsPage')
const SupplierDetailPage = page(() => import('./features/supply/SupplierDetailPage'), 'SupplierDetailPage')
const SuppliersPage = page(() => import('./features/supply/SuppliersPage'), 'SuppliersPage')
const ExpenseNewPage = page(() => import('./features/costs/ExpenseNewPage'), 'ExpenseNewPage')
const LabourNewPage = page(() => import('./features/costs/LabourNewPage'), 'LabourNewPage')
const PartiesPage = page(() => import('./features/parties/PartiesPage'), 'PartiesPage')
const PartyDetailPage = page(() => import('./features/parties/PartyDetailPage'), 'PartyDetailPage')
const WorkPackageDetailPage = page(() => import('./features/subcontract/WorkPackageDetailPage'), 'WorkPackageDetailPage')
const WorkPackageEditPage = page(() => import('./features/subcontract/WorkPackageEditPage'), 'WorkPackageEditPage')
const BillsPage = page(() => import('./features/lists/BillsPage'), 'BillsPage')
const DeliveriesPage = page(() => import('./features/lists/DeliveriesPage'), 'DeliveriesPage')
const PartiesHubPage = page(() => import('./features/lists/PartiesPage'), 'PartiesHubPage')
const PaymentsPage = page(() => import('./features/lists/PaymentsPage'), 'PaymentsPage')
const DailyReportPage = page(() => import('./features/site/DailyReportPage'), 'DailyReportPage')
const ReportDetailPage = page(() => import('./features/site/ReportDetailPage'), 'ReportDetailPage')
const CalendarPage = page(() => import('./features/calendar/CalendarPage'), 'CalendarPage')
const DashboardPage = page(() => import('./features/dashboard/DashboardPage'), 'DashboardPage')
const ReportsPage = page(() => import('./features/reports/ReportsPage'), 'ReportsPage')
const ReportPage = page(() => import('./features/reports/ReportPage'), 'ReportPage')

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
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/deliveries/new" element={<DeliveryNewPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/parties" element={<PartiesHubPage />} />
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
          <Route path="/daily/new" element={<DailyReportPage />} />
          <Route path="/daily/:reportId" element={<ReportDetailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:reportKey" element={<ReportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
