// Money a party gives back (req §12.2, §19; GLOSSARY.md): shown on a party page when they hold the
// company's money. A Refund clears Overpayment; Peski Returned gives back unused Peski. Either
// lowers what they hold and cash paid, never cost, and cannot be more than that kind of money in
// the chosen project (or not-for-a-project) part.
import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, ErrorBanner, Field, Input, Select } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR, paisaToInput } from '../../lib/money'
import type { Database } from '../../lib/database.types'
import { PARTY, type PartyKind } from '../parties/kinds'
import { useProjects } from '../projects/api'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canPost, canRecordPayments } from '../supply/permissions'

type PaymentMethod = Database['public']['Enums']['payment_method']
type Room = { project_id: string | null; available_paisa: number; peski_paisa: number }
type GiveBack = 'refund' | 'peski_returned'
const NONE = 'none'
/** What each kind can give back in a bucket: Overpayment for a Refund, Peski for Peski Returned. */
const roomOf = (r: Room, k: GiveBack) => (k === 'refund' ? r.available_paisa : r.peski_paisa)

function useRefundRooms(partyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['balances', 'refund-rooms', partyId],
    enabled,
    queryFn: () => rpc('refund_rooms', { p_party: partyId }),
  })
}

/**
 * `embedded`: a section at the foot of the balance card instead of a card of its own.
 * `quiet`: only a small link until opened, for while their money is still being used up (a
 * subcontractor's peski during active work comes off their next bill, it is not given back).
 * `intro`: the line above the button, in place of the usual one.
 */
export function RefundCard({ kind, partyId, embedded, quiet, intro }: {
  kind: PartyKind; partyId: string; embedded?: boolean; quiet?: boolean; intro?: (held: string) => string
}) {
  const auth = useCompany()
  const rooms = useRefundRooms(partyId, auth.canSeeFinance && canRecordPayments(auth))
  const [open, setOpen] = useState(false)
  // Only buckets the person may refund into: Accounts and Admin also the not-for-a-project part.
  const usable = (rooms.data ?? []).filter((r) => r.project_id || canPost(auth))
  if (!usable.length) return null
  const overpaid = Math.max(...usable.map((r) => r.available_paisa))
  const peski = Math.max(...usable.map((r) => r.peski_paisa))
  const held = [peski > 0 && `${formatNPR(peski)} peski not yet used`, overpaid > 0 && `${formatNPR(overpaid)} overpaid`]
    .filter(Boolean).join(' and ')
  if (quiet && !open) {
    return (
      <div className={embedded ? 'mt-4 border-t border-line pt-3' : ''}>
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-sm text-slate underline underline-offset-4">
          They gave money back
        </button>
      </div>
    )
  }
  const body = (
    <>
      <p className="text-sm text-subtle">
        {intro ? intro(held) : <>
          This {PARTY[kind].one.toLowerCase()} holds up to <span className="font-semibold text-ink tabular-nums">{held}</span>.
          Record money they give back here; it is not a cost.
        </>}
      </p>
      {open
        ? <RefundForm kind={kind} partyId={partyId} rooms={usable} onDone={() => setOpen(false)} />
        : <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>Record money given back</Button>}
    </>
  )
  if (embedded) {
    return (
      <section className="mt-4 border-t border-line pt-3" aria-label="Money given back">
        <h3 className="mb-1 text-sm font-semibold text-ink">Money given back</h3>
        {body}
      </section>
    )
  }
  return <Card title="Money given back">{body}</Card>
}

function RefundForm({ kind, partyId, rooms: all, onDone }: {
  kind: PartyKind
  partyId: string
  rooms: Room[]
  onDone: () => void
}) {
  const auth = useCompany()
  const navigate = useNavigate()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [giveBack, setGiveBack] = useState<GiveBack>(all.some((r) => r.available_paisa > 0) ? 'refund' : 'peski_returned')
  const rooms = all.filter((r) => roomOf(r, giveBack) > 0)
  const [bucket, setBucket] = useState(rooms[0].project_id ?? NONE)
  const current = rooms.find((r) => (r.project_id ?? NONE) === bucket)
  const room = current ? roomOf(current, giveBack) : 0
  const [amount, setAmount] = useState(paisaToInput(roomOf(rooms[0], giveBack)))
  const [date, setDate] = useState(todayKathmandu())
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [id] = useState(newId)
  const paisa = parseNPR(amount) ?? 0
  const save = usePosting(
    (key) => rpc('record_refund', {
      p_op_key: key,
      p_refund: {
        id, [PARTY[kind].column]: partyId, project_id: bucket === NONE ? null : bucket, refund_date: date,
        amount_paisa: paisa, method, reference, notes, kind: giveBack,
      },
    }),
    { onSuccess: async () => { await refresh(); onDone(); navigate(`/refunds/${id}`) } },
  )
  const name = (projectId: string | null) => {
    if (!projectId) return 'Not for a project'
    const p = projects.data?.find((x) => x.id === projectId)
    return p ? `${p.code} · ${p.name}` : 'Project'
  }
  const tooMuch = paisa > room

  function submit(e: FormEvent) {
    e.preventDefault()
    if (paisa > 0 && !tooMuch) save.mutate()
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What is it" htmlFor="rf-kind">
          <Select id="rf-kind" value={giveBack} onChange={(e) => {
            const k = e.target.value as GiveBack
            const first = all.find((x) => roomOf(x, k) > 0)
            setGiveBack(k)
            if (first) { setBucket(first.project_id ?? NONE); setAmount(paisaToInput(roomOf(first, k))) }
          }}>
            {all.some((r) => r.available_paisa > 0) && <option value="refund">Refund of overpayment</option>}
            {all.some((r) => r.peski_paisa > 0) && <option value="peski_returned">Peski returned</option>}
          </Select>
        </Field>
        <Field label="From the money on" htmlFor="rf-bucket">
          <Select id="rf-bucket" value={bucket} onChange={(e) => {
            setBucket(e.target.value)
            const r = rooms.find((x) => (x.project_id ?? NONE) === e.target.value)
            if (r) setAmount(paisaToInput(roomOf(r, giveBack)))
          }}>
            {rooms.map((r) => <option key={r.project_id ?? NONE} value={r.project_id ?? NONE}>{name(r.project_id)} (up to {formatNPR(roomOf(r, giveBack))})</option>)}
          </Select>
        </Field>
        <Field label="Amount received" htmlFor="rf-amount" error={tooMuch ? `No more than ${formatNPR(room)} here` : undefined}>
          <MoneyInput id="rf-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Received on" htmlFor="rf-date">
          <DateInput id="rf-date" value={date} onChange={setDate} display={auth.dateDisplay} quick="past" />
        </Field>
        <Field label="How" htmlFor="rf-method">
          <Select id="rf-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="rf-ref" hint="Cheque or transaction number"><Input id="rf-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Note" htmlFor="rf-notes"><Input id="rf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={save.isPending} disabled={paisa <= 0 || tooMuch}>{giveBack === 'refund' ? 'Save refund' : 'Save peski returned'}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
