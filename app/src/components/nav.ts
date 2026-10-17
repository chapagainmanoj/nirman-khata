// Navigation model: which sections and record actions each person sees (UX review, nav).
// Pure data so it can be tested per role; Layout and MorePage only render it.
// The database re-checks every action; this only decides what to show.
import type { MessageKey } from '../lib/i18n'
import type { AppRole } from '../lib/supabase'

export type NavRole = {
  roles: AppRole[]
  isAdmin: boolean
  seesAllProjects: boolean
  canSeeFinance: boolean
  canRecordPayments: boolean
  canApproveSlips: boolean
  /** Company setting "Track own labour (jyala)". */
  labourEnabled: boolean
  /** Company setting "Labour by": a typed day total, or each worker's attendance. */
  labourByAttendance?: boolean
}

export type NavKey =
  | 'dashboard' | 'projects' | 'calendar' | 'slips' | 'deliveries' | 'reports' | 'bills' | 'payments' | 'parties'
  | 'suppliers' | 'subcontractors' | 'crews' | 'payees' | 'staff' | 'catalog' | 'settings'

export type NavItem = {
  key: NavKey
  to: string
  label: MessageKey
  /** A shorter label for the phone bottom bar, where space is tight. */
  short?: MessageKey
  /** Route prefixes that belong to this section, so detail pages light up their parent. */
  match: string[]
}

/** A group without a label shows no heading (Dashboard, which is the whole company, not site work). */
export type NavGroup = { key: 'dashboard' | 'site' | 'money' | 'parties' | 'setup'; label: MessageKey | null; items: NavItem[] }

const canEnter = (r: NavRole) => r.roles.some((x) => x !== 'viewer')

const ITEMS: Record<NavKey, NavItem> = {
  dashboard: { key: 'dashboard', to: '/dashboard', label: 'nav.dashboard', match: ['/dashboard'] },
  projects: { key: 'projects', to: '/projects', label: 'nav.projects', match: ['/projects', '/labour', '/expenses', '/daily'] },
  calendar: { key: 'calendar', to: '/calendar', label: 'nav.calendar', match: ['/calendar'] },
  slips: { key: 'slips', to: '/slips', label: 'nav.slips', short: 'nav.slips.short', match: ['/slips'] },
  deliveries: { key: 'deliveries', to: '/deliveries', label: 'nav.deliveries', match: ['/deliveries'] },
  reports: { key: 'reports', to: '/reports', label: 'nav.reports', match: ['/reports'] },
  bills: { key: 'bills', to: '/bills', label: 'nav.bills', match: ['/bills'] },
  payments: { key: 'payments', to: '/payments', label: 'nav.payments', match: ['/payments'] },
  // The hub of the four kinds: the tablet strip's single link and the breadcrumbs' first step.
  parties: { key: 'parties', to: '/parties', label: 'nav.parties', match: ['/parties'] },
  suppliers: { key: 'suppliers', to: '/suppliers', label: 'nav.suppliers', match: ['/suppliers'] },
  subcontractors: { key: 'subcontractors', to: '/subcontractors', label: 'nav.subcontractors', match: ['/subcontractors', '/work'] },
  crews: { key: 'crews', to: '/crews', label: 'nav.crews', match: ['/crews'] },
  payees: { key: 'payees', to: '/payees', label: 'nav.payees', match: ['/payees'] },
  staff: { key: 'staff', to: '/staff', label: 'nav.staff', match: ['/staff'] },
  catalog: { key: 'catalog', to: '/catalog', label: 'nav.catalog', match: ['/catalog'] },
  settings: { key: 'settings', to: '/settings', label: 'nav.settings', match: ['/settings'] },
}

/** Sections grouped by job: dashboard, site work, money, parties, setup. Empty groups are dropped. */
export function sectionsFor(r: NavRole): NavGroup[] {
  const show: Record<NavKey, boolean> = {
    // Company figures: cost, cash and what is owed across projects.
    dashboard: r.canSeeFinance,
    projects: true,
    calendar: true,
    slips: true,
    deliveries: true,
    // Rarely a daily stop: finance opens Reports from the Dashboard; those without one keep it here.
    reports: !r.canSeeFinance,
    // Site staff see their own bill drafts; finance sees posted bills.
    bills: r.canSeeFinance || canEnter(r),
    payments: r.canSeeFinance,
    parties: true,
    suppliers: true,
    subcontractors: true,
    crews: r.labourEnabled,
    payees: true,
    staff: r.isAdmin,
    catalog: true,
    settings: true,
  }
  const groups: NavGroup[] = [
    { key: 'dashboard', label: null, items: [ITEMS.dashboard] },
    { key: 'site', label: 'nav.group.site', items: [ITEMS.projects, ITEMS.calendar, ITEMS.slips, ITEMS.deliveries, ITEMS.reports] },
    { key: 'money', label: 'nav.group.money', items: [ITEMS.bills, ITEMS.payments] },
    { key: 'parties', label: 'nav.parties', items: [ITEMS.suppliers, ITEMS.subcontractors, ITEMS.crews, ITEMS.payees] },
    { key: 'setup', label: 'nav.group.setup', items: [ITEMS.staff, ITEMS.catalog, ITEMS.settings] },
  ]
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => show[i.key]) }))
    .filter((g) => g.items.length > 0)
}

/** The section a path belongs to (longest matching prefix), for highlighting. */
export function activeSection(pathname: string): NavKey | null {
  let best: { key: NavKey; len: number } | null = null
  for (const item of Object.values(ITEMS)) {
    for (const prefix of item.match) {
      if ((pathname === prefix || pathname.startsWith(`${prefix}/`)) && (!best || prefix.length > best.len)) {
        best = { key: item.key, len: prefix.length }
      }
    }
  }
  return best?.key ?? null
}

/** The nav entry to light up for a section: Reports lives inside the Dashboard for finance. */
export function navHighlight(active: NavKey | null, r: NavRole): NavKey | null {
  return active === 'reports' && r.canSeeFinance ? 'dashboard' : active
}

const PARTY_KEYS: NavKey[] = ['parties', 'suppliers', 'subcontractors', 'crews', 'payees']
export const isPartySection = (key: NavKey | null) => key !== null && PARTY_KEYS.includes(key)

/** Phone bottom bar: four sections around the centre "+", chosen by what the person does most. */
export function phoneBarFor(r: NavRole): NavKey[] {
  if (r.isAdmin) return ['dashboard', 'projects', 'slips']
  if (r.roles.includes('accounts')) return ['dashboard', 'bills', 'payments']
  return ['projects', 'slips', 'deliveries']
}

export type RecordKey = 'report' | 'delivery' | 'bill' | 'slip' | 'labour' | 'expense' | 'payment' | 'receipt'
export type RecordAction = { key: RecordKey; path: string; label: MessageKey; hint: MessageKey }

const RECORD: Record<RecordKey, RecordAction> = {
  report: { key: 'report', path: '/daily/new', label: 'record.report', hint: 'record.report.hint' },
  delivery: { key: 'delivery', path: '/deliveries/new', label: 'record.delivery', hint: 'record.delivery.hint' },
  bill: { key: 'bill', path: '/bills/new', label: 'record.billPhoto', hint: 'record.billPhoto.hint' },
  slip: { key: 'slip', path: '/slips/new', label: 'record.slip', hint: 'record.slip.hint' },
  labour: { key: 'labour', path: '/labour/new', label: 'record.labour', hint: 'record.labour.hint' },
  expense: { key: 'expense', path: '/expenses/new', label: 'record.expense', hint: 'record.expense.hint' },
  payment: { key: 'payment', path: '/payments/new', label: 'record.payment', hint: 'record.payment.hint' },
  receipt: { key: 'receipt', path: '/receipts/new', label: 'record.receipt', hint: 'record.receipt.hint' },
}

/** "+ Record" actions in the order this person needs them. Viewers get none. */
export function recordActionsFor(r: NavRole): RecordAction[] {
  if (!canEnter(r)) return []
  // Site staff start the day's record with the daily report; the office with bills and payments.
  const order: RecordKey[] = r.seesAllProjects
    ? ['bill', 'payment', 'receipt', 'delivery', 'report', 'slip', 'labour', 'expense']
    : ['report', 'delivery', 'bill', 'slip', 'labour', 'expense', 'payment', 'receipt']
  return order
    .filter((k) => (k !== 'payment' && k !== 'receipt') || r.canRecordPayments)
    .filter((k) => k !== 'labour' || r.labourEnabled)
    .map((k) => {
      const a = RECORD[k]
      // Accounts type the bill; everyone else photographs it and sends it on.
      if (k === 'bill' && r.seesAllProjects) return { ...a, label: 'record.bill', hint: 'record.bill.hint' }
      // With attendance on, labour is marked per worker on the day roster.
      if (k === 'labour' && r.labourByAttendance) return { ...a, path: '/labour/attendance', label: 'record.attendance', hint: 'record.attendance.hint' }
      return a
    })
}

/** Link for a record action; new records start on the current project when one is chosen. */
export function recordHref(action: RecordAction, projectId: string | null): string {
  return projectId ? `${action.path}?project=${projectId}` : action.path
}

export const navItem = (key: NavKey) => ITEMS[key]

/** Where to land after signing in: the company dashboard for people who see money. */
export const homeFor = (r: NavRole) => (r.canSeeFinance ? '/dashboard' : '/projects')
