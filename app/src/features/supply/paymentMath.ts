// The payment form's arithmetic (PaymentNewPage), kept apart from the screen so it is tested on
// its own (paymentMath.test.ts). All amounts are paisa; typed amounts are the form's text.
import type { IsoDate } from '../../lib/dates'
import { paisaToInput, parseNPR } from '../../lib/money'

/** What is owed to a party: these kinds can be ticked and paid. */
export const OWED = new Set(['bill', 'charge', 'labour', 'expense'])

export type OpenItem = { kind: string; doc_id: string | null; project_id: string | null; amount_paisa: number; doc_date?: string | null }

/** A document on one project: "docId:projectId", the key of `settle`. */
export const docKey = (d: Pick<OpenItem, 'doc_id' | 'project_id'>) => `${d.doc_id}:${d.project_id}`

/** The documents this payment can tick. A package payment can only clear that package's charges. */
export function payableDocs<T extends OpenItem>(items: T[] | undefined, packageId: string, pkgChargeIds: Set<string | undefined>): T[] {
  return items?.filter((i) => OWED.has(i.kind) && (!packageId || pkgChargeIds.has(i.doc_id!))) ?? []
}

/** Anything at all unpaid to the party (any package or project); unknown yet counts as unpaid. Peski only when not. */
export function hasUnpaid(items: OpenItem[] | undefined): boolean {
  return items?.some((i) => OWED.has(i.kind)) ?? true
}

/** Ticked amounts that count: on a document shown now, and more than zero. */
export function tickedEntries(settle: Record<string, string>, shown: Set<string>): Array<[string, string]> {
  return Object.entries(settle).filter(([k, a]) => shown.has(k) && (parseNPR(a) ?? 0) > 0)
}

/** Documents not ticked, oldest first: where money beyond the ticked ones goes before it is overpaid. */
export function untickedOldestFirst<T extends OpenItem>(openDocs: T[], settle: Record<string, string>): T[] {
  return openDocs.filter((d) => !(docKey(d) in settle)).sort((a, b) => (a.doc_date ?? '').localeCompare(b.doc_date ?? ''))
}

/** Tick `untickedOpen` in order with `extra` paisa, each up to what it owes. */
export function fillOldestFirst(settle: Record<string, string>, untickedOpen: OpenItem[], extra: number): Record<string, string> {
  const next = { ...settle }
  let left = extra
  for (const d of untickedOpen) {
    if (left <= 0) break
    const take = Math.min(left, d.amount_paisa)
    next[docKey(d)] = paisaToInput(take)
    left -= take
  }
  return next
}

/** The project split the server gets: from the package, the typed rows, or the ticked documents plus the extra. */
export function projectSplit(a: {
  amount: number
  packageId: string
  pkgProject: string
  billsMode: boolean
  allocations: Array<{ project_id: string; amount: string }>
  ticked: Array<[string, string]>
  tickedSum: number
  extraProject: string
}): Array<{ project_id: string; amount_paisa: number }> {
  if (a.packageId) return a.pkgProject ? [{ project_id: a.pkgProject, amount_paisa: a.amount }] : []
  if (!a.billsMode) return a.allocations.filter((r) => (parseNPR(r.amount) ?? 0) > 0).map((r) => ({ project_id: r.project_id, amount_paisa: parseNPR(r.amount)! }))
  const byProject = new Map<string, number>()
  for (const [k, amt] of a.ticked) byProject.set(k.split(':')[1], (byProject.get(k.split(':')[1]) ?? 0) + (parseNPR(amt) ?? 0))
  if (a.amount > a.tickedSum && a.extraProject) byProject.set(a.extraProject, (byProject.get(a.extraProject) ?? 0) + a.amount - a.tickedSum)
  return [...byProject].map(([project_id, amount_paisa]) => ({ project_id, amount_paisa }))
}

/** One of a worker's verified days not yet paid. */
export type DayRow = { key: string; project_id: string; date: IsoDate; amount: number; doc_id: string }

/** A worker's ticked days, less the advance they hold (it comes off first). */
export function workerDays(dayRows: DayRow[], ticked: string[] | null, advance: number) {
  const tickedTotal = dayRows.filter((r) => ticked?.includes(r.key)).reduce((s, r) => s + r.amount, 0)
  const less = Math.min(advance, tickedTotal)
  return { tickedTotal, less, due: tickedTotal - less, allDays: dayRows.reduce((s, r) => s + r.amount, 0) }
}

/**
 * A subcontractor: what they hold pays first, the cash the rest. `subMode`: ticked approved work;
 * `direct`: paid directly for the work done (the amount). A direct payment already sent keeps the
 * cash it was sent with (`cashSent`), so a retry matches its op key.
 */
export function heldAndCash(a: { subMode: boolean; direct: boolean; usable: number; tickedOwed: number; amountPaisa: number | null; cashSent: number | null }) {
  const heldLess = a.subMode ? Math.min(a.usable, a.tickedOwed) : a.direct ? Math.min(a.usable, a.amountPaisa ?? 0) : 0
  const cashDue = a.subMode ? a.tickedOwed - heldLess : a.direct ? (a.amountPaisa ?? 0) - heldLess : 0
  const directCash = a.direct ? a.cashSent ?? cashDue : 0
  const directHeld = a.direct && a.cashSent != null ? Math.max(0, (a.amountPaisa ?? 0) - a.cashSent) : heldLess
  return { heldLess, cashDue, directCash, directHeld }
}
