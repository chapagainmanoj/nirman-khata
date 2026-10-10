// Pieces every party page shares: balance, opening balance, matching payments to what is
// owed, khata and payment list (req §12.2, §12.3, §20). Supplier, subcontractor, crew and
// payee pages compose these.
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, Card, Detail, ErrorBanner, Field, Input, Select, Spinner, Status } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { useProjects } from '../projects/api'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { usePartyBalances, usePartyKhata, usePartyOpenItems, usePartyOpeningBalance, usePartyPayments } from './api'
import { ShowMore } from '../../components/ShowMore'
import { DOC_WORD, docPath, PARTY, type PartyKind } from './kinds'

/** Positive = we owe (baki), negative = advance with the party (peski). */
export function BalanceText({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-subtle">Settled</span>
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-ink">{formatNPR(Math.abs(paisa))}</span>{' '}
      <span className={paisa > 0 ? 'text-warn-ink' : 'text-good-ink'}>{paisa > 0 ? 'to pay (baki)' : 'advance (peski)'}</span>
    </span>
  )
}

export function BalanceCard({ kind, partyId }: { kind: PartyKind; partyId: string }) {
  const auth = useCompany()
  const balances = usePartyBalances(auth.companyId, kind, true)
  const b = balances.data?.find((x) => x.party_id === partyId)
  const ob = usePartyOpeningBalance(partyId, true)
  const fresh = !!b && b.charged_paisa === 0 && b.paid_paisa === 0 && b.balance_paisa === 0 && !ob.isPending && !ob.data
  return (
    <Card title="Balance">
      {balances.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void balances.refetch()}>{balances.error && friendlyError(balances.error)}</ErrorBanner>
      {fresh && (
        <p className="text-sm text-subtle">
          No {kind === 'supplier' ? 'bills' : PARTY[kind].charges} or payments yet.
          {auth.seesAllProjects && ` Owed this ${PARTY[kind].one.toLowerCase()} from before? Set the opening balance from your old khata.`}
        </p>
      )}
      {b && !fresh && (
        <>
          <div className="mb-2 text-lg"><BalanceText paisa={b.balance_paisa} /></div>
          <Detail label={kind === 'supplier' ? 'Bills and charges' : `Charged (${PARTY[kind].charges})`}>{formatNPR(b.charged_paisa)}</Detail>
          <Detail label="Paid">{formatNPR(b.paid_paisa)}</Detail>
          {b.company_level && <Detail label="Not yet assigned to a project">{formatNPR(b.unallocated_paisa)}</Detail>}
          {!b.company_level && <p className="mt-2 text-xs text-subtle">Only your projects are included.</p>}
        </>
      )}
      {auth.seesAllProjects && <OpeningBalance kind={kind} partyId={partyId} prompt={fresh} />}
    </Card>
  )
}

function OpeningBalance({ kind, partyId, prompt }: { kind: PartyKind; partyId: string; prompt?: boolean }) {
  const auth = useCompany()
  const ob = usePartyOpeningBalance(partyId, true)
  const refresh = useRefreshMoney()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [owed, setOwed] = useState(true)
  const [date, setDate] = useState(todayKathmandu())
  const [note, setNote] = useState('')
  const who = PARTY[kind].one.toLowerCase()
  const set = usePosting(
    (key) => rpc('set_opening_balance', {
      p_op_key: key, p_party: partyId, p_cutover_date: date, p_amount_paisa: (parseNPR(amount) ?? 0) * (owed ? 1 : -1), p_note: note,
    }),
    { onSuccess: async () => { setOpen(false); await ob.refetch(); await refresh() } },
  )
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) =>
      rpc('reverse_opening_balance', { p_op_key: key, p_opening_balance: ob.data!.id, p_date: a.date, p_reason: a.reason }),
    { onSuccess: async () => { await ob.refetch(); await refresh() } },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    if (parseNPR(amount) && note.trim()) set.mutate()
  }

  if (ob.data) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <span>
          Opening balance <BalanceText paisa={ob.data.amount_paisa} /> on <DateText value={ob.data.cutover_date} display={auth.dateDisplay} />
          <span className="block text-xs text-subtle">{ob.data.note}</span>
        </span>
        <ReasonButton variant="ghost" title="Correct the opening balance" hint="It is reversed and kept in history; then set the right amount."
          confirmLabel="Reverse it" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
          withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
          onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
          Correct
        </ReasonButton>
      </div>
    )
  }
  if (!open) {
    return <Button variant={prompt ? 'secondary' : 'ghost'} className="mt-2" onClick={() => setOpen(true)}>Set opening balance</Button>
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <p className="text-sm text-subtle">What was owed when you started using NirmanKhata. It is not project cost.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" htmlFor="ob-amount"><MoneyInput id="ob-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Who owes" htmlFor="ob-dir">
          <Select id="ob-dir" value={owed ? 'owe' : 'advance'} onChange={(e) => setOwed(e.target.value === 'owe')}>
            <option value="owe">We owe the {who} (baki)</option>
            <option value="advance">The {who} holds our advance (peski)</option>
          </Select>
        </Field>
        <Field label="Cutover date" htmlFor="ob-date"><DateInput id="ob-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label="Note" htmlFor="ob-note" hint="e.g. From the old khata book, page 12"><Input id="ob-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{set.error && friendlyError(set.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={set.isPending} disabled={!parseNPR(amount) || !note.trim()}>Save</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}

const OWED_KINDS = new Set(['bill', 'charge', 'labour', 'expense'])

/** Match money already paid to what is owed (req §12.3: refines allocation, never adds cash). */
export function MatchCard({ kind, partyId }: { kind: PartyKind; partyId: string }) {
  const auth = useCompany()
  const items = usePartyOpenItems(partyId, true)
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [docKey, setDocKey] = useState('')
  const [paymentKey, setPaymentKey] = useState('')
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState('')

  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code ?? ''
  const docs = items.data?.filter((i) => OWED_KINDS.has(i.kind)) ?? []
  const doc = docs.find((b) => `${b.doc_id}:${b.project_id}` === docKey)
  const payments = items.data?.filter((i) => i.kind === 'payment' && (!doc || i.project_id === doc.project_id)) ?? []
  const payment = payments.find((p) => `${p.doc_id}:${p.project_id}` === paymentKey)
  const unallocated = items.data?.filter((i) => i.kind === 'unallocated') ?? []
  const docLabel = (d: (typeof docs)[number]) => (d.kind === 'bill' ? `Bill ${d.label}` : `${DOC_WORD[d.kind]}: ${d.label}`)

  const settle = usePosting(
    (key) => rpc('settle', { p_op_key: key, p_items: [{
      payment_id: payment!.doc_id, doc_id: doc!.doc_id, project_id: doc!.project_id, amount_paisa: parseNPR(amount),
    }] }),
    { onSuccess: async () => { setDone('Matched.'); setDocKey(''); setPaymentKey(''); setAmount(''); await items.refetch(); await refresh() } },
  )

  function pickDoc(key: string) {
    setDocKey(key)
    setPaymentKey('')
    setDone('')
  }
  function pickPayment(key: string) {
    setPaymentKey(key)
    const p = payments.find((x) => `${x.doc_id}:${x.project_id}` === key)
    if (p && doc) setAmount(String(Math.min(p.amount_paisa, doc.amount_paisa) / 100))
  }

  if (items.isPending) return <Card title="Match payments to bills"><Spinner /></Card>
  if (!docs.length && !unallocated.length && !done) return null

  return (
    <Card title="Match payments to bills">
      <p className="mb-3 text-sm text-subtle">Shows which bills or charges a payment cleared. It does not change the balance.</p>
      {unallocated.length > 0 && (
        <p className="mb-3 text-sm">
          {unallocated.map((u) => (
            <span key={u.doc_id} className="block">
              <Link className="text-slate underline" to={`/payments/${u.doc_id}`}>{u.label}</Link> has {formatNPR(u.amount_paisa)} not assigned to a project yet.
            </span>
          ))}
        </p>
      )}
      {docs.length > 0 && (
        <div className="flex flex-col gap-3">
          <Field label={kind === 'supplier' ? 'Bill' : 'Unpaid charge'} htmlFor="m-bill">
            <Select id="m-bill" value={docKey} onChange={(e) => pickDoc(e.target.value)}>
              <option value="">Choose what is unpaid</option>
              {docs.map((b) => (
                <option key={`${b.doc_id}:${b.project_id}`} value={`${b.doc_id}:${b.project_id}`}>
                  {docLabel(b)} · {code(b.project_id)} · owes {formatNPR(b.amount_paisa)}
                </option>
              ))}
            </Select>
          </Field>
          {doc && (
            <Field label="Paid from" htmlFor="m-pay" hint={payments.length ? undefined : 'No payment money is free for this project. Record a payment first.'}>
              <Select id="m-pay" value={paymentKey} onChange={(e) => pickPayment(e.target.value)} disabled={!payments.length}>
                <option value="">Choose a payment</option>
                {payments.map((p) => (
                  <option key={`${p.doc_id}:${p.project_id}`} value={`${p.doc_id}:${p.project_id}`}>
                    {p.label} · {formatNPR(p.amount_paisa)} free
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {doc && payment && (
            <Field label="Amount" htmlFor="m-amount"><MoneyInput id="m-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          )}
          <ErrorBanner>{settle.error && friendlyError(settle.error)}</ErrorBanner>
          {doc && payment && (
            <div><Button busy={settle.isPending} disabled={!parseNPR(amount)} onClick={() => settle.mutate()}>Match</Button></div>
          )}
        </div>
      )}
      <Status className="mt-3 text-sm text-good-ink">{done}</Status>
    </Card>
  )
}

export function Khata({ kind, partyId, projectId: fixedProject }: { kind: PartyKind; partyId: string; projectId?: string }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const [projectId, setProjectId] = useState(fixedProject ?? '')
  const khata = usePartyKhata(partyId, projectId || null, true)
  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code
  const rows = [...(khata.data ?? [])].reverse() // newest first on a phone

  return (
    <Card>
      {!fixedProject && (projectId || !!khata.data?.length) && (
        <div className="mb-3">
          <Field label="Project" htmlFor="khata-project">
            <Select id="khata-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{auth.seesAllProjects ? 'All projects (company khata)' : 'All my projects'}</option>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {khata.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void khata.refetch()}>{khata.error && friendlyError(khata.error)}</ErrorBanner>
      {khata.data?.length === 0 && <p className="text-sm text-subtle">Nothing posted yet.</p>}
      <ul>
        {rows.map((r) => {
          // Reversals of labour or expenses have no single project page; link only what opens.
          const to = r.doc_kind === 'credit' ? null : docPath(r.doc_kind, r.doc_id, { projectId: r.project_id })
          return (
            <li key={r.event_id ?? 'opening'} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
              <div className="min-w-0 text-sm">
                <div className="font-medium break-words text-ink">
                  {to ? <Link className="hover:underline" to={to}>{r.label}</Link> : r.label}
                </div>
                <div className="text-xs text-subtle">
                  <DateText value={r.business_date} display={auth.dateDisplay} />
                  {r.project_id && !projectId && ` · ${code(r.project_id) ?? ''}`}
                  {!r.project_id && r.event_type !== 'opening' && !projectId && ' · not assigned to a project'}
                  {r.reason && ` · ${r.reason}`}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <div className={r.balance_paisa > 0 ? 'text-ink' : 'text-good-ink'}>
                  {r.balance_paisa > 0 ? '+' : ''}{formatNPR(r.balance_paisa)}
                </div>
                <div className="text-xs text-subtle">Balance {formatNPR(r.running_balance_paisa)}</div>
              </div>
            </li>
          )
        })}
      </ul>
      {khata.data && khata.data.length > 0 && (
        <p className="mt-2 text-xs text-subtle">+ adds to what you owe ({PARTY[kind].charges}). − reduces it (payments, credits, reversals).</p>
      )}
    </Card>
  )
}

export function PaymentList({ kind, partyId }: { kind: PartyKind; partyId: string }) {
  const auth = useCompany()
  const payments = usePartyPayments(kind, partyId)
  return (
    <Card>
      {payments.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void payments.refetch()}>{payments.error && friendlyError(payments.error)}</ErrorBanner>
      {payments.data?.length === 0 && <p className="text-sm text-subtle">No payments.</p>}
      <ul>
        {payments.data?.map((p) => (
          <li key={p.id} className="border-b border-line last:border-0">
            <Link to={`/payments/${p.id}`} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink">{p.number} · {PAYMENT_METHODS[p.method]}</div>
                <div className="text-xs text-subtle">
                  <DateText value={p.payment_date} display={auth.dateDisplay} />{p.reference && ` · ${p.reference}`}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
                <span>{formatNPR(p.amount_paisa)}</span>
                {p.status === 'reversed' && <Badge tone="bad">Reversed</Badge>}
                {p.status === 'posted' && p.allocated_paisa < p.amount_paisa && <Badge tone="warn">Part unassigned</Badge>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <ShowMore list={payments} />
    </Card>
  )
}

/** Tabs with arrow-key movement (WAI-ARIA tabs pattern), as on the catalog page. */
export function Tabs<T extends string>({ tabs, value, onChange, label, children }: {
  tabs: Array<[T, string]>
  value: T
  onChange: (t: T) => void
  label: string
  children: ReactNode
}) {
  const ids = useId()
  const tabId = (key: T) => `${ids}-tab-${key}`
  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.findIndex(([key]) => key === value)
    const step: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }
    if (!(e.key in step)) return
    e.preventDefault()
    const [next] = tabs[(step[e.key] + tabs.length) % tabs.length]
    onChange(next)
    document.getElementById(tabId(next))?.focus()
  }
  return (
    <>
      {/* Scrolls sideways on narrow phones instead of squeezing the labels. */}
      <div className="mt-6 mb-3 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:w-fit" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map(([key, text]) => (
          <button key={key} id={tabId(key)} type="button" role="tab" aria-selected={value === key} aria-controls={`${ids}-panel`}
            tabIndex={value === key ? 0 : -1} onClick={() => onChange(key)}
            className={`min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-md px-3 sm:flex-none sm:px-4 text-sm font-medium ${value === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {text}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={tabId(value)}>{children}</div>
    </>
  )
}
