// The bill form's values, arithmetic and payload (BillEditPage), kept apart from the screen so it
// is tested on its own (billForm.test.ts). Typed amounts are the form's text; sums are paisa.
import type { PendingPhoto } from '../../components/Attachments'
import { lineAmount, paisaToInput, parseNPR } from '../../lib/money'

type Match = { delivery_line_id: string; billed_qty: string }
export type BillLine = {
  id: string
  line_type: 'material' | 'charge'
  project_id: string
  heading_id: string
  material_id: string
  description: string
  qty: string
  unit_id: string
  unit_note: string
  rate: string
  amount: string
  amount_edited: boolean
  unmatched_reason: string
  rate_variance_reason: string
  matches: Match[]
}
type Override = { charge: 'discount' | 'transport' | 'vat'; project_id: string; amount: string }
export type BillValues = {
  id: string
  supplier_id: string
  project_id: string // the bill's one project, used by every line; '' on an older bill with several
  bill_no: string
  bill_date: string
  cost_date: string
  due_date: string
  notes: string
  discount: string
  transport: string
  vat: string
  vat_rate: string
  split_charges: boolean
  overrides: Override[]
  lines: BillLine[]
  paper_total: string
  photos: PendingPhoto[] // taken before the first save
  post_key: string // operation key for "Save and post", kept until it succeeds
  submit_key?: string // operation key for "Send to Accounts", kept until it succeeds
  saved?: boolean // a new bill already saved once: its photos are on the bill now, not in `photos`
}

/** Amount follows qty × rate until the user types an amount from the paper bill: the new amount, or null to leave it. */
export function autoLineAmount(l: Pick<BillLine, 'rate' | 'qty' | 'amount_edited'>): string | null {
  const rate = parseNPR(l.rate)
  const amount = rate === null ? null : lineAmount(rate, l.qty)
  return !l.amount_edited && amount !== null && Number(l.qty) > 0 ? paisaToInput(amount) : null
}

/** Lines, less discount, plus transport and VAT. A blank or invalid amount counts as zero. */
export function billTotals(v: Pick<BillValues, 'lines' | 'discount' | 'transport' | 'vat'>) {
  const subtotal = v.lines.reduce((s, l) => s + (parseNPR(l.amount) ?? 0), 0)
  const total = subtotal - (parseNPR(v.discount) ?? 0) + (parseNPR(v.transport) ?? 0) + (parseNPR(v.vat) ?? 0)
  return { subtotal, total }
}

/** "Work out VAT": the rate (13% unless set) on the lines less discount plus transport, as form text. */
export function vatOn(subtotal: number, discount: string, transport: string, vatRate: string): string {
  const base = subtotal - (parseNPR(discount) ?? 0) + (parseNPR(transport) ?? 0)
  return paisaToInput(Math.round((base * Number(vatRate || 13)) / 100))
}

/** The quantity of a line matched to deliveries. */
export const matchedQty = (matches: Match[]) => matches.reduce((s, m) => s + Number(m.billed_qty || 0), 0)

type Unbilled = { id: string | null; delivery_id: string | null; project_id: string | null; billable_qty: number | null }
type DeliveryDetail = { material_id: string | null; unit_id: string | null; unit_note: string | null }

/**
 * The supplier's unbilled deliveries as lines, so only rates are added (req §21). Only the bill's
 * project: the first delivery added chooses it when none is chosen yet. Lines already on the bill
 * and deliveries without a material are left out.
 */
export function linesFromDeliveries(a: {
  lines: BillLine[]
  project: string
  onlyDelivery?: string
  unbilled: Unbilled[] | undefined
  deliveries: Map<string | null, DeliveryDetail> | undefined
  materials: Array<{ id: string; default_heading_id: string | null }> | undefined
  newId: () => string
}): { lines: BillLine[]; project: string } {
  const taken = new Set(a.lines.flatMap((l) => l.matches.map((m) => m.delivery_line_id)))
  let project = a.project || (a.onlyDelivery ? a.unbilled?.find((u) => u.delivery_id === a.onlyDelivery)?.project_id : '') || ''
  const added: BillLine[] = []
  for (const u of a.unbilled ?? []) {
    if (taken.has(u.id!) || (a.onlyDelivery && u.delivery_id !== a.onlyDelivery)) continue
    if (!project) project = u.project_id!
    if (u.project_id !== project) continue
    const dl = a.deliveries?.get(u.id!)
    if (!dl || !dl.material_id) continue
    const m = a.materials?.find((x) => x.id === dl.material_id)
    added.push({
      id: a.newId(), line_type: 'material', project_id: project, heading_id: m?.default_heading_id ?? '',
      material_id: dl.material_id, description: '', qty: String(u.billable_qty), unit_id: dl.unit_id!, unit_note: dl.unit_note ?? '',
      rate: '', amount: '', amount_edited: false, unmatched_reason: '', rate_variance_reason: '',
      matches: [{ delivery_line_id: u.id!, billed_qty: String(u.billable_qty) }],
    })
  }
  return { lines: added, project }
}

/** What save_bill_draft gets: paisa, the bill's project on every line, blanks as null. */
export function toPayload(v: BillValues) {
  const lines = v.lines.map((l) => ({
    id: l.id, line_type: l.line_type, project_id: v.project_id || l.project_id, heading_id: l.heading_id || null,
    material_id: l.line_type === 'material' && l.material_id ? l.material_id : null,
    description: l.description || null, qty: l.line_type === 'material' ? Number(l.qty) : null,
    unit_id: l.line_type === 'material' ? l.unit_id || null : null, unit_note: l.unit_note || null,
    rate_paisa: l.rate ? parseNPR(l.rate) : null, amount_paisa: parseNPR(l.amount),
    unmatched_reason: l.unmatched_reason || null, rate_variance_reason: l.rate_variance_reason || null,
    matches: l.matches.filter((m) => Number(m.billed_qty) > 0).map((m) => ({ delivery_line_id: m.delivery_line_id, billed_qty: Number(m.billed_qty) })),
  }))
  return {
    id: v.id, supplier_id: v.supplier_id, bill_no: v.bill_no.trim() || null, bill_date: v.bill_date, cost_date: v.cost_date || v.bill_date,
    paper_total_paisa: parseNPR(v.paper_total),
    due_date: v.due_date || null, notes: v.notes || null,
    discount_paisa: parseNPR(v.discount) ?? 0, transport_paisa: parseNPR(v.transport) ?? 0, vat_paisa: parseNPR(v.vat) ?? 0,
    vat_rate_pct: Number(v.vat_rate) || 13, lines,
    overrides: v.split_charges ? v.overrides.map((o) => ({ charge: o.charge, project_id: o.project_id, amount_paisa: parseNPR(o.amount) ?? 0 })) : [],
  }
}
