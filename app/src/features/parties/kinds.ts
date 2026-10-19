// The kinds of party money is owed to (req §12.3: "the same rules apply to subcontractor and
// labour payments"). Each has its own table; payments, ledger rows and khata are shared. A worker
// is owed for their days when the company works by attendance (GLOSSARY: Worker).
import { t, translated } from '../../lib/i18n'

export type PartyKind = 'supplier' | 'subcontractor' | 'crew' | 'payee' | 'worker'

type PartyInfo = {
  one: string
  many: string
  path: string
  column: 'supplier_id' | 'subcontractor_id' | 'crew_id' | 'payee_id' | 'worker_id'
  table: 'suppliers' | 'subcontractors' | 'crews' | 'payees' | 'workers'
  /** What raises the balance, for the khata legend. */
  charges: string
}

/** The words come from t() each time they are read (lib/i18n translated). */
function party(kind: PartyKind, where: Pick<PartyInfo, 'path' | 'column' | 'table'>): PartyInfo {
  return {
    ...where,
    get one() { return t(`party.${kind}.one`) },
    get many() { return t(`party.${kind}.many`) },
    get charges() { return t(`party.${kind}.charges`) },
  }
}

export const PARTY: Record<PartyKind, PartyInfo> = {
  supplier: party('supplier', { path: '/suppliers', column: 'supplier_id', table: 'suppliers' }),
  subcontractor: party('subcontractor', { path: '/subcontractors', column: 'subcontractor_id', table: 'subcontractors' }),
  crew: party('crew', { path: '/crews', column: 'crew_id', table: 'crews' }),
  // "Payee" in code and SQL; people see "Other service" (GLOSSARY: Payee).
  payee: party('payee', { path: '/payees', column: 'payee_id', table: 'payees' }),
  worker: party('worker', { path: '/workers', column: 'worker_id', table: 'workers' }),
}

export const PARTY_KINDS = Object.keys(PARTY) as PartyKind[]

/** Where a kind's pages sit: other services are reached from Suppliers, not the nav. */
export function partyCrumbs(kind: PartyKind): Array<{ to: string; label: string }> {
  return kind === 'payee'
    ? [{ to: '/suppliers', label: PARTY.supplier.many }, { to: PARTY.payee.path, label: PARTY.payee.many }]
    : [{ to: '/parties', label: t('party.parties') }, { to: PARTY[kind].path, label: PARTY[kind].many }]
}

/** The party named in a URL like /payments/new?crew=<id>. */
export function partyFromParams(params: URLSearchParams): { kind: PartyKind; id: string } {
  for (const kind of PARTY_KINDS) {
    const id = params.get(kind)
    if (id) return { kind, id }
  }
  return { kind: 'supplier', id: '' }
}

/** Where a settled or owed document opens. Labour and expenses live on their project page. */
export function docPath(kind: string | null, id: string | null, extra?: { projectId?: string | null; packageId?: string | null }) {
  if (!kind || !id) return null
  if (kind === 'bill') return `/bills/${id}`
  if (kind === 'payment') return `/payments/${id}`
  if (kind === 'refund') return `/refunds/${id}`
  if (kind === 'charge') return extra?.packageId ? `/work/${extra.packageId}` : null
  if ((kind === 'labour' || kind === 'expense') && extra?.projectId) return `/projects/${extra.projectId}`
  return null
}

export const DOC_WORD: Record<string, string> = translated({
  bill: 'doc.bill',
  charge: 'doc.charge',
  labour: 'doc.labour',
  expense: 'doc.expense',
  refund: 'doc.refund',
})
