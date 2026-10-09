// One supplier: contact, balance, khata, bills, payments, and matching payments to bills.
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, ButtonLink, Card, Detail, EmptyState, ErrorBanner, Field, Input, PageHeader, Select, Spinner, Status } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { BILL_STATUS, PAYMENT_METHODS, settlementLabel } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { useProjects } from '../projects/api'
import {
  rpc, useBills, useKhata, useOpenItems, useOpeningBalance, usePayments, usePosting, useRefreshMoney,
  useSupplierBalances, useSuppliers,
} from './api'
import { canEnter, canManageSuppliers, canRecordPayments } from './permissions'
import { BalanceText, SupplierForm } from './SuppliersPage'

type Tab = 'khata' | 'bills' | 'payments'

export function SupplierDetailPage() {
  const { supplierId = '' } = useParams()
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Tab>(auth.canSeeFinance ? 'khata' : 'bills')

  const ids = useId()
  const tabId = (key: Tab) => `${ids}-tab-${key}`
  if (suppliers.isPending) return <Spinner />
  if (suppliers.error) return <ErrorBanner onRetry={() => void suppliers.refetch()}>{friendlyError(suppliers.error)}</ErrorBanner>
  const s = suppliers.data.find((x) => x.id === supplierId)
  if (!s) return <EmptyState title="Supplier not found"><Link className="text-brand" to="/suppliers">Back to suppliers</Link></EmptyState>

  const tabs: Array<[Tab, string]> = auth.canSeeFinance
    ? [['khata', 'Khata'], ['bills', 'Bills'], ['payments', 'Payments']]
    : [['bills', 'My bill drafts']]

  // Arrow keys move between tabs (WAI-ARIA tabs pattern), as on the catalog page.
  function onKeyDown(e: KeyboardEvent) {
    const i = tabs.findIndex(([key]) => key === tab)
    const step: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }
    if (!(e.key in step)) return
    e.preventDefault()
    const [next] = tabs[(step[e.key] + tabs.length) % tabs.length]
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <>
      <PageHeader
        title={s.name}
        subtitle={s.categories.join(' · ') || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEnter(auth) && <ButtonLink variant="secondary" to={`/slips/new?supplier=${s.id}`}>New slip</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant="secondary" to={`/bills/new?supplier=${s.id}`}>Enter bill</ButtonLink>}
            {canRecordPayments(auth) && <ButtonLink to={`/payments/new?supplier=${s.id}`}>Record payment</ButtonLink>}
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {editing ? (
          <div className="lg:col-span-2"><SupplierForm supplier={s} onDone={() => setEditing(false)} /></div>
        ) : (
          <Card title="Details" actions={canManageSuppliers(auth) && <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
            <Detail label="Contact">{s.contact_person}</Detail>
            <Detail label="Phone">{s.phone && <a className="text-brand" href={`tel:${s.phone}`}>{s.phone}</a>}</Detail>
            <Detail label="Address">{s.address}</Detail>
            <Detail label="PAN / VAT">{s.pan_vat}</Detail>
            <Detail label="Payment terms">{s.payment_terms}</Detail>
          </Card>
        )}
        {auth.canSeeFinance && <BalanceCard supplierId={s.id} />}
        {auth.canSeeFinance && canRecordPayments(auth) && <MatchCard supplierId={s.id} />}
      </div>

      <div className="mt-6 mb-3 flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Supplier records" onKeyDown={onKeyDown}>
        {tabs.map(([key, label]) => (
          <button key={key} id={tabId(key)} type="button" role="tab" aria-selected={tab === key} aria-controls={`${ids}-panel`}
            tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
            className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${tab === key ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={tabId(tab)}>
        {tab === 'khata' && <Khata supplierId={s.id} />}
        {tab === 'bills' && <BillList supplierId={s.id} />}
        {tab === 'payments' && <PaymentList supplierId={s.id} />}
      </div>
    </>
  )
}

function BalanceCard({ supplierId }: { supplierId: string }) {
  const auth = useCompany()
  const balances = useSupplierBalances(auth.companyId, true)
  const b = balances.data?.find((x) => x.supplier_id === supplierId)
  return (
    <Card title="Balance">
      {balances.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void balances.refetch()}>{balances.error && friendlyError(balances.error)}</ErrorBanner>
      {b && (
        <>
          <div className="mb-2 text-lg"><BalanceText paisa={b.balance_paisa} /></div>
          <Detail label="Bills and charges">{formatNPR(b.charged_paisa)}</Detail>
          <Detail label="Paid">{formatNPR(b.paid_paisa)}</Detail>
          {b.company_level && <Detail label="Not yet assigned to a project">{formatNPR(b.unallocated_paisa)}</Detail>}
          {!b.company_level && <p className="mt-2 text-xs text-subtle">Only your projects are included.</p>}
        </>
      )}
      {auth.seesAllProjects && <OpeningBalance supplierId={supplierId} />}
    </Card>
  )
}

function OpeningBalance({ supplierId }: { supplierId: string }) {
  const auth = useCompany()
  const ob = useOpeningBalance(supplierId, true)
  const refresh = useRefreshMoney()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [owed, setOwed] = useState(true)
  const [date, setDate] = useState(todayKathmandu())
  const [note, setNote] = useState('')
  const set = usePosting(
    (key) => rpc('set_opening_balance', {
      p_op_key: key, p_supplier: supplierId, p_cutover_date: date, p_amount_paisa: (parseNPR(amount) ?? 0) * (owed ? 1 : -1), p_note: note,
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
    return <Button variant="ghost" className="mt-2" onClick={() => setOpen(true)}>Set opening balance</Button>
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <p className="text-sm text-subtle">What was owed when you started using NirmanKhata. It is not project cost.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" htmlFor="ob-amount"><MoneyInput id="ob-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Who owes" htmlFor="ob-dir">
          <Select id="ob-dir" value={owed ? 'owe' : 'advance'} onChange={(e) => setOwed(e.target.value === 'owe')}>
            <option value="owe">We owe the supplier (baki)</option>
            <option value="advance">Supplier holds our advance (peski)</option>
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

/** Match money already paid to bills (req §12.3: refines allocation, never adds cash). */
function MatchCard({ supplierId }: { supplierId: string }) {
  const auth = useCompany()
  const items = useOpenItems(supplierId, true)
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [billKey, setBillKey] = useState('')
  const [paymentKey, setPaymentKey] = useState('')
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState('')

  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code ?? ''
  const bills = items.data?.filter((i) => i.kind === 'bill') ?? []
  const bill = bills.find((b) => `${b.doc_id}:${b.project_id}` === billKey)
  const payments = items.data?.filter((i) => i.kind === 'payment' && (!bill || i.project_id === bill.project_id)) ?? []
  const payment = payments.find((p) => `${p.doc_id}:${p.project_id}` === paymentKey)
  const unallocated = items.data?.filter((i) => i.kind === 'unallocated') ?? []

  const settle = usePosting(
    (key) => rpc('settle', { p_op_key: key, p_items: [{
      payment_id: payment!.doc_id, bill_id: bill!.doc_id, project_id: bill!.project_id, amount_paisa: parseNPR(amount),
    }] }),
    { onSuccess: async () => { setDone('Matched.'); setBillKey(''); setPaymentKey(''); setAmount(''); await items.refetch(); await refresh() } },
  )

  function pickBill(key: string) {
    setBillKey(key)
    setPaymentKey('')
    setDone('')
  }
  function pickPayment(key: string) {
    setPaymentKey(key)
    const p = payments.find((x) => `${x.doc_id}:${x.project_id}` === key)
    if (p && bill) setAmount(String(Math.min(p.amount_paisa, bill.amount_paisa) / 100))
  }

  if (items.isPending) return <Card title="Match payments to bills"><Spinner /></Card>
  if (!bills.length && !unallocated.length && !done) return null

  return (
    <Card title="Match payments to bills">
      <p className="mb-3 text-sm text-subtle">Shows which bills a payment cleared. It does not change the balance.</p>
      {unallocated.length > 0 && (
        <p className="mb-3 text-sm">
          {unallocated.map((u) => (
            <span key={u.doc_id} className="block">
              <Link className="text-brand underline" to={`/payments/${u.doc_id}`}>{u.label}</Link> has {formatNPR(u.amount_paisa)} not assigned to a project yet.
            </span>
          ))}
        </p>
      )}
      {bills.length > 0 && (
        <div className="flex flex-col gap-3">
          <Field label="Bill" htmlFor="m-bill">
            <Select id="m-bill" value={billKey} onChange={(e) => pickBill(e.target.value)}>
              <option value="">Choose an unpaid bill</option>
              {bills.map((b) => (
                <option key={`${b.doc_id}:${b.project_id}`} value={`${b.doc_id}:${b.project_id}`}>
                  Bill {b.label} · {code(b.project_id)} · owes {formatNPR(b.amount_paisa)}
                </option>
              ))}
            </Select>
          </Field>
          {bill && (
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
          {bill && payment && (
            <Field label="Amount" htmlFor="m-amount"><MoneyInput id="m-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          )}
          <ErrorBanner>{settle.error && friendlyError(settle.error)}</ErrorBanner>
          {bill && payment && (
            <div><Button busy={settle.isPending} disabled={!parseNPR(amount)} onClick={() => settle.mutate()}>Match</Button></div>
          )}
        </div>
      )}
      <Status className="mt-3 text-sm text-good-ink">{done}</Status>
    </Card>
  )
}

function Khata({ supplierId }: { supplierId: string }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const [projectId, setProjectId] = useState('')
  const khata = useKhata(supplierId, projectId || null, true)
  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code
  const rows = [...(khata.data ?? [])].reverse() // newest first on a phone

  return (
    <Card>
      <div className="mb-3">
        <Field label="Project" htmlFor="khata-project">
          <Select id="khata-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{auth.seesAllProjects ? 'All projects (company khata)' : 'All my projects'}</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
      </div>
      {khata.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void khata.refetch()}>{khata.error && friendlyError(khata.error)}</ErrorBanner>
      {khata.data?.length === 0 && <p className="text-sm text-subtle">Nothing posted yet.</p>}
      <ul>
        {rows.map((r) => {
          const to = r.bill_id ? `/bills/${r.bill_id}` : r.payment_id ? `/payments/${r.payment_id}` : null
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
        <p className="mt-2 text-xs text-subtle">+ adds to what you owe (bills). − reduces it (payments, credits, reversals).</p>
      )}
    </Card>
  )
}

function BillList({ supplierId }: { supplierId: string }) {
  const auth = useCompany()
  const bills = useBills({ supplierId })
  return (
    <Card>
      {bills.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void bills.refetch()}>{bills.error && friendlyError(bills.error)}</ErrorBanner>
      {bills.data?.length === 0 && <p className="text-sm text-subtle">No bills.</p>}
      <ul>
        {bills.data?.map((b) => {
          const [label, tone] = BILL_STATUS[b.status]
          const outstanding = b.payable_paisa - b.credited_paisa - b.settled_paisa
          const [paidLabel, paidTone] = settlementLabel(outstanding, b.settled_paisa)
          return (
            <li key={b.id} className="border-b border-line last:border-0">
              <Link to={`/bills/${b.id}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-ink">Bill {b.bill_no}</div>
                  <div className="text-xs text-subtle"><DateText value={b.bill_date} display={auth.dateDisplay} /></div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
                  <span>{formatNPR(b.total_paisa ?? (b.status === 'posted' ? b.payable_paisa : b.lines_paisa))}</span>
                  <span className="flex gap-1">
                    <Badge tone={tone}>{label}</Badge>
                    {b.status === 'posted' && <Badge tone={paidTone}>{paidLabel}</Badge>}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function PaymentList({ supplierId }: { supplierId: string }) {
  const auth = useCompany()
  const payments = usePayments({ supplierId })
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
    </Card>
  )
}
