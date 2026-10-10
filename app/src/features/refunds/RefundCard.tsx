// Money a party gives back (req §12.2, §19): shown on a party page when the company holds an
// advance with them. A refund lowers the advance and cash paid, never cost, and cannot be more
// than the advance in the chosen project (or not-for-a-project) part.
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
const NONE = 'none'

function useRefundRooms(partyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['balances', 'refund-rooms', partyId],
    enabled,
    queryFn: () => rpc('refund_rooms', { p_party: partyId }),
  })
}

export function RefundCard({ kind, partyId }: { kind: PartyKind; partyId: string }) {
  const auth = useCompany()
  const rooms = useRefundRooms(partyId, auth.canSeeFinance && canRecordPayments(auth))
  const [open, setOpen] = useState(false)
  // Only buckets the person may refund into: Accounts and Admin also the not-for-a-project part.
  const usable = (rooms.data ?? []).filter((r) => r.project_id || canPost(auth))
  if (!usable.length) return null
  const total = Math.max(...usable.map((r) => r.available_paisa))
  return (
    <Card title="Refund received">
      <p className="text-sm text-subtle">
        This {PARTY[kind].one.toLowerCase()} holds up to <span className="font-semibold text-ink tabular-nums">{formatNPR(total)}</span> of
        your advance. Record money they give back here; it is not a cost.
      </p>
      {open
        ? <RefundForm kind={kind} partyId={partyId} rooms={usable} onDone={() => setOpen(false)} />
        : <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>Record refund</Button>}
    </Card>
  )
}

function RefundForm({ kind, partyId, rooms, onDone }: {
  kind: PartyKind
  partyId: string
  rooms: Array<{ project_id: string | null; available_paisa: number }>
  onDone: () => void
}) {
  const auth = useCompany()
  const navigate = useNavigate()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [bucket, setBucket] = useState(rooms[0].project_id ?? NONE)
  const room = rooms.find((r) => (r.project_id ?? NONE) === bucket)?.available_paisa ?? 0
  const [amount, setAmount] = useState(paisaToInput(rooms[0].available_paisa))
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
        amount_paisa: paisa, method, reference, notes,
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
        <Field label="From the advance on" htmlFor="rf-bucket">
          <Select id="rf-bucket" value={bucket} onChange={(e) => {
            setBucket(e.target.value)
            const r = rooms.find((x) => (x.project_id ?? NONE) === e.target.value)
            if (r) setAmount(paisaToInput(r.available_paisa))
          }}>
            {rooms.map((r) => <option key={r.project_id ?? NONE} value={r.project_id ?? NONE}>{name(r.project_id)} (up to {formatNPR(r.available_paisa)})</option>)}
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
        <Button type="submit" busy={save.isPending} disabled={paisa <= 0 || tooMuch}>Save refund</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
