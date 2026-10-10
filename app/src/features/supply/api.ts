// Data for the supplier loop: suppliers, slips, deliveries, bills, payments, khata.
// Reads go through RLS, so each list already contains only what the user may see.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import type { Database, Json } from '../../lib/database.types'
import { newId } from '../../lib/ids'
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

/** Refresh everything that a money posting can change. */
export function useRefreshMoney() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['bills', 'bill', 'payments', 'nav-count', 'payment', 'khata', 'balances', 'open-items', 'project-cost', 'delivery-lines', 'bill-preview',
        'labour', 'expenses', 'charges', 'package-figures', 'opening-balance', 'payees', 'project-dashboard', 'dashboard', 'report']
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
export function useSlips(companyId: string) {
  return useQuery({
    queryKey: ['slips', companyId],
    queryFn: async () => {
      const [slips, progress] = await Promise.all([
        supabase.from('order_slips')
          .select('id, number, status, supplier_id, request_date, required_date, created_by, sent_at, suppliers(name), order_slip_lines(project_id)')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
        supabase.from('order_slip_progress').select('id, fulfilment').eq('company_id', companyId),
      ])
      if (slips.error) throw slips.error
      if (progress.error) throw progress.error
      const fulfilment = new Map(progress.data.map((p) => [p.id, p.fulfilment]))
      return slips.data.map((s) => ({ ...s, fulfilment: fulfilment.get(s.id) ?? 'not_received' }))
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
  return useQuery({
    queryKey: ['deliveries', filter],
    queryFn: async () => {
      let q = supabase.from('deliveries')
        .select('*, suppliers(name), projects(code, name), delivery_lines(*, materials(name), units(code))')
        .order('receipt_date', { ascending: false }).limit(100)
      if (filter.projectId) q = q.eq('project_id', filter.projectId)
      if (filter.slipId) q = q.eq('slip_id', filter.slipId)
      if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
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

export function useBills(filter: { supplierId?: string; companyId?: string; projectId?: string; statuses?: BillStatus[] }) {
  return useQuery({
    queryKey: ['bills', filter],
    queryFn: async () => {
      let q = supabase.from('bill_summaries').select('*, suppliers(name)').order('bill_date', { ascending: false }).limit(200)
      if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)
      if (filter.companyId) q = q.eq('company_id', filter.companyId)
      if (filter.projectId) q = q.contains('project_ids', [filter.projectId])
      if (filter.statuses) q = q.in('status', filter.statuses)
      const { data, error } = await q
      if (error) throw error
      // View columns are typed nullable; these are always set for a bill row.
      return data.map((b) => ({
        ...b, id: b.id!, bill_date: b.bill_date!, status: b.status!,
        lines_paisa: b.lines_paisa ?? 0, payable_paisa: b.payable_paisa ?? 0,
        credited_paisa: b.credited_paisa ?? 0, settled_paisa: b.settled_paisa ?? 0,
      }))
    },
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
