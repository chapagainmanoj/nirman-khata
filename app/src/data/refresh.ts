// What to fetch again after a change. Each query family (the first element of its query key) says
// which kinds of data it shows; a change names what it changed; every family showing any of it is
// refreshed. Adding a query means adding one line to SHOWS (refresh.test.ts fails until you do);
// a new mutation only names what it changes. When unsure, list more: an extra refetch is cheap,
// a stale amount on screen is not.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'

/** The kinds of data a change can touch. */
export type Data =
  | 'slips' // order slips and their lines
  | 'deliveries' // deliveries and received quantities
  | 'bills' // supplier bills, bill lines, returns (also what is billed of a delivery)
  | 'ledger' // any money posting: payments, credits, settlements, refunds, openings, charges, labour, expenses
  | 'labour' // labour cost entries
  | 'expenses' // other expenses
  | 'attendance' // attendance days and crew membership
  | 'work' // work packages and subcontractor claims
  | 'parties' // supplier, subcontractor, crew, payee and worker records
  | 'site' // daily reports, progress, stages
  | 'clientMoney' // client receipts
  | 'projects' // projects, assignments, members
  | 'budget' // contract and budget revisions, cost headings
  | 'catalog' // materials, units, headings
  | 'attachments'
  | 'notifications'
  | 'company' // the signed-in person's profile, membership and company
  | 'platform'

const MONEY: Data[] = ['ledger', 'bills', 'labour', 'expenses', 'work', 'attendance', 'clientMoney', 'budget']
const EVERYTHING: Data[] = [...MONEY, 'slips', 'deliveries', 'site', 'projects', 'parties']

/** What each query family shows. Keys are the first element of the query key. */
export const SHOWS = {
  // Supplier loop
  slips: ['slips', 'deliveries'],
  slip: ['slips', 'deliveries', 'bills'],
  'recent-materials': ['slips', 'catalog'],
  deliveries: ['deliveries', 'bills'],
  'delivery-lines': ['deliveries', 'bills', 'slips'],
  bills: ['bills', 'ledger'],
  bill: ['bills', 'ledger', 'deliveries'],
  'bill-preview': ['bills', 'deliveries', 'slips'],
  'supplier-projects': ['slips', 'deliveries', 'bills'],
  'supplier-rates': ['bills', 'parties'],
  'nav-count': ['slips', 'bills'],
  // Money
  payments: ['ledger'],
  payment: ['ledger'],
  khata: ['ledger', 'bills', 'labour', 'expenses', 'work'],
  balances: ['ledger', 'bills', 'labour', 'expenses', 'work', 'attendance', 'parties'],
  'open-items': ['ledger', 'bills', 'labour', 'expenses', 'work'],
  'opening-balance': ['ledger'],
  'project-cost': ['ledger', 'bills', 'labour', 'expenses', 'work', 'site', 'deliveries'],
  labour: ['labour', 'ledger', 'site'],
  expenses: ['expenses', 'ledger'],
  charges: ['work', 'ledger'],
  'package-figures': ['work', 'ledger'],
  'client-receipts': ['clientMoney'],
  'client-receipt': ['clientMoney'],
  'client-received': ['clientMoney'],
  // Parties and labour
  suppliers: ['parties'],
  subcontractors: ['parties'],
  crews: ['parties'],
  payees: ['parties', 'labour', 'ledger'],
  workers: ['parties', 'attendance'],
  attendance: ['attendance', 'ledger', 'labour', 'parties'],
  'work-packages': ['work'],
  'work-package': ['work'],
  // Site
  'daily-reports': ['site'],
  'daily-report': ['site'],
  progress: ['site'],
  stages: ['site'],
  'report-day': ['site', 'deliveries', 'slips', 'labour', 'attendance'],
  // Projects and budget
  projects: ['projects'],
  project: ['projects'],
  assignments: ['projects'],
  members: ['projects'],
  amounts: ['budget'],
  revisions: ['budget'],
  headings: ['catalog', 'budget'],
  // Across everything
  calendar: EVERYTHING,
  dashboard: EVERYTHING,
  'project-dashboard': EVERYTHING,
  report: EVERYTHING,
  'getting-started': ['parties', 'projects', 'ledger'],
  // Catalog, files, people
  materials: ['catalog'],
  units: ['catalog'],
  attachments: ['attachments'],
  'photo-queue': ['attachments'],
  notifications: ['notifications', 'slips', 'deliveries', 'bills', 'ledger'],
  me: ['company'],
  // Platform admin (desktop only)
  'is-platform-admin': ['platform'],
  'platform-usage': ['platform'],
  'platform-usage-count': ['platform'],
  'platform-users': ['platform'],
  'platform-allowlist': ['platform'],
  'platform-approval': ['platform'],
} satisfies Record<string, readonly Data[]>

export type Family = keyof typeof SHOWS

/** The query families to refresh after a change to `changed`. */
export function familiesFor(changed: readonly Data[]): Family[] {
  return (Object.keys(SHOWS) as Family[]).filter((f) => (SHOWS[f] as readonly Data[]).some((d) => changed.includes(d)))
}

export function refresh(queryClient: QueryClient, ...changed: Data[]) {
  return Promise.all(familiesFor(changed).map((f) => queryClient.invalidateQueries({ queryKey: [f] })))
}

/** Like refresh, but nothing refetches now: each is fetched again when next shown. For quick
 *  repeated taps (attendance) where the screen itself is updated by hand. */
export function markStale(queryClient: QueryClient, ...changed: Data[]) {
  return Promise.all(familiesFor(changed).map((f) => queryClient.invalidateQueries({ queryKey: [f], refetchType: 'none' })))
}

/** `refresh('deliveries')` after saving a delivery; name everything the change touched. */
export function useRefresh() {
  const queryClient = useQueryClient()
  return (...changed: Data[]) => refresh(queryClient, ...changed)
}

/** After any money posting (payment, bill, credit, refund, labour, expense, charge). */
export function useRefreshMoney() {
  const r = useRefresh()
  return () => r('ledger', 'bills', 'labour', 'expenses', 'work', 'attendance')
}
