// Data for the supplier loop: suppliers, slips, deliveries, bills, payments, khata.
// Reads go through RLS, so each list already contains only what the user may see.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import type { Database, Json } from '../../lib/database.types'
import { newId } from '../../lib/ids'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'

type Fns = Database['public']['Functions']

/** Call an RPC and throw its error, so react-query sees failures. */
export async function rpc<N extends keyof Fns>(name: N, args: Fns[N]['Args']): Promise<Fns[N]['Returns']> {
  const { data, error } = await supabase.rpc(name, args as never)
  if (error) throw error
  return data as Fns[N]['Returns']
}

/**
 * A posting call with an operation key (design §5.1). The key is kept until the server
 * answers with success, so a retry after a lost response returns the first result
 * instead of posting twice.
 */
export function usePosting<A = void, R = unknown>(fn: (opKey: string, args: A) => Promise<R>, opts: { onSuccess?: (r: R) => unknown; initialKey?: string } = {}) {
  const key = useRef(opts.initialKey ?? newId())
  return useMutation({
    mutationFn: (args: A) => fn(key.current, args),
    onSuccess: async (r) => {
      key.current = newId()
      await opts.onSuccess?.(r)
    },
  })
}

/**
 * Save a draft before submitting it, unless an earlier submit with `submitKey` already went
 * through and only its answer was lost. `cameBack` says whether the record has been sent back to
 * its sender since (a rejected slip), which makes this a new send. Returns the key to submit with.
 */
export async function saveUnlessSent(
  submitKey: string,
  save: () => Promise<unknown>,
  cameBack?: () => Promise<boolean>,
): Promise<{ alreadySent: boolean; key: string }> {
  // Asked before saving: a save would turn a slip rejected since then back into a draft, and the
  // used key would then "send" it without sending (second review, Codex finding 1).
  if (await rpc('finished_submit', { p_op_key: submitKey })) {
    if (!cameBack || !(await cameBack())) return { alreadySent: true, key: submitKey }
    // Sent, then sent back (a rejected slip): this is a new send, under a new key.
    submitKey = newId()
  }
  await save()
  return { alreadySent: false, key: submitKey }
}

/** Refresh everything that a money posting can change. */
export function useRefreshMoney() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['bills', 'bill', 'payments', 'nav-count', 'payment', 'khata', 'balances', 'open-items', 'project-cost', 'delivery-lines', 'bill-preview',
        'labour', 'expenses', 'charges', 'package-figures', 'opening-balance', 'payees', 'project-dashboard', 'dashboard', 'report',
        'calendar']
        .map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    )
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export function useSuppliers(companyId: string) {
  return useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// Slips
// ---------------------------------------------------------------------------
export type SlipTab = 'open' | 'pending' | 'draft' | 'all'
type SlipFilter = { companyId: string; projectId?: string | null; supplierId?: string; tab?: SlipTab }

function slipQuery<Q extends { eq: Function; in: Function; contains: Function }>(q: Q, f: SlipFilter): Q {
  q = q.eq('company_id', f.companyId)
  if (f.projectId) q = q.contains('project_ids', [f.projectId])
  if (f.supplierId) q = q.eq('supplier_id', f.supplierId)
  if (f.tab === 'open') q = q.eq('status', 'approved').in('fulfilment', ['not_received', 'partially_received'])
  if (f.tab === 'pending') q = q.eq('status', 'pending')
  if (f.tab === 'draft') q = q.in('status', ['draft', 'rejected'])
  return q
}

const SLIP_COLUMNS = 'id, number, status, supplier_id, request_date, required_date, created_by, sent_at, fulfilment, project_ids, suppliers(name)'

function slipRow<T extends { id: string | null; number: string | null; status: string | null; fulfilment: string | null; project_ids: string[] | null; request_date: string | null }>(s: T) {
  return {
    ...s, id: s.id!, number: s.number!, status: s.status! as Database['public']['Enums']['slip_status'],
    fulfilment: s.fulfilment ?? 'not_received', project_ids: s.project_ids ?? [], request_date: s.request_date!,
  }
}

/** Slips newest first, 50 at a time; the tab and project are filtered on the server. */
export function useSlips(f: SlipFilter) {
  return usePaged(['slips', f], async (from, to) => {
    const { data, error } = await slipQuery(supabase.from('slip_summaries').select(SLIP_COLUMNS), f)
      .order('created_at', { ascending: false }).order('id').range(from, to)
    if (error) throw error
    return data.map(slipRow)
  })
}

export function useSlipCount(f: SlipFilter) {
  return useQuery({
    queryKey: ['slips', 'count', f],
    queryFn: async () => {
      const { count, error } = await slipQuery(supabase.from('slip_summaries').select('id', { count: 'exact', head: true }), f)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Approved slips still waiting for material (a short list by nature, so not paged). */
export function useOpenSlips(f: Omit<SlipFilter, 'tab'>) {
  return useQuery({
    queryKey: ['slips', 'open', f],
    queryFn: async () => {
      const { data, error } = await slipQuery(supabase.from('slip_summaries').select(SLIP_COLUMNS), { ...f, tab: 'open' })
        .order('created_at', { ascending: false }).order('id')
      if (error) throw error
      return data.map(slipRow)
    },
  })
}

export function useSlip(slipId: string) {
  return useQuery({
    queryKey: ['slip', slipId],
    enabled: !!slipId,
    queryFn: async () => {
      const [slip, lines, prices, progress, perms] = await Promise.all([
        supabase.from('order_slips').select('*, suppliers(name, phone)').eq('id', slipId).maybeSingle(),
        supabase.from('order_slip_lines').select('*, materials(name, local_name), units(code, name)').eq('slip_id', slipId).order('sort_order'),
        supabase.from('order_slip_line_prices').select('id, est_rate_paisa, order_slip_lines!inner(slip_id)').eq('order_slip_lines.slip_id', slipId),
        supabase.from('order_slip_line_progress').select('*').eq('slip_id', slipId),
        supabase.rpc('slip_permissions', { p_slip: slipId }),
      ])
      for (const r of [slip, lines, prices, progress, perms]) if (r.error) throw r.error
      if (!slip.data) return null
      const price = new Map(prices.data!.map((p) => [p.id, p.est_rate_paisa]))
      const prog = new Map(progress.data!.map((p) => [p.id, p]))
      return {
        slip: slip.data,
        lines: lines.data!.map((l) => ({ ...l, est_rate_paisa: price.get(l.id) ?? null, progress: prog.get(l.id) })),
        perms: perms.data as SlipPermissions | null,
      }
    },
  })
}

export type SlipPermissions = {
  can_edit: boolean
  can_submit: boolean
  can_delete: boolean
  can_approve: boolean
  can_share: boolean
  can_cancel: boolean
  can_close_short: boolean
  can_record_delivery: boolean
  fulfilment: string
}

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------
export function useDeliveries(filter: { projectId?: string; slipId?: string; supplierId?: string }) {
  return usePaged(['deliveries', filter], async (from, to) => {
    let q = supabase.from('deliveries')
      .select('*, suppliers(name), projects(code, name), delivery_lines(*, materials(name), units(code))')
    if (filter.projectId) q = q.eq('project_id', filter.projectId)
    if (filter.slipId) q = q.eq('slip_id', filter.slipId)
    if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)
    const { data, error } = await q.order('receipt_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)
    if (error) throw error
    return data
  })
}

/** Delivery lines with derived quantities (billable, returned, awaiting credit). */
export function useDeliveryLineStatus(filter: { supplierId?: string; projectId?: string; billableOnly?: boolean }, enabled = true) {
  return useQuery({
    queryKey: ['delivery-lines', filter],
    enabled,
    queryFn: async () => {
      let q = supabase.from('delivery_line_status').select('*')
      if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)
      if (filter.projectId) q = q.eq('project_id', filter.projectId)
      if (filter.billableOnly) q = q.gt('billable_qty', 0)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// Bills and payments
// ---------------------------------------------------------------------------
type BillStatus = Database['public']['Enums']['bill_status']

type BillFilter = { supplierId?: string; companyId?: string; projectId?: string; statuses?: readonly BillStatus[] }

function billQuery<Q extends { eq: Function; contains: Function; in: Function }>(q: Q, filter: BillFilter): Q {
  if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)
  if (filter.companyId) q = q.eq('company_id', filter.companyId)
  if (filter.projectId) q = q.contains('project_ids', [filter.projectId])
  if (filter.statuses) q = q.in('status', filter.statuses)
  return q
}

/** Bills newest first, 50 at a time; status and project are filtered on the server. */
export function useBills(filter: BillFilter) {
  return usePaged(['bills', filter], async (from, to) => {
    const q = billQuery(supabase.from('bill_summaries').select('*, suppliers(name)'), filter)
      .order('bill_date', { ascending: false }).order('id').range(from, to)
    const { data, error } = await q
    if (error) throw error
    // View columns are typed nullable; these are always set for a bill row.
    return data.map((b) => ({
      ...b, id: b.id!, bill_date: b.bill_date!, status: b.status!,
      lines_paisa: b.lines_paisa ?? 0, payable_paisa: b.payable_paisa ?? 0,
      credited_paisa: b.credited_paisa ?? 0, settled_paisa: b.settled_paisa ?? 0,
    }))
  })
}

/** How many bills match, without loading them (tab counts). */
export function useBillCount(filter: BillFilter, enabled = true) {
  return useQuery({
    queryKey: ['bills', 'count', filter],
    enabled,
    queryFn: async () => {
      const { count, error } = await billQuery(supabase.from('bill_summaries').select('id', { count: 'exact', head: true }), filter)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Still owed on posted bills (net of credits and payments matched to them). */
export function useBillsOwed(companyId: string, filter: { projectId?: string; supplierId?: string }, enabled = true) {
  return useQuery({
    queryKey: ['bills', 'owed', companyId, filter],
    enabled,
    queryFn: () => rpc('bills_owed', { p_company: companyId, p_project: filter.projectId, p_supplier: filter.supplierId }),
  })
}

export function useBill(billId: string, enabled = true) {
  return useQuery({
    queryKey: ['bill', billId],
    enabled,
    queryFn: async () => {
      const [bill, charges, lines, overrides, matches] = await Promise.all([
        supabase.from('supplier_bills').select('*, suppliers(name)').eq('id', billId).maybeSingle(),
        supabase.from('supplier_bill_charges').select('*').eq('id', billId).maybeSingle(),
        supabase.from('bill_lines').select('*, materials(name), units(code)').eq('bill_id', billId).order('sort_order'),
        supabase.from('bill_charge_overrides').select('*').eq('bill_id', billId),
        supabase.from('bill_line_delivery_lines').select('*, bill_lines!inner(bill_id)').eq('bill_lines.bill_id', billId),
      ])
      for (const r of [bill, charges, lines, overrides, matches]) if (r.error) throw r.error
      return { bill: bill.data, charges: charges.data, lines: lines.data!, overrides: overrides.data!, matches: matches.data! }
    },
  })
}

export type BillPreview = {
  lines: Array<{ line_id: string; discount_share: number; transport_share: number; vat_share: number; payable: number; cost: number }>
  allocation_error: string | null
  checks: Array<{ line_id: string | null; code: string; severity: 'error' | 'reason' | 'warning'; message: string }>
  total_paisa: number | null
  cost_paisa: number | null
}

export function useBillPreview(billId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['bill-preview', billId],
    enabled,
    queryFn: async () => (await rpc('bill_preview', { p_bill: billId })) as unknown as BillPreview,
  })
}

export function useBillProjectStatus(billId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['bill', billId, 'status'],
    enabled,
    queryFn: () => rpc('bill_project_status', { p_bill: billId }),
  })
}

export function useCredits(billId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['bill', billId, 'credits'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('credits').select('*, credit_lines(*)').eq('bill_id', billId).order('credit_date')
      if (error) throw error
      return data
    },
  })
}

export function usePayment(paymentId: string) {
  return useQuery({
    queryKey: ['payment', paymentId],
    queryFn: async () => {
      const [payment, allocations, settlements] = await Promise.all([
        supabase.from('payment_summaries')
          .select('*, suppliers(name), subcontractors(name), crews(name), payees(name), work_packages(scope)').eq('id', paymentId).maybeSingle(),
        supabase.from('payment_allocation_events').select('*').eq('payment_id', paymentId).order('posted_at'),
        supabase.from('settlement_events')
          .select('*, supplier_bills(bill_no), subcontract_charges(claim_no, work_package_id), labour_costs(work_type), expenses(description)')
          .eq('payment_id', paymentId).order('posted_at'),
      ])
      for (const r of [payment, allocations, settlements]) if (r.error) throw r.error
      return { payment: payment.data && paymentRow(payment.data), allocations: allocations.data!, settlements: settlements.data! }
    },
  })
}

type PaymentSummary = Database['public']['Views']['payment_summaries']['Row']

/** View columns are typed nullable; these are always set for a payment row. */
function paymentRow<T extends PaymentSummary>(p: T) {
  return {
    ...p, id: p.id!, number: p.number!, party_id: p.party_id!, payment_date: p.payment_date!, status: p.status!,
    method: p.method!, amount_paisa: p.amount_paisa ?? 0, allocated_paisa: p.allocated_paisa ?? 0, settled_paisa: p.settled_paisa ?? 0,
  }
}

export type ProjectCost = {
  as_of: string
  view: 'current' | 'as_known'
  cost_paisa: number
  cash_paid_paisa: number
  payable_paisa: number
  payable_by_kind: { supplier: number; subcontractor: number; crew: number; payee: number }
  by_heading: Array<{ heading_id: string; cost_paisa: number }>
  unbilled_delivery_lines: number
}

export function useProjectCost(projectId: string, asOf: string, enabled: boolean) {
  return useQuery({
    queryKey: ['project-cost', projectId, asOf],
    enabled,
    queryFn: async () => (await rpc('project_cost_summary', { p_project: projectId, p_as_of: asOf })) as unknown as ProjectCost,
  })
}

export type JsonObject = { [key: string]: Json | undefined }
