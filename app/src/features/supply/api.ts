// Data for the supplier loop: suppliers, slips, deliveries, bills, payments, khata.
// Reads go through RLS, so each list already contains only what the user may see.
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Database, Json } from '../../lib/database.types'
import { PAGE_SIZE, usePaged } from '../../lib/paging'
import { containsAny } from '../../lib/search'
import type { ListSearch } from '../lists/ListFilters'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../data/rpc'

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

/**
 * Suppliers with an order slip, delivery or bill on the project (view supplier_projects, read with
 * the caller's rights): what ties a supplier to a project.
 */
export function useSupplierProjects(projectId: string | null) {
  return useQuery({
    queryKey: ['supplier-projects', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase.from('supplier_projects').select('supplier_id').eq('project_id', projectId!)
      if (error) throw error
      return new Set(data.map((r) => r.supplier_id!))
    },
  })
}

// ---------------------------------------------------------------------------
// Slips
// ---------------------------------------------------------------------------
export type SlipTab = 'open' | 'pending' | 'draft' | 'all'
type SlipFilter = { companyId: string; projectId?: string | null; supplierId?: string; tab?: SlipTab } & ListSearch

function slipQuery<Q extends { eq: Function; in: Function; contains: Function; gte: Function; lte: Function; or: Function }>(q: Q, f: SlipFilter): Q {
  q = q.eq('company_id', f.companyId)
  if (f.projectId) q = q.contains('project_ids', [f.projectId])
  if (f.supplierId) q = q.eq('supplier_id', f.supplierId)
  if (f.tab === 'open') q = q.eq('status', 'approved').in('fulfilment', ['not_received', 'partially_received'])
  if (f.tab === 'pending') q = q.eq('status', 'pending')
  if (f.tab === 'draft') q = q.in('status', ['draft', 'rejected'])
  if (f.from) q = q.gte('request_date', f.from)
  if (f.to) q = q.lte('request_date', f.to)
  if (f.search) q = q.or(containsAny(f.search, ['number'], 'supplier_id', f.supplierMatch))
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
export type DeliveryFilter = { projectId?: string; slipId?: string; supplierId?: string } & ListSearch

export function useDeliveries(filter: DeliveryFilter) {
  return usePaged(['deliveries', filter], async (from, to) => {
    let q = supabase.from('deliveries')
      .select('*, suppliers(name), projects(code, name), delivery_lines(*, materials(name), units(code))')
    if (filter.projectId) q = q.eq('project_id', filter.projectId)
    if (filter.slipId) q = q.eq('slip_id', filter.slipId)
    if (filter.supplierId) q = q.eq('supplier_id', filter.supplierId)
    if (filter.from) q = q.gte('receipt_date', filter.from)
    if (filter.to) q = q.lte('receipt_date', filter.to)
    if (filter.search) q = q.or(containsAny(filter.search, ['challan_no'], 'supplier_id', filter.supplierMatch))
    const { data, error } = await q.order('receipt_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)
    if (error) throw error
    return data
  })
}

/** Delivery lines with derived quantities (billable, returned, awaiting credit). */
/** One delivery with its lines; null when it does not exist or is on a project the user cannot see. */
export function useDelivery(deliveryId: string) {
  return useQuery({
    queryKey: ['deliveries', 'one', deliveryId],
    queryFn: async () => {
      const { data, error } = await supabase.from('deliveries')
        .select('*, suppliers(name), projects(code, name), order_slips(number), delivery_lines(*, materials(name), units(code))')
        .eq('id', deliveryId).order('sort_order', { referencedTable: 'delivery_lines' }).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Billed / returned quantities for the lines of these deliveries only, one request per page of
 * the list. Under 'delivery-lines', so posting a bill or credit refreshes it.
 */
export function useDeliveryStatusFor(deliveryIds: string[]) {
  const chunks = useMemo(() => {
    const out: string[][] = []
    for (let i = 0; i < deliveryIds.length; i += PAGE_SIZE) out.push(deliveryIds.slice(i, i + PAGE_SIZE).sort())
    return out
  }, [deliveryIds])
  return useQueries({
    queries: chunks.map((ids) => ({
      queryKey: ['delivery-lines', 'by-delivery', ids],
      queryFn: async () => {
        const { data, error } = await supabase.from('delivery_line_status')
          .select('id, billed_qty, returned_qty, awaiting_credit_qty, billable_qty').in('delivery_id', ids)
        if (error) throw error
        return data
      },
    })),
    combine: (results) => new Map(results.flatMap((r) => r.data ?? []).map((l) => [l.id!, l])),
  })
}

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

// ---------------------------------------------------------------------------
// Supplier page
// ---------------------------------------------------------------------------
/** Delivered lines not billed yet, with what they were and when they came. */
export function useUnbilled(supplierId: string) {
  return useQuery({
    queryKey: ['delivery-lines', 'unbilled-detail', supplierId],
    queryFn: async () => {
      const st = await supabase.from('delivery_line_status').select('id, billable_qty').eq('supplier_id', supplierId).gt('billable_qty', 0)
      if (st.error) throw st.error
      if (!st.data.length) return []
      // In batches, so a long list of ids does not make the request URL too long.
      const ids = st.data.map((s) => s.id!)
      const batches = await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => supabase.from('delivery_lines')
        .select('id, material_text, materials(name), units(code), deliveries(id, receipt_date, project_id, projects(code))')
        .in('id', ids.slice(i * 100, i * 100 + 100))))
      const failed = batches.find((b) => b.error)
      if (failed?.error) throw failed.error
      const billable = new Map(st.data.map((s) => [s.id!, Number(s.billable_qty)]))
      return batches.flatMap((b) => b.data ?? [])
        .map((l) => ({ ...l, billable: billable.get(l.id) ?? 0 }))
        .sort((a, b) => (a.deliveries?.receipt_date ?? '').localeCompare(b.deliveries?.receipt_date ?? ''))
    },
  })
}

/** The latest posted rate for each material from this supplier. */
export function useTheirRates(supplierId: string, enabled = true) {
  return useQuery({
    queryKey: ['supplier-rates', supplierId],
    queryFn: async () => {
      const { data, error } = await supabase.from('bill_lines')
        .select('material_id, unit_id, rate_paisa, materials(name), units(code), supplier_bills!inner(bill_date, supplier_id, status)')
        .eq('supplier_bills.supplier_id', supplierId).eq('supplier_bills.status', 'posted')
        .not('material_id', 'is', null).not('rate_paisa', 'is', null)
        .order('created_at', { ascending: false }).limit(300)
      if (error) throw error
      // Newest bill first; keep one row per material and unit.
      const rows = [...data].sort((a, b) => b.supplier_bills.bill_date.localeCompare(a.supplier_bills.bill_date))
      const seen = new Set<string>()
      return rows.filter((r) => {
        const k = `${r.material_id}:${r.unit_id}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    },
    enabled,
  })
}

export type SupplierRow = Pick<Database['public']['Tables']['suppliers']['Insert'], 'name' | 'contact_person' | 'phone' | 'address' | 'pan_vat' | 'payment_terms' | 'categories'>

/** Add a supplier under `id`, or change one (`existing`). */
export async function saveSupplier(companyId: string, id: string, row: SupplierRow, existing: boolean) {
  const { error } = existing
    ? await supabase.from('suppliers').update(row).eq('id', id)
    : await supabase.from('suppliers').insert({ ...row, id, company_id: companyId })
  if (error) throw error
}

/** Whether an order slip can be sent again: it is a draft, or was sent back (rejected). */
export async function slipCanBeSent(slipId: string): Promise<boolean> {
  const { data } = await supabase.from('order_slips').select('status').eq('id', slipId).maybeSingle()
  return data?.status === 'draft' || data?.status === 'rejected'
}

/** Another live bill from this supplier with the same number (any case), that the user can see. */
export async function hasDuplicateBill(supplierId: string, billNo: string, exceptId: string): Promise<boolean> {
  const { data } = await supabase.from('supplier_bills').select('id')
    // Same number, any case; % and _ are matched literally, not as wildcards.
    .eq('supplier_id', supplierId).ilike('bill_no', billNo.replace(/[\\%_]/g, (c) => `\\${c}`)).neq('id', exceptId).neq('status', 'reversed')
  return !!data?.length
}

/** Delivery line details (challan, date, material, unit) for matching. */
export function useDeliveriesById(deliveryIds: string[]) {
  const ids = useMemo(() => [...new Set(deliveryIds)].sort(), [deliveryIds])
  return useQuery({
    queryKey: ['delivery-lines', 'detail', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_lines').select('id, material_id, material_text, unit_id, unit_note, deliveries(challan_no, receipt_date)')
        .in('delivery_id', ids)
      if (error) throw error
      return new Map(data.map((d) => [d.id, {
        material_id: d.material_id, material_text: d.material_text, unit_id: d.unit_id, unit_note: d.unit_note,
        challan_no: d.deliveries?.challan_no ?? null, receipt_date: d.deliveries?.receipt_date ?? '',
      }]))
    },
  })
}
