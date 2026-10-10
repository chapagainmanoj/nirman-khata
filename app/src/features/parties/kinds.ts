// The four kinds of party money is owed to (req §12.3: "the same rules apply to subcontractor
// and labour payments"). Each has its own table; payments, ledger rows and khata are shared.
export type PartyKind = 'supplier' | 'subcontractor' | 'crew' | 'payee'

export const PARTY: Record<PartyKind, {
  one: string
  many: string
  path: string
  column: 'supplier_id' | 'subcontractor_id' | 'crew_id' | 'payee_id'
  table: 'suppliers' | 'subcontractors' | 'crews' | 'payees'
  /** What raises the balance, for the khata legend. */
  charges: string
}> = {
  supplier: { one: 'Supplier', many: 'Suppliers', path: '/suppliers', column: 'supplier_id', table: 'suppliers', charges: 'bills' },
  subcontractor: {
    one: 'Subcontractor', many: 'Subcontractors', path: '/subcontractors', column: 'subcontractor_id', table: 'subcontractors',
    charges: 'approved work charges',
  },
  crew: { one: 'Crew', many: 'Labour crews', path: '/crews', column: 'crew_id', table: 'crews', charges: 'labour costs' },
  payee: { one: 'Payee', many: 'Payees', path: '/payees', column: 'payee_id', table: 'payees', charges: 'expenses' },
}

export const PARTY_KINDS = Object.keys(PARTY) as PartyKind[]

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

export const DOC_WORD: Record<string, string> = {
  bill: 'Bill',
  charge: 'Work charge',
  labour: 'Labour',
  expense: 'Expense',
  refund: 'Refund',
}
