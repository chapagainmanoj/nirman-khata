// Deliveries (challan) with their photos, returns and derived quantities (req §10, §20).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ButtonLink, ConfirmButton, ErrorBanner, Field, Input, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { ShowMore } from '../../components/ShowMore'
import { newId } from '../../lib/ids'
import { DELIVERY_ISSUES } from '../../lib/labels'
import { rpc, useDeliveries, useDeliveryLineStatus } from './api'
import { canEnter } from './permissions'

const qty = (n: number) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })

type Delivery = NonNullable<ReturnType<typeof useDeliveries>['data']>[number]

export function DeliveryList({ filter, empty }: { filter: { projectId?: string; slipId?: string; supplierId?: string }; empty?: ReactNode }) {
  const deliveries = useDeliveries(filter)
  if (deliveries.isPending) return <Spinner />
  if (deliveries.error) return <ErrorBanner onRetry={() => void deliveries.refetch()}>{friendlyError(deliveries.error)}</ErrorBanner>
  const list = deliveries.data ?? []
  if (!list.length) return empty ?? <p className="text-sm text-subtle">No deliveries recorded yet.</p>
  return (
    <>
      <ul className="grid gap-3 lg:grid-cols-2">
        {list.map((d) => <DeliveryItem key={d.id} d={d} showProject={!filter.projectId} />)}
      </ul>
      <ShowMore list={deliveries} />
    </>
  )
}

function DeliveryItem({ d, showProject }: { d: Delivery; showProject: boolean }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const status = useDeliveryLineStatus({ projectId: d.project_id, supplierId: d.supplier_id })
  const [open, setOpen] = useState<'photos' | 'return' | null>(null)
  const st = (lineId: string) => status.data?.find((x) => x.id === lineId)
  // Billed or returned deliveries are history; the server refuses to delete them too.
  const locked = d.delivery_lines.some((l) => (st(l.id)?.billed_qty ?? 0) > 0 || (st(l.id)?.returned_qty ?? 0) > 0)

  const remove = useMutation({
    mutationFn: () => rpc('delete_delivery', { p_delivery: d.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
  })

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink">{d.suppliers?.name}</div>
          <div className="text-xs text-subtle">
            <DateText value={d.receipt_date} display={auth.dateDisplay} />
            {d.challan_no && ` · Challan ${d.challan_no}`}
            {showProject && d.projects && ` · ${d.projects.code}`}
          </div>
          {!d.slip_id && d.no_slip_reason && <div className="text-xs text-subtle">No order slip: {d.no_slip_reason}</div>}
        </div>
      </div>
      <ul className="mt-2">
        {d.delivery_lines.map((l) => {
          const s = st(l.id)
          return (
            <li key={l.id} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
              <span className="min-w-0 break-words">
                {l.materials?.name ?? l.material_text}{l.spec && <span className="text-subtle"> · {l.spec}</span>}
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
      <div className="mt-2 flex flex-wrap gap-1">
        {/* The next step for a delivery is its bill. */}
        {canEnter(auth) && d.delivery_lines.some((l) => (st(l.id)?.billable_qty ?? 0) > 0) && (
          <ButtonLink variant="secondary" to={`/bills/new?supplier=${d.supplier_id}&delivery=${d.id}`}>Enter bill for this</ButtonLink>
        )}
        <Button variant="ghost" aria-expanded={open === 'photos'} onClick={() => setOpen(open === 'photos' ? null : 'photos')}>Challan photo</Button>
        {canEnter(auth) && (
          <Button variant="ghost" aria-expanded={open === 'return'} onClick={() => setOpen(open === 'return' ? null : 'return')}>Return items</Button>
        )}
        {canEnter(auth) && !locked && (
          <ConfirmButton label="Delete this delivery" confirmLabel="Delete" disabled={remove.isPending} onConfirm={() => remove.mutate()}>
            Delete
          </ConfirmButton>
        )}
      </div>
      {open === 'photos' && <div className="mt-2"><Attachments owner={{ delivery_id: d.id }} canAdd={canEnter(auth)} label="Add challan photo" /></div>}
      {open === 'return' && <ReturnForm d={d} onDone={() => setOpen(null)} />}
      <ErrorBanner>{remove.error && friendlyError(remove.error)}</ErrorBanner>
    </li>
  )
}

/** Physical return: quantities only; cost changes only when the supplier's credit is posted. */
function ReturnForm({ d, onDone }: { d: Delivery; onDone: () => void }) {
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
        <Field key={l.id} label={`${l.materials?.name ?? l.material_text} (${l.units?.code})`} htmlFor={`ret-${l.id}`}>
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
