// What a contractor looks for on a supplier page: which bills are unpaid and on which site, what is
// on the way or came without a bill, and the supplier's latest rates. Each card stays out of the way
// when it has nothing to show.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { ButtonLink, Card, ErrorBanner, Spinner } from '../../components/ui'
import { relativeDay } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { usePartyBalances, usePartyOpenItems } from '../parties/api'
import { useProjects } from '../projects/api'
import { useOpenSlips } from './api'
import { canEnter, canRecordPayments } from './permissions'
import { t } from '../../lib/i18n'

const qty = (n: number) => Number(n.toFixed(3)).toLocaleString('en-IN')

/**
 * Posted bills with money still owed, per project, oldest first, as a contractor reckons it.
 * Payment money not yet matched to a bill counts against the oldest bills of its own project first;
 * money paid without a project, beyond any opening balance it pays off, then counts against the
 * oldest bills left on any project. So a bill
 * paid but not yet matched does not show as unpaid (inviting a second payment) while "To pay" says
 * settled. `full` is what the bill row still has open before that; matching closes the difference.
 */
function useUnpaidBills(supplierId: string, enabled: boolean) {
  const auth = useCompany()
  const items = usePartyOpenItems(supplierId, enabled)
  const balance = usePartyBalances(auth.companyId, 'supplier', enabled).data?.find((b) => b.party_id === supplierId)
  const free = new Map<string, number>()
  for (const i of items.data ?? []) if (i.kind === 'payment') free.set(i.project_id, (free.get(i.project_id) ?? 0) + i.amount_paisa)
  // The no-project bucket nets those payments against opening balances; what is left over is free.
  const unassigned = balance?.company_level ? Math.max(0, -balance.unallocated_paisa) : 0
  const open = (items.data ?? []).filter((i) => i.kind === 'bill' && i.amount_paisa > 0)
    .sort((a, b) => a.doc_date.localeCompare(b.doc_date) || a.label.localeCompare(b.label))
  const bills: Array<(typeof open)[number] & { full: number }> = []
  for (let i = 0, spare = unassigned; i < open.length; i++) {
    const b = open[i]
    const own = Math.min(free.get(b.project_id) ?? 0, b.amount_paisa)
    free.set(b.project_id, (free.get(b.project_id) ?? 0) - own)
    const any = Math.min(spare, b.amount_paisa - own)
    spare -= any
    if (b.amount_paisa - own - any > 0) bills.push({ ...b, full: b.amount_paisa, amount_paisa: b.amount_paisa - own - any })
  }
  return { ...items, bills }
}

/**
 * Under the "To pay" totals: what is owed on each site, when more than one site is owed. With the
 * page on one project (projectId), that project's line only, so the company total is not mistaken for it.
 */
export function OwedByProject({ supplierId, projectId }: { supplierId: string; projectId?: string | null }) {
  const auth = useCompany()
  const { bills } = useUnpaidBills(supplierId, true)
  const projects = useProjects(auth.companyId)
  const byProject = new Map<string, number>()
  for (const b of bills) if (!projectId || b.project_id === projectId) byProject.set(b.project_id, (byProject.get(b.project_id) ?? 0) + b.amount_paisa)
  if (byProject.size < (projectId ? 1 : 2)) return null
  return (
    <ul className="mt-2 text-sm">
      {[...byProject].sort((a, b) => b[1] - a[1]).map(([id, paisa]) => {
        const p = projects.data?.find((x) => x.id === id)
        return (
          <li key={id} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
            <span className="min-w-0 truncate text-subtle">{p ? `${p.code} · ${p.name}` : t('supplierParts.project')}</span>
            <span className="shrink-0 font-medium text-ink tabular-nums">{formatNPR(paisa)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function UnpaidBills({ supplierId, projectId }: { supplierId: string; projectId?: string | null }) {
  const auth = useCompany()
  const all = useUnpaidBills(supplierId, true)
  const items = { ...all, bills: projectId ? all.bills.filter((b) => b.project_id === projectId) : all.bills }
  const projects = useProjects(auth.companyId)
  const code = (id: string) => projects.data?.find((p) => p.id === id)?.code ?? ''
  if (items.isPending) return <Card title={t('supplierParts.unpaidBills')}><Spinner /></Card>
  if (items.error) return <Card title={t('supplierParts.unpaidBills')}><ErrorBanner onRetry={() => void items.refetch()}>{friendlyError(items.error)}</ErrorBanner></Card>
  if (!items.bills.length) return null
  return (
    <Card title={t('supplierParts.unpaidBills')}>
      <ul>
        {items.bills.map((b) => (
          <li key={`${b.doc_id}:${b.project_id}`} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <Link to={`/bills/${b.doc_id}`} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-sm hover:underline">
              <span className="block font-medium text-ink">{t('supplierParts.billLabel', { label: b.label })}</span>
              <span className="block text-xs text-subtle">
                {code(b.project_id)} · <DateText value={b.doc_date} display={auth.dateDisplay} /> · {relativeDay(b.doc_date)}
              </span>
            </Link>
            <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatNPR(b.amount_paisa)}</span>
            {canRecordPayments(auth) && (
              <ButtonLink variant="secondary" aria-label={t('supplierParts.payBillLabel', { label: b.label })}
                to={`/payments/new?supplier=${supplierId}&bill=${b.doc_id}&project=${b.project_id}${b.amount_paisa < b.full ? `&amount=${b.amount_paisa}` : ''}`}>
                {t('supplierParts.pay')}</ButtonLink>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Delivered lines not billed yet, with what they were and when they came. */
function useUnbilled(supplierId: string) {
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

export function ComingFromThem({ supplierId, projectId }: { supplierId: string; projectId?: string | null }) {
  const auth = useCompany()
  const slips = useOpenSlips({ companyId: auth.companyId, supplierId, ...(projectId ? { projectId } : {}) })
  const all = useUnbilled(supplierId)
  const lines = all.data ?? []
  const unbilled = { data: projectId ? lines.filter((l) => l.deliveries?.project_id === projectId) : lines }
  if (slips.isPending || all.isPending) return null
  const error = slips.error || all.error
  if (error) return <Card title={t('supplierParts.onTheWayAnd')}><ErrorBanner onRetry={() => { void slips.refetch(); void all.refetch() }}>{friendlyError(error)}</ErrorBanner></Card>
  if (!slips.data.length && !unbilled.data.length) return null
  return (
    <Card title={t('supplierParts.onTheWayAnd')}>
      {slips.data.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-subtle">{t('supplierParts.orderedStillToCome')}</h3>
          <ul className="mb-3">
            {slips.data.map((s) => (
              <li key={s.id} className="border-b border-line last:border-0">
                <Link to={`/slips/${s.id}`} className="flex min-h-11 items-center justify-between gap-3 py-1.5 text-sm hover:underline">
                  <span className="font-medium text-ink">{s.number}</span>
                  <span className="text-xs text-subtle">
                    {s.fulfilment === 'partially_received' ? t('supplierParts.partReceived') : t('supplierParts.notReceivedYet')} {t('supplierParts.ordered')}{' '}<DateText value={s.request_date} display={auth.dateDisplay} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {unbilled.data.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-subtle">{t('supplierParts.deliveredNoBillYet')}</h3>
          <ul>
            {unbilled.data.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
                <span className="min-w-0">
                  <span className="text-ink">{qty(l.billable)} {l.units?.code} {l.materials?.name ?? l.material_text}</span>
                  <span className="block text-xs text-subtle">
                    {l.deliveries?.projects?.code}{l.deliveries?.receipt_date && <> {t('supplierParts.came')}{' '}<DateText value={l.deliveries.receipt_date} display={auth.dateDisplay} /></>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {canEnter(auth) && <div className="mt-2"><ButtonLink variant="secondary" to={`/bills/new?supplier=${supplierId}`}>{t('supplierParts.enterBill')}</ButtonLink></div>}
        </>
      )}
    </Card>
  )
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

export function TheirRates({ supplierId, emptyText }: { supplierId: string; emptyText?: string }) {
  const auth = useCompany()
  // On its own page (emptyText set) the page heading already says "Their rates".
  const title = emptyText ? undefined : t('supplierParts.theirRates')
  const rates = useTheirRates(supplierId)
  if (rates.error) return <Card title={title}><ErrorBanner onRetry={() => void rates.refetch()}>{friendlyError(rates.error)}</ErrorBanner></Card>
  if (rates.isPending) return emptyText ? <Spinner /> : null
  if (!rates.data.length) return emptyText ? <Card title={title}><p className="text-sm text-subtle">{emptyText}</p></Card> : null
  return (
    <Card title={title}>
      <p className="mb-2 text-xs text-subtle">{t('supplierParts.lastBilledRateFor')}</p>
      <ul>
        {rates.data.map((r) => (
          <li key={`${r.material_id}:${r.unit_id}`} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
            <span className="min-w-0 truncate text-ink">{r.materials?.name}</span>
            <span className="shrink-0 text-right">
              <span className="font-medium text-ink tabular-nums">{formatNPR(r.rate_paisa)}</span>
              <span className="text-subtle">/{r.units?.code}</span>
              <span className="block text-xs text-subtle"><DateText value={r.supplier_bills.bill_date} display={auth.dateDisplay} /></span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
