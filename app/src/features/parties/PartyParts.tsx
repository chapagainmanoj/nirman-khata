// Pieces every party page shares: balance, opening balance, matching payments to what is
// owed, khata and payment list (req §12.2, §12.3, §20). Supplier, subcontractor, crew and
// payee pages compose these.
import { useState, type FormEvent, type ReactNode } from 'react'
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
import { useRefreshMoney } from '../../data/refresh'
import { rpc, usePosting } from '../../data/rpc'
import { usePartyBalances, usePartyKhata, usePartyOpenItems, usePartyOpeningBalance, usePartyPayments } from './api'
import { ShowMore } from '../../components/ShowMore'
import { RefundCard } from '../refunds/RefundCard'
import { DOC_WORD, docPath, PARTY, type PartyKind } from './kinds'
import { t } from '../../lib/i18n'

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
  if (paisa === 0) return <p className="mb-3 text-lg text-subtle">{t('partyParts.nothingToPay')}</p>
  return (
    <div className="mb-3">
      <div className="text-2xl font-semibold text-ink tabular-nums">{formatNPR(Math.abs(paisa))}</div>
      <div className={`text-sm font-medium ${paisa > 0 ? 'text-warn-ink' : 'text-good-ink'}`}>
        {paisa > 0 ? t('partyParts.bakiStillToPay') : t('partyParts.theyHoldPeskiOr')}
      </div>
    </div>
  )
}

/** Positive = we owe (baki), negative = the party holds our money (peski or overpaid). */
export function BalanceText({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-subtle">{t('partyParts.nothingToPay')}</span>
  return (
    <span className="tabular-nums">
      <span className="font-semibold text-ink">{formatNPR(Math.abs(paisa))}</span>{' '}
      <span className={paisa > 0 ? 'text-warn-ink' : 'text-good-ink'}>{paisa > 0 ? t('partyParts.toPayBaki') : t('partyParts.theyHold')}</span>
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
    <Card title={kind === 'supplier' ? t('partyParts.toPay') : t('partyParts.balance')}>
      {balances.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void balances.refetch()}>{balances.error && friendlyError(balances.error)}</ErrorBanner>
      {fresh && (
        <p className="text-sm text-subtle">
          {t('partyParts.no')}{' '}{kind === 'supplier' ? 'bills' : PARTY[kind].charges} {t('partyParts.orPaymentsYet')}{auth.seesAllProjects && t('partyParts.owedThisValueFrom', { value: PARTY[kind].one.toLowerCase() })}
        </p>
      )}
      {b && !fresh && (
        <>
          <BalanceHeadline paisa={b.balance_paisa} />
          {/* How the balance adds up. The opening balance sits in the ledger as a non-cash,
              no-project row, so take it out of Tirnu parne and "not given to a project". */}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            {opening !== 0 && (
              <StatementRow label={<>{t('partyParts.openingBalance')}{' '}<DateText value={ob.data!.cutover_date} display={auth.dateDisplay} /></>} paisa={opening} />
            )}
            {/* Khata words (GLOSSARY.md): Tirnu parne, Tireko, Baki. */}
            <StatementRow label={t('partyParts.tirnuParneCharges', { charges: PARTY[kind].charges })} paisa={b.charged_paisa - opening} />
            <StatementRow label={t('partyParts.tireko')} paisa={-b.paid_paisa} />
          </dl>
          {opening !== 0 && auth.seesAllProjects && <OpeningBalance kind={kind} partyId={partyId} inStatement />}
          {children}
          {b.company_level && unassigned < 0 && <Detail label={t('partyParts.paidNotYetGiven')}>{formatNPR(-unassigned)}</Detail>}
          {b.company_level && unassigned > 0 && <Detail label={t('partyParts.owedFromBeforeOn')}>{formatNPR(unassigned)}</Detail>}
          {!b.company_level && <p className="mt-2 text-xs text-subtle">{t('partyParts.onlyYourProjectsAre')}</p>}
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
          <span className="min-w-0 text-xs text-subtle">{t('partyParts.openingBalanceNote')}{' '}<span className="break-words text-ink">{ob.data.note}</span></span>
        ) : (
          <span>
            {t('partyParts.openingBalance2')}{' '}<BalanceText paisa={ob.data.amount_paisa} /> {t('partyParts.on')}{' '}<DateText value={ob.data.cutover_date} display={auth.dateDisplay} />
            <span className="block text-xs text-subtle">{ob.data.note}</span>
          </span>
        )}
        <ReasonButton variant="ghost" title={t('partyParts.correctTheOpeningBalance')} hint={t('partyParts.itIsReversedAnd')}
          confirmLabel={t('partyParts.reverseIt')} busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
          withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('partyParts.reversalDate') }}
          onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
          {t('partyParts.correct')}</ReasonButton>
      </div>
    )
  }
  if (!open) {
    return <Button variant={prompt ? 'secondary' : 'ghost'} className={prompt ? 'mt-2' : 'mt-2 -ml-2'} onClick={() => setOpen(true)}>{t('partyParts.setOpeningBalance')}</Button>
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <p className="text-sm text-subtle">{t('partyParts.whatWasOwedWhen')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('partyParts.amount')} htmlFor="ob-amount"><MoneyInput id="ob-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('partyParts.whoOwes')} htmlFor="ob-dir">
          <Select id="ob-dir" value={owed ? 'owe' : 'advance'} onChange={(e) => setOwed(e.target.value === 'owe')}>
            <option value="owe">{t('partyParts.weOweTheWho', { who })}</option>
            <option value="advance">{t('partyParts.theWhoHoldsOur', { who })}</option>
          </Select>
        </Field>
        <Field label={t('partyParts.cutoverDate')} htmlFor="ob-date"><DateInput id="ob-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label={t('common.note')} htmlFor="ob-note" hint={t('partyParts.eg.fromTheOld')}><Input id="ob-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{set.error && friendlyError(set.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={set.isPending} disabled={!parseNPR(amount) || !note.trim()}>{t('common.save')}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
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
  const docLabel = (d: (typeof docs)[number]) => (d.kind === 'bill' ? t('partyParts.billLabel', { label: d.label }) : `${DOC_WORD[d.kind]}: ${d.label}`)

  const settle = usePosting(
    (key) => rpc('settle', { p_op_key: key, p_items: [{
      payment_id: payment!.doc_id, doc_id: doc!.doc_id, project_id: doc!.project_id, amount_paisa: parseNPR(amount),
    }] }),
    { onSuccess: async () => { setDone(t('partyParts.matched')); setDocKey(''); setPaymentKey(''); setAmount(''); await items.refetch(); await refresh() } },
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

  if (items.isPending) return <Card title={t('partyParts.matchPaymentsToBills')}><Spinner /></Card>
  // Only when there is something to match: unpaid items and payment money free for them, or a
  // payment still to assign to a project. Otherwise the form would only say "record a payment first".
  const freeMoney = items.data?.some((i) => i.kind === 'payment') ?? false
  if (!(docs.length && freeMoney) && !unallocated.length && !done) return null

  return (
    <Card title={t('partyParts.matchPaymentsToBills')}>
      <p className="mb-3 text-sm text-subtle">{t('partyParts.showsWhichBillsOr')}</p>
      {unallocated.length > 0 && (
        <p className="mb-3 text-sm">
          {unallocated.map((u) => (
            <span key={u.doc_id} className="block">
              <Link className="text-slate underline" to={`/payments/${u.doc_id}`}>{u.label}</Link> {t('partyParts.hasAmountNotAssigned', { amount: formatNPR(u.amount_paisa) })}</span>
          ))}
        </p>
      )}
      {docs.length > 0 && (
        <div className="flex flex-col gap-3">
          <Field label={kind === 'supplier' ? t('partyParts.bill') : t('partyParts.unpaidCharge')} htmlFor="m-bill">
            <Select id="m-bill" value={docKey} onChange={(e) => pickDoc(e.target.value)}>
              <option value="">{t('partyParts.chooseWhatIsUnpaid')}</option>
              {docs.map((b) => (
                <option key={`${b.doc_id}:${b.project_id}`} value={`${b.doc_id}:${b.project_id}`}>
                  {t('partyParts.bProjectidOwesAmount', { b: docLabel(b), projectId: code(b.project_id), amount: formatNPR(b.amount_paisa) })}</option>
              ))}
            </Select>
          </Field>
          {doc && (
            <Field label={t('partyParts.paidFrom')} htmlFor="m-pay" hint={payments.length ? undefined : t('partyParts.noPaymentMoneyIs')}>
              <Select id="m-pay" value={paymentKey} onChange={(e) => pickPayment(e.target.value)} disabled={!payments.length}>
                <option value="">{t('partyParts.chooseAPayment')}</option>
                {payments.map((p) => (
                  <option key={`${p.doc_id}:${p.project_id}`} value={`${p.doc_id}:${p.project_id}`}>
                    {t('partyParts.labelAmountFree', { label: p.label, amount: formatNPR(p.amount_paisa) })}</option>
                ))}
              </Select>
            </Field>
          )}
          {doc && payment && (
            <Field label={t('partyParts.amount')} htmlFor="m-amount"><MoneyInput id="m-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          )}
          <ErrorBanner>{settle.error && friendlyError(settle.error)}</ErrorBanner>
          {doc && payment && (
            <div><Button busy={settle.isPending} disabled={!parseNPR(amount)} onClick={() => settle.mutate()}>{t('partyParts.match')}</Button></div>
          )}
        </div>
      )}
      <Status className="mt-3 text-sm text-good-ink">{done}</Status>
    </Card>
  )
}

/** fixedProject: always that project, no choice. startProject: opens on it (the page's project), still changeable. */
// noPicker: the page chooses the project (a subcontractor's project chips), so the khata has no picker of its own.
export function Khata({ kind, partyId, projectId: fixedProject, startProject, noPicker }: { kind: PartyKind; partyId: string; projectId?: string; startProject?: string | null; noPicker?: boolean }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const [projectId, setProjectId] = useState(fixedProject ?? startProject ?? '')
  const khata = usePartyKhata(partyId, projectId || null, true)
  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code
  const rows = [...(khata.data ?? [])].reverse() // newest first on a phone

  return (
    <Card>
      {!fixedProject && !noPicker && (projectId || !!khata.data?.length) && (
        <div className="mb-3 sm:max-w-sm">
          <Field label={t('partyParts.project')} htmlFor="khata-project">
            <Select id="khata-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{auth.seesAllProjects ? t('partyParts.allProjectsCompanyKhata') : t('partyParts.allMyProjects')}</option>
              {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {khata.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void khata.refetch()}>{khata.error && friendlyError(khata.error)}</ErrorBanner>
      {khata.data?.length === 0 && <p className="text-sm text-subtle">{t('partyParts.nothingPostedYet')}</p>}
      <ul>
        {rows.map((r) => {
          // Reversals of labour or expenses have no single project page; link only what opens.
          const to = r.doc_kind === 'credit' ? null : docPath(r.doc_kind, r.doc_id, { projectId: r.project_id })
          return (
            <li key={r.event_id ?? 'opening'} className="relative flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
              <div className="min-w-0 text-sm">
                <div className="font-medium break-words text-ink">
                  {/* The whole row opens the document: a bare label is too small to tap. */}
                  {to ? <Link className="hover:underline after:absolute after:inset-0" to={to}>{r.label}</Link> : r.label}
                </div>
                <div className="text-xs text-subtle">
                  <DateText value={r.business_date} display={auth.dateDisplay} />
                  {!projectId && r.project_ids.length > 0 && ` · ${r.project_ids.map(code).filter(Boolean).join(', ')}`}
                  {!projectId && r.project_ids.length === 0 && r.event_type !== 'opening' && ` · ${t('partyParts.notAssignedToProject')}`}
                  {r.reason && ` · ${r.reason}`}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <div className={r.balance_paisa > 0 ? 'text-ink' : 'text-good-ink'}>
                  {r.balance_paisa > 0 ? '+' : ''}{formatNPR(r.balance_paisa)}
                </div>
                <div className="text-xs text-subtle">{t('partyParts.balanceRunningbalance', { runningBalance: formatNPR(r.running_balance_paisa) })}</div>
              </div>
            </li>
          )
        })}
      </ul>
      {khata.data && khata.data.length > 0 && (
        <p className="mt-2 text-xs text-subtle">{t('partyParts.addsToWhatYou', { charges: PARTY[kind].charges })}</p>
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
      {payments.data?.length === 0 && <p className="text-sm text-subtle">{t('partyParts.noPayments')}</p>}
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
                {p.status === 'reversed' && <Badge tone="bad">{t('partyParts.reversed')}</Badge>}
                {p.status === 'posted' && p.allocated_paisa < p.amount_paisa && <Badge tone="warn">{t('partyParts.partUnassigned')}</Badge>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <ShowMore list={payments} />
    </Card>
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
      {phone && <ButtonLink variant="secondary" to={`tel:${phone}`} reloadDocument>{t('partyParts.callPhone', { phone })}</ButtonLink>}
      {whatsApp && <ButtonLink variant="secondary" to={whatsApp} reloadDocument target="_blank" rel="noreferrer">{t('partyParts.whatsapp')}</ButtonLink>}
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
