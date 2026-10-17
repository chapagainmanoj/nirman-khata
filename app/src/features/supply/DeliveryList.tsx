// Deliveries (challan) with their photos, returns and derived quantities (req §10, §20).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ErrorBanner, Field, Input, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { ShowMore } from '../../components/ShowMore'
import { newId } from '../../lib/ids'
import { DELIVERY_ISSUES } from '../../lib/labels'
import { rpc, useDeliveries, useDeliveryStatusFor, type DeliveryFilter } from './api'
import { canEnter } from './permissions'

const qty = (n: number) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Delivery = Pick<NonNullable<ReturnType<typeof useDeliveries>['data']>[number], 'id' | 'supplier_id' | 'project_id' | 'delivery_lines'>
type DeliveryLine = Delivery['delivery_lines'][number]
export type LineStatus = ReturnType<typeof useDeliveryStatusFor>

const lineName = (l: DeliveryLine) => l.materials?.name ?? l.material_text ?? ''

/** Lines still waiting for a bill; "Enter bill for this" shows only then. */
export const billableQty = (d: Delivery, status: LineStatus) =>
  d.delivery_lines.reduce((n, l) => n + (status.get(l.id)?.billable_qty ?? 0), 0)

/** Billed or returned deliveries are history; the server refuses to delete them too. */
export const isLocked = (d: Delivery, status: LineStatus) =>
  d.delivery_lines.some((l) => (status.get(l.id)?.billed_qty ?? 0) > 0 || (status.get(l.id)?.returned_qty ?? 0) > 0)

/** Where the delivery stands with its bill, summed over its lines. Nothing to bill and none billed: no badge. */
function billing(d: Delivery, status: LineStatus): [string, 'neutral' | 'good' | 'warn'] | null {
  const sum = (k: 'billed_qty' | 'billable_qty' | 'awaiting_credit_qty') => d.delivery_lines.reduce((n, l) => n + (status.get(l.id)?.[k] ?? 0), 0)
  if (!d.delivery_lines.some((l) => status.has(l.id))) return null
  if (sum('awaiting_credit_qty') > 0) return ['Awaiting credit', 'warn']
  if (sum('billable_qty') > 0) return sum('billed_qty') > 0 ? ['Part billed', 'warn'] : ['Not billed', 'neutral']
  return sum('billed_qty') > 0 ? ['Billed', 'good'] : null
}

/**
 * Deliveries as a compact table, newest first, 50 at a time: one line a delivery on a laptop.
 * On a phone, the date, challan, project and items move under the supplier.
 */
export function DeliveryList({ filter, empty }: { filter: DeliveryFilter; empty?: ReactNode }) {
  const auth = useCompany()
  const deliveries = useDeliveries(filter)
  const ids = useMemo(() => (deliveries.data ?? []).map((d) => d.id), [deliveries.data])
  const status = useDeliveryStatusFor(ids)
  if (deliveries.isPending) return <Spinner />
  if (deliveries.error) return <ErrorBanner onRetry={() => void deliveries.refetch()}>{friendlyError(deliveries.error)}</ErrorBanner>
  const list = deliveries.data ?? []
  if (!list.length) return empty ?? <p className="text-sm text-subtle">No deliveries recorded yet.</p>
  const showProject = !filter.projectId
  const th = 'py-2 pr-3 font-medium'
  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-subtle">
              <th scope="col" className={`hidden pl-4 sm:table-cell ${th}`}>Date</th>
              <th scope="col" className={`pl-4 sm:pl-0 ${th}`}>Supplier</th>
              <th scope="col" className={`hidden md:table-cell ${th}`}>Challan</th>
              {showProject && <th scope="col" className={`hidden md:table-cell ${th}`}>Project</th>}
              <th scope="col" className={`hidden lg:table-cell ${th}`}>Items</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Received</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const to = `/deliveries/${d.id}`
              const [first, ...rest] = d.delivery_lines
              const items = first && <>{lineName(first)}{first.spec && <span className="text-subtle"> · {first.spec}</span>}{rest.length > 0 && <span className="text-subtle"> +{rest.length} more</span>}</>
              const issue = d.delivery_lines.find((l) => l.issue)?.issue
              const bill = billing(d, status)
              return (
                <tr key={d.id} className="border-b border-line align-middle last:border-0 hover:bg-muted">
                  <td className="hidden py-2 pr-3 pl-4 whitespace-nowrap text-subtle sm:table-cell"><DateText value={d.receipt_date} display={auth.dateDisplay} /></td>
                  <td className="py-2 pr-3 pl-4 sm:pl-0">
                    <Link to={to} className="inline-flex min-h-8 items-center font-medium break-words text-ink hover:underline">{d.suppliers?.name}</Link>
                    {issue && <> <Badge tone="warn">{DELIVERY_ISSUES[issue]}</Badge></>}
                    {/* Smaller screens: what the hidden columns say. */}
                    {items && <div className="text-xs break-words text-ink lg:hidden">{items}</div>}
                    <div className="text-xs text-subtle md:hidden">
                      <span className="sm:hidden"><DateText value={d.receipt_date} display={auth.dateDisplay} /></span>
                      {d.challan_no && <><span className="sm:hidden"> · </span>Challan {d.challan_no}</>}
                      {showProject && d.projects && <> · {d.projects.code}</>}
                    </div>
                  </td>
                  <td className="hidden py-2 pr-3 whitespace-nowrap md:table-cell">{d.challan_no}</td>
                  {showProject && <td className="hidden py-2 pr-3 md:table-cell">{d.projects?.code}</td>}
                  <td className="hidden py-2 pr-3 break-words lg:table-cell">{items}</td>
                  <td className="py-2 pr-4 text-right">
                    <span className="whitespace-nowrap tabular-nums">
                      {d.delivery_lines.length === 1 ? `${qty(first.accepted_qty ?? 0)} ${first.units?.code ?? ''}` : `${d.delivery_lines.length} items`}
                    </span>
                    {bill && <div className="mt-1"><Badge tone={bill[1]}>{bill[0]}</Badge></div>}
                    {/* The next step for a delivery is its bill. */}
                    {canEnter(auth) && billableQty(d, status) > 0 && (
                      <div><Link to={`/bills/new?supplier=${d.supplier_id}&delivery=${d.id}`} className="inline-flex min-h-8 items-center text-xs font-semibold text-brand hover:underline">Enter bill for this</Link></div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ShowMore list={deliveries} />
    </>
  )
}

/** Each line with what was accepted, and what has since been rejected, returned, billed or credited. */
export function DeliveryLines({ d, status }: { d: Delivery; status: LineStatus }) {
  return (
    <ul>
      {d.delivery_lines.map((l) => {
        const s = status.get(l.id)
        return (
          <li key={l.id} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
            <span className="min-w-0 break-words">
              {lineName(l)}{l.spec && <span className="text-subtle"> · {l.spec}</span>}
              {l.issue && <> <Badge tone="warn">{DELIVERY_ISSUES[l.issue]}</Badge></>}
              {l.note && <span className="block text-xs text-subtle">{l.note}</span>}
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {qty(l.accepted_qty ?? 0)} {l.units?.code}
              {l.rejected_qty > 0 && <span className="block text-xs text-subtle">{qty(l.rejected_qty)} rejected</span>}
              {s && s.returned_qty! > 0 && <span className="block text-xs text-subtle">{qty(s.returned_qty!)} returned</span>}
              {s && s.billed_qty! > 0 && <span className="block text-xs text-subtle">{qty(s.billed_qty!)} billed</span>}
              {s && s.awaiting_credit_qty! > 0 && <span className="block text-xs text-warn-ink">{qty(s.awaiting_credit_qty!)} awaiting credit</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Physical return: quantities only; cost changes only when the supplier's credit is posted. */
export function ReturnForm({ d, onDone }: { d: Delivery; onDone: () => void }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [id] = useState(newId)
  const [date, setDate] = useState(todayKathmandu())
  const [note, setNote] = useState('')
  const [qtys, setQtys] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () => rpc('record_return', { p_return: {
      id, supplier_id: d.supplier_id, project_id: d.project_id, return_date: date, note,
      lines: Object.entries(qtys).filter(([, q]) => Number(q) > 0).map(([delivery_line_id, q]) => ({ delivery_line_id, qty: Number(q) })),
    } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      await queryClient.invalidateQueries({ queryKey: ['delivery-lines'] })
      await queryClient.invalidateQueries({ queryKey: ['slip'] })
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (Object.values(qtys).some((q) => Number(q) > 0)) save.mutate()
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">Return to supplier</div>
      <p className="text-xs text-subtle">This changes quantities only. If the goods were billed, ask the supplier for a credit note.</p>
      {d.delivery_lines.map((l) => (
        <Field key={l.id} label={`${lineName(l)} (${l.units?.code})`} htmlFor={`ret-${l.id}`}>
          <Input id={`ret-${l.id}`} inputMode="decimal" value={qtys[l.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [l.id]: e.target.value })} />
        </Field>
      ))}
      <Field label="Return date" htmlFor={`ret-date-${d.id}`}><DateInput id={`ret-date-${d.id}`} value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
      <Field label="Reason" htmlFor={`ret-note-${d.id}`}><Input id={`ret-note-${d.id}`} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={save.isPending}>Record return</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
