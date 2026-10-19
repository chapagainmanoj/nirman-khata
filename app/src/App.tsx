import { lazy, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { PageBoundary } from './components/PageBoundary'
import { LoginPage } from './features/auth/LoginPage'
import { EMAIL_RESET, ForgotPasswordPage, ResetPasswordPage } from './features/auth/PasswordResetPages'
import { RegisterPage } from './features/auth/RegisterPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { AdminOnly, Home, RedirectIfSignedIn, RequireCompany, RequirePlatformAdmin } from './routes/guards'

// Each screen is its own chunk, so the first load is only sign-in, the frame and Projects
// (/impeccable optimize). The service worker precaches the rest for later visits.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page<M extends Record<K, ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => ({ default: (await load())[name] as M[K] }))
}

const MorePage = page(() => import('./components/MorePage'), 'MorePage')
const WaitingPhotosPage = page(() => import('./features/photos/WaitingPhotosPage'), 'WaitingPhotosPage')
const CatalogPage = page(() => import('./features/catalog/CatalogPage'), 'CatalogPage')
const ProjectDetailPage = page(() => import('./features/projects/ProjectDetailPage'), 'ProjectDetailPage')
const ProjectNewPage = page(() => import('./features/projects/ProjectNewPage'), 'ProjectNewPage')
const SettingsPage = page(() => import('./features/settings/SettingsPage'), 'SettingsPage')
const StaffPage = page(() => import('./features/staff/StaffPage'), 'StaffPage')
const HowToUsePage = page(() => import('./features/help/HowToUsePage'), 'HowToUsePage')
const NotificationsPage = page(() => import('./features/notifications/NotificationsPage'), 'NotificationsPage')
const BillDetailPage = page(() => import('./features/supply/BillDetailPage'), 'BillDetailPage')
const BillEditPage = page(() => import('./features/supply/BillEditPage'), 'BillEditPage')
const DeliveryDetailPage = page(() => import('./features/supply/DeliveryDetailPage'), 'DeliveryDetailPage')
const DeliveryNewPage = page(() => import('./features/supply/DeliveryNewPage'), 'DeliveryNewPage')
const PaymentDetailPage = page(() => import('./features/supply/PaymentDetailPage'), 'PaymentDetailPage')
const RefundDetailPage = page(() => import('./features/refunds/RefundDetailPage'), 'RefundDetailPage')
const ClientReceiptNewPage = page(() => import('./features/clients/ClientReceiptNewPage'), 'ClientReceiptNewPage')
const ClientReceiptDetailPage = page(() => import('./features/clients/ClientReceiptDetailPage'), 'ClientReceiptDetailPage')
const PaymentNewPage = page(() => import('./features/supply/PaymentNewPage'), 'PaymentNewPage')
const SlipDetailPage = page(() => import('./features/supply/SlipDetailPage'), 'SlipDetailPage')
const SlipEditPage = page(() => import('./features/supply/SlipEditPage'), 'SlipEditPage')
const SlipsPage = page(() => import('./features/supply/SlipsPage'), 'SlipsPage')
const SupplierDetailPage = page(() => import('./features/supply/SupplierDetailPage'), 'SupplierDetailPage')
const SupplierRatesPage = page(() => import('./features/supply/SupplierDetailPage'), 'SupplierRatesPage')
const SupplierEditPage = page(() => import('./features/supply/SupplierDetailPage'), 'SupplierEditPage')
const SupplierInfoPage = page(() => import('./features/supply/SupplierDetailPage'), 'SupplierInfoPage')
const SuppliersPage = page(() => import('./features/supply/SuppliersPage'), 'SuppliersPage')
const ExpenseNewPage = page(() => import('./features/costs/ExpenseNewPage'), 'ExpenseNewPage')
const LabourNewPage = page(() => import('./features/costs/LabourNewPage'), 'LabourNewPage')
const TimeCardRedirect = page(() => import('./features/labour/CrewRedirect'), 'TimeCardRedirect')
const CrewRedirect = page(() => import('./features/labour/CrewRedirect'), 'CrewRedirect')
const PartiesPage = page(() => import('./features/parties/PartiesPage'), 'PartiesPage')
const PartyEditPage = page(() => import('./features/parties/PartyDetailPage'), 'PartyEditPage')
const PartyInfoPage = page(() => import('./features/parties/PartyDetailPage'), 'PartyInfoPage')
const PartyDetailPage = page(() => import('./features/parties/PartyDetailPage'), 'PartyDetailPage')
const WorkPackageDetailPage = page(() => import('./features/subcontract/WorkPackageDetailPage'), 'WorkPackageDetailPage')
const WorkPackageEditPage = page(() => import('./features/subcontract/WorkPackageEditPage'), 'WorkPackageEditPage')
const BillsPage = page(() => import('./features/lists/BillsPage'), 'BillsPage')
const DeliveriesPage = page(() => import('./features/lists/DeliveriesPage'), 'DeliveriesPage')
const PartiesHubPage = page(() => import('./features/lists/PartiesPage'), 'PartiesHubPage')
const PaymentsPage = page(() => import('./features/lists/PaymentsPage'), 'PaymentsPage')
const ExpensesPage = page(() => import('./features/lists/ExpensesPage'), 'ExpensesPage')
const DailyReportPage = page(() => import('./features/site/DailyReportPage'), 'DailyReportPage')
const ReportDetailPage = page(() => import('./features/site/ReportDetailPage'), 'ReportDetailPage')
const CalendarPage = page(() => import('./features/calendar/CalendarPage'), 'CalendarPage')
const DashboardPage = page(() => import('./features/dashboard/DashboardPage'), 'DashboardPage')
const ReportsPage = page(() => import('./features/reports/ReportsPage'), 'ReportsPage')
const ReportPage = page(() => import('./features/reports/ReportPage'), 'ReportPage')
const PlatformPage = page(() => import('./features/platform/PlatformPage'), 'PlatformPage')

export function App() {
  return (
    <BrowserRouter>
      {/* Screens outside the frame (sign-in, /platform); inside it Layout keeps the menu on screen. */}
      <PageBoundary>
      <Routes>
        <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
        <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
        {EMAIL_RESET && <Route path="/forgot" element={<RedirectIfSignedIn><ForgotPasswordPage /></RedirectIfSignedIn>} />}
        {EMAIL_RESET && <Route path="/reset" element={<ResetPasswordPage />} />}
        <Route path="/platform" element={<RequirePlatformAdmin><PlatformPage /></RequirePlatformAdmin>} />
        <Route element={<RequireCompany><Layout /></RequireCompany>}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<AdminOnly><ProjectNewPage /></AdminOnly>} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/staff" element={<AdminOnly><StaffPage /></AdminOnly>} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/photos-waiting" element={<WaitingPhotosPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/how-to-use" element={<HowToUsePage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/:supplierId" element={<SupplierDetailPage />} />
          <Route path="/suppliers/:supplierId/details" element={<SupplierInfoPage />} />
          <Route path="/suppliers/:supplierId/edit" element={<SupplierEditPage />} />
          <Route path="/suppliers/:supplierId/rates" element={<SupplierRatesPage />} />
          <Route path="/slips" element={<SlipsPage />} />
          <Route path="/slips/new" element={<SlipEditPage />} />
          <Route path="/slips/:slipId" element={<SlipDetailPage />} />
          <Route path="/slips/:slipId/edit" element={<SlipEditPage />} />
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/deliveries/new" element={<DeliveryNewPage />} />
          <Route path="/deliveries/:deliveryId" element={<DeliveryDetailPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/parties" element={<PartiesHubPage />} />
          <Route path="/bills/new" element={<BillEditPage />} />
          <Route path="/bills/:billId" element={<BillDetailPage />} />
          <Route path="/bills/:billId/edit" element={<BillEditPage />} />
          <Route path="/payments/new" element={<PaymentNewPage />} />
          <Route path="/payments/:paymentId" element={<PaymentDetailPage />} />
          <Route path="/refunds/:refundId" element={<RefundDetailPage />} />
          <Route path="/receipts/new" element={<ClientReceiptNewPage />} />
          <Route path="/receipts/:receiptId" element={<ClientReceiptDetailPage />} />
          <Route path="/subcontractors" element={<PartiesPage key="subcontractor" kind="subcontractor" />} />
          <Route path="/subcontractors/:partyId" element={<PartyDetailPage key="subcontractor" kind="subcontractor" />} />
          <Route path="/subcontractors/:partyId/details" element={<PartyInfoPage key="subcontractor" kind="subcontractor" />} />
          <Route path="/subcontractors/:partyId/edit" element={<PartyEditPage key="subcontractor" kind="subcontractor" />} />
          <Route path="/crews" element={<PartiesPage key="crew" kind="crew" />} />
          <Route path="/crews/:partyId" element={<PartyDetailPage key="crew" kind="crew" />} />
          <Route path="/crews/:partyId/details" element={<PartyInfoPage key="crew" kind="crew" />} />
          <Route path="/crews/:partyId/edit" element={<PartyEditPage key="crew" kind="crew" />} />
          <Route path="/workers" element={<PartiesPage key="worker" kind="worker" />} />
          <Route path="/workers/:partyId" element={<PartyDetailPage key="worker" kind="worker" />} />
          <Route path="/workers/:partyId/details" element={<PartyInfoPage key="worker" kind="worker" />} />
          <Route path="/workers/:partyId/edit" element={<PartyEditPage key="worker" kind="worker" />} />
          <Route path="/payees" element={<PartiesPage key="payee" kind="payee" />} />
          <Route path="/payees/:partyId" element={<PartyDetailPage key="payee" kind="payee" />} />
          <Route path="/payees/:partyId/details" element={<PartyInfoPage key="payee" kind="payee" />} />
          <Route path="/payees/:partyId/edit" element={<PartyEditPage key="payee" kind="payee" />} />
          <Route path="/work/new" element={<WorkPackageEditPage />} />
          <Route path="/work/:packageId" element={<WorkPackageDetailPage />} />
          <Route path="/work/:packageId/edit" element={<WorkPackageEditPage />} />
          <Route path="/labour/new" element={<LabourNewPage />} />
          <Route path="/labour/attendance" element={<CrewRedirect />} />
          <Route path="/labour/crew" element={<CrewRedirect />} />
          <Route path="/labour/worker/:id" element={<TimeCardRedirect />} />
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
      </PageBoundary>
    </BrowserRouter>
  )
}
