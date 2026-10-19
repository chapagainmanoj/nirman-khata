// Pieces every party page shares: balance, opening balance, matching payments to what is
// owed, khata and payment list (req §12.2, §12.3, §20). Supplier, subcontractor, crew and
// payee pages compose these.
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, ButtonLink, Card, Detail, ErrorBanner, Field, Input, Select, Spinner, Status } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { parseLoginId } from '../../lib/login-id'
import { useProjects } from '../projects/api'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { usePartyBalances, usePartyKhata, usePartyOpenItems, usePartyOpeningBalance, usePartyPayments } from './api'
import { ShowMore } from '../../components/ShowMore'
import { RefundCard } from '../refunds/RefundCard'
import { DOC_WORD, docPath, PARTY, type PartyKind } from './kinds'

/** One line of the balance statement: + adds to what we owe, − reduces it (as in the khata). */
function StatementRow({ label, paisa }: { label: ReactNode; paisa: number }) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd className="text-right font-medium text-ink tabular-nums">{paisa > 0 ? '+' : ''}{formatNPR(paisa)}</dd>
    </>
  )
}

/** The balance card's headline: the amount on its own line, what it means under it. */
function BalanceHeadline({ paisa }: { paisa: number }) {
  if (paisa === 0) return <p className="mb-3 text-lg text-subtle">Nothing to pay</p>
  return (
    <div className="mb-3">
      <div className="text-2xl font-semibold text-ink tabular-nums">{formatNPR(Math.abs(paisa))}</div>
      <div className={`text-sm font-medium ${paisa > 0 ? 'text-warn-ink' : 'text-good-ink'}`}>
        {paisa > 0 ? 'Baki · still to pay' : 'They hold · peski or overpaid'}
      </div>
    </div>
  )
}

/** Positive = we owe (baki), negative = the party holds our money (peski or overpaid). */
export function BalanceText({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-subtle">Nothing to pay</span>
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-ink">{formatNPR(Math.abs(paisa))}</span>{' '}
      <span className={paisa > 0 ? 'text-warn-ink' : 'text-good-ink'}>{paisa > 0 ? 'to pay (baki)' : 'they hold (peski or overpaid)'}</span>
    </span>
  )
}

/** What is owed either way. `children` adds detail under the totals (the supplier page's split by project). */
export function BalanceCard({ kind, partyId, children }: { kind: PartyKind; partyId: string; children?: ReactNode }) {
  const auth = useCompany()
  const balances = usePartyBalances(auth.companyId, kind, true)
  const b = balances.data?.find((x) => x.party_id === partyId)
  const ob = usePartyOpeningBalance(partyId, true)
  const fresh = !!b && b.charged_paisa === 0 && b.paid_paisa === 0 && b.balance_paisa === 0 && !ob.isPending && !ob.data
  // The opening balance counts once it is in the ledger (cutover today or earlier), company level only.
  const opening = b?.company_level && ob.data && ob.data.cutover_date <= todayKathmandu() ? ob.data.amount_paisa : 0
  const unassigned = (b?.unallocated_paisa ?? 0) - opening
  return (
    <Card title={kind === 'supplier' ? 'To pay' : 'Balance'}>
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
          <BalanceHeadline paisa={b.balance_paisa} />
          {/* How the balance adds up. The opening balance sits in the ledger as a non-cash,
              no-project row, so take it out of Tirnu parne and "not given to a project". */}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            {opening !== 0 && (
              <StatementRow label={<>Opening balance, <DateText value={ob.data!.cutover_date} display={auth.dateDisplay} /></>} paisa={opening} />
            )}
            {/* Khata words (GLOSSARY.md): Tirnu parne, Tireko, Baki. */}
            <StatementRow label={`Tirnu parne (${PARTY[kind].charges})`} paisa={b.charged_paisa - opening} />
            <StatementRow label="Tireko" paisa={-b.paid_paisa} />
          </dl>
          {opening !== 0 && auth.seesAllProjects && <OpeningBalance kind={kind} partyId={partyId} inStatement />}
          {children}
          {b.company_level && unassigned < 0 && <Detail label="Paid, not yet given to a project">{formatNPR(-unassigned)}</Detail>}
          {b.company_level && unassigned > 0 && <Detail label="Owed from before, on no project">{formatNPR(unassigned)}</Detail>}
          {!b.company_level && <p className="mt-2 text-xs text-subtle">Only your projects are included.</p>}
        </>
      )}
      {auth.seesAllProjects && opening === 0 && <OpeningBalance kind={kind} partyId={partyId} prompt={fresh} />}
      <RefundCard kind={kind} partyId={partyId} embedded />
    </Card>
  )
}

/** `inStatement`: the note under a balance statement. `plain`: a line on its own, with no rule above. */
export function OpeningBalance({ kind, partyId, prompt, inStatement, plain }: { kind: PartyKind; partyId: string; prompt?: boolean; inStatement?: boolean; plain?: boolean }) {
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
      <div className={`flex flex-wrap items-center justify-between gap-x-2 text-sm ${inStatement || plain ? '' : 'mt-3 border-t border-line pt-3'}`}>
        {inStatement ? (
          <span className="min-w-0 text-xs text-subtle">Opening balance note: <span className="break-words text-ink">{ob.data.note}</span></span>
        ) : (
          <span>
            Opening balance <BalanceText paisa={ob.data.amount_paisa} /> on <DateText value={ob.data.cutover_date} display={auth.dateDisplay} />
            <span className="block text-xs text-subtle">{ob.data.note}</span>
          </span>
        )}
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
            <option value="advance">The {who} holds our money (peski or overpaid)</option>
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
  // Only when there is something to match: unpaid items and payment money free for them, or a
  // payment still to assign to a project. Otherwise the form would only say "record a payment first".
  const freeMoney = items.data?.some((i) => i.kind === 'payment') ?? false
  if (!(docs.length && freeMoney) && !unallocated.length && !done) return null

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
        <div className="mb-3 sm:max-w-sm">
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
                  {!projectId && r.project_ids.length > 0 && ` · ${r.project_ids.map(code).filter(Boolean).join(', ')}`}
                  {!projectId && r.project_ids.length === 0 && r.event_type !== 'opening' && ' · not assigned to a project'}
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
      <div className="mt-6 mb-3 flex gap-1 overflow-x-auto rounded-lg bg-track p-1 sm:w-fit" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
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

/**
 * Under a party's name: one tap to call or message (how most orders and reminders happen), then
 * quiet links to what is looked up rather than acted on (details, rates), each on its own page.
 */
export function ContactRow({ phone, links }: { phone: string | null; links: Array<[to: string, label: string] | false> }) {
  const shown = links.filter((l) => l !== false)
  const mobile = phone ? parseLoginId(phone) : null
  const whatsApp = mobile?.kind === 'phone' ? `https://wa.me/${mobile.phone.slice(1)}` : null
  if (!phone && !shown.length) return null
  return (
    <div className="-mt-2 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
      {phone && <ButtonLink variant="secondary" to={`tel:${phone}`} reloadDocument>Call {phone}</ButtonLink>}
      {whatsApp && <ButtonLink variant="secondary" to={whatsApp} reloadDocument target="_blank" rel="noreferrer">WhatsApp</ButtonLink>}
      {/* The links wrap as a group, so a phone does not leave one alone on a line. */}
      {shown.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-3">
          {shown.map(([to, label]) => (
            <Link key={to} to={to} className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-slate underline underline-offset-2">{label}</Link>
          ))}
        </span>
      )}
    </div>
  )
}
