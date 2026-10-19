// One work package (req §13): agreed value, approved cost, paid, payable or peski, and
// remaining value; work done, as bills (claims) from the subcontractor, and their approval.
// Approval creates cost; peski is cash paid, never cost (acceptance #7). Accounts and Admin add a
// bill and approve it in one step, and can go straight on to paying it; others save a draft.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Field, Input, Notice, PageHeader, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { CHARGE_STATUS, PACKAGE_STATUS, settlementLabel } from '../../lib/labels'
import { formatNPR, paisaToInput, parseNPR, percent } from '../../lib/money'
import { BalanceText } from '../parties/PartyParts'
import { useRefreshMoney } from '../../data/refresh'
import { rpc, usePosting } from '../../data/rpc'
import { canManageSuppliers, canPost, canRecordPayments } from '../../data/permissions'
import { useCharges, usePackageFigures, useWorkPackage } from './api'
import { t } from '../../lib/i18n'
import { refresh as refreshData } from '../../data/refresh'

type Charge = NonNullable<ReturnType<typeof useCharges>['data']>[number]

export function WorkPackageDetailPage() {
  const { packageId = '' } = useParams()
  const auth = useCompany()
  const pkg = useWorkPackage(packageId)
  const figures = usePackageFigures(pkg.data?.project_id ?? '', auth.canSeeFinance)
  const charges = useCharges(packageId, auth.canSeeFinance)
  const [claiming, setClaiming] = useState(false)
  // "Add bill" sits in the header; the form opens in the bills section, which is below the cards on a phone.
  const bills = useRef<HTMLElement>(null)
  const addBill = () => {
    setClaiming(true)
    requestAnimationFrame(() => bills.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  // Back from paying, when what they hold paid it all (pay_subcontractor made no payment).
  const paidFromHeld = (useLocation().state as { paidFromHeld?: number } | null)?.paidFromHeld

  if (pkg.isPending) return <Spinner />
  if (pkg.error) return <ErrorBanner onRetry={() => void pkg.refetch()}>{friendlyError(pkg.error)}</ErrorBanner>
  if (!pkg.data) return <EmptyState title={t('workPackageDetail.workPackageNotFound')}>{t('workPackageDetail.itDoesNotExist')}</EmptyState>
  const w = pkg.data
  const f = figures.data?.find((x) => x.work_package_id === w.id)
  const [statusLabel, statusTone] = PACKAGE_STATUS[w.status]
  const unit = w.units?.code
  // Paid directly (GLOSSARY: Direct Payment): each payment is the work done, so paying is the main
  // action and bills are added only if they still have drafts here.
  const direct = w.subcontractors?.pays_by === 'direct'
  const pays = canRecordPayments(auth) && auth.canSeeFinance
  const hasDrafts = !!charges.data?.some((c) => c.status === 'draft')
  const showAddBill = auth.canSeeFinance && !claiming && (!direct || hasDrafts)

  return (
    <>
      <PageHeader
        title={w.scope}
        crumbs={[{ to: '/parties', label: t('workPackageDetail.parties') }, { to: '/subcontractors', label: t('workPackageDetail.subcontractors') }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link className="text-slate" to={`/subcontractors/${w.subcontractor_id}`}>{w.subcontractors?.name}</Link>
            <span>·</span>
            <Link className="text-slate" to={`/projects/${w.project_id}`}>{w.projects?.code}</Link>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageSuppliers(auth) && <ButtonLink variant="secondary" to={`/work/${w.id}/edit`}>{t('common.edit')}</ButtonLink>}
            {pays && (
              <ButtonLink variant={direct ? 'primary' : 'secondary'} to={`/payments/new?subcontractor=${w.subcontractor_id}&package=${w.id}`}>
                {direct ? t('workPackageDetail.payForWork') : t('workPackageDetail.recordPayment')}</ButtonLink>
            )}
            {showAddBill && <Button variant={direct ? 'secondary' : 'primary'} onClick={addBill}>{t('workPackageDetail.addBill')}</Button>}
          </div>
        }
      />
      {!!paidFromHeld && <div className="mb-4"><Notice>{t('workPackageDetail.paidfromheldTakenFromMoney', { paidFromHeld: formatNPR(paidFromHeld) })}</Notice></div>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('workPackageDetail.work')}>
          <Detail label={t('workPackageDetail.progress')}>{Number(w.progress_pct)}%</Detail>
          <Detail label={t('workPackageDetail.heading')}>{w.cost_headings?.name}</Detail>
          <Detail label={t('workPackageDetail.priced')}>{w.rate_basis === 'rate' ? t('workPackageDetail.ratePerValue', { value: w.units?.name ?? '' }) : t('workPackageDetail.lumpSum')}</Detail>
          {w.terms?.quantity != null && <Detail label={t('workPackageDetail.expectedQuantity')}>{Number(w.terms.quantity).toLocaleString('en-IN')} {unit}</Detail>}
          <Detail label={t('workPackageDetail.planned')}>{(w.planned_start || w.planned_end) && <><DateText value={w.planned_start} display={auth.dateDisplay} />{w.planned_end && <> {t('workPackageDetail.to')}{' '}<DateText value={w.planned_end} display={auth.dateDisplay} /></>}</>}</Detail>
          <Detail label={t('workPackageDetail.notes')}>{w.notes}</Detail>
        </Card>
        {auth.canSeeFinance && (
          <Card title={t('workPackageDetail.money')}>
            {figures.isPending && <Spinner />}
            <ErrorBanner onRetry={() => void figures.refetch()}>{figures.error && friendlyError(figures.error)}</ErrorBanner>
            {f && (
              <>
                <Detail label={t('workPackageDetail.agreedValue')}>{formatNPR(f.agreed_value_paisa)}</Detail>
                {w.terms?.rate_paisa != null && <Detail label={t('workPackageDetail.rate')}>{t('workPackageDetail.ratePerUnit', { rate: formatNPR(w.terms.rate_paisa), unit })}</Detail>}
                <Detail label={t('workPackageDetail.workDoneCost')}>
                  {formatNPR(f.approved_paisa)}
                  {f.agreed_value_paisa ? <span className="text-subtle"> · {percent(f.approved_paisa, f.agreed_value_paisa)}</span> : null}
                </Detail>
                {f.pending_claims_paisa > 0 && <Detail label={t('workPackageDetail.billsWaiting')}>{formatNPR(f.pending_claims_paisa)}</Detail>}
                <Detail label={t('workPackageDetail.paid')}>{formatNPR(f.paid_paisa)}</Detail>
                <Detail label={t('workPackageDetail.balance')}><BalanceText paisa={f.balance_paisa} /></Detail>
                <Detail label={t('workPackageDetail.remainingValue')}>{formatNPR(f.remaining_value_paisa)}</Detail>
                {f.remaining_value_paisa !== null && f.remaining_value_paisa < 0 && (
                  <p className="mt-2 text-sm text-warn-ink">{t('workPackageDetail.approvedWorkIsMore')}</p>
                )}
              </>
            )}
          </Card>
        )}
      </div>

      {auth.canSeeFinance && (
        <section ref={bills} className="mt-6 scroll-mt-20">
          <h2 className="mb-2 text-base font-semibold text-ink">{direct ? t('workPackageDetail.workDone') : t('workPackageDetail.workDoneBills')}</h2>
          {claiming && <BillForm packageId={w.id} subcontractorId={w.subcontractor_id} onDone={() => setClaiming(false)} />}
          {charges.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void charges.refetch()}>{charges.error && friendlyError(charges.error)}</ErrorBanner>
          {charges.data?.length === 0 && !claiming && (
            <p className="text-sm text-subtle">{direct ? t('workPackageDetail.nothingPaidYet') : t('workPackageDetail.noBillsYetAdd')}</p>
          )}
          {!!charges.data?.length && (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th scope="col" className="py-2 pr-3 pl-4 font-medium">{t('workPackageDetail.bill')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('workPackageDetail.billed')}</th>
                    <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">{t('workPackageDetail.paid')}</th>
                    <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">{t('workPackageDetail.status')}</th>
                    <th scope="col" className="py-2 pr-4"><span className="sr-only">{t('workPackageDetail.actions')}</span></th>
                  </tr>
                </thead>
                {charges.data.map((c) => <ChargeItem key={c.id} c={c} subcontractorId={w.subcontractor_id} />)}
              </table>
            </div>
          )}
        </section>
      )}

      {auth.canSeeFinance && (
        <Card title={t('workPackageDetail.agreementAndMeasurements')} className="mt-6">
          <Attachments owner={{ work_package_id: w.id }} canAdd={canManageSuppliers(auth)} label={t('workPackageDetail.addAgreementOrMeasurement')} />
        </Card>
      )}
    </>
  )
}

/**
 * A bill (claim) from the subcontractor. Accounts and Admin approve it as they save it, for the
 * whole amount (to approve less, enter what was agreed), and "Save and pay" goes on to the payment
 * form with this bill ticked, where peski is used first. Others save it for Accounts to approve.
 * Retry-safe: the bill keeps its id and the approval its op_key while the form is open.
 */
function BillForm({ packageId, subcontractorId, onDone }: { packageId: string; subcontractorId: string; onDone: () => void }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney()
  const navigate = useNavigate()
  const [id] = useState(newId)
  const [opKey] = useState(newId)
  // Once saved, a retry goes straight to the approval: an approval that went through with its
  // answer lost has made the bill no longer a draft, and the same op_key returns its result.
  const saved = useRef(false)
  const [date, setDate] = useState(todayKathmandu())
  const [claimNo, setClaimNo] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const approveNow = canPost(auth)
  const save = useMutation({
    mutationFn: async (pay: boolean) => {
      const saveDraft = () => rpc('save_charge_claim', { p_charge: {
        id, work_package_id: packageId, charge_date: date, claim_no: claimNo, description: description.trim() || null,
        claimed_paisa: parseNPR(amount),
      } })
      if (!saved.current) {
        await saveDraft()
        saved.current = approveNow
      }
      if (approveNow) {
        await rpc('approve_charge', { p_op_key: opKey, p_charge: id, p_approved_paisa: parseNPR(amount)!, p_date: date }).catch((e) => {
          // The server said no (a code), so nothing was approved: save the corrected bill again on retry.
          if ((e as { code?: string }).code) saved.current = false
          throw e
        })
      }
      return pay
    },
    onSuccess: async (pay) => {
      await refreshData(queryClient, 'work')
      if (approveNow) await refresh()
      if (pay) navigate(`/payments/new?subcontractor=${subcontractorId}&package=${packageId}&doc=${id}`)
      else onDone()
    },
  })
  function submit(e: FormEvent, pay = false) {
    e.preventDefault()
    if (parseNPR(amount)) save.mutate(pay)
  }
  return (
    <form onSubmit={(e) => submit(e)} className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="font-semibold text-ink">{t('workPackageDetail.newBill')}</div>
      <p className="text-sm text-subtle">
        {approveNow
          ? t('workPackageDetail.savingAddsThisWork')
          : t('workPackageDetail.accountsApprovesItBefore')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={approveNow ? t('workPackageDetail.amount') : t('workPackageDetail.amountBilled')} htmlFor="cl-amount" hint={approveNow ? t('workPackageDetail.whatYouAgreeTo') : undefined}>
          <MoneyInput id="cl-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('workPackageDetail.billDate')} htmlFor="cl-date"><DateInput id="cl-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label={t('workPackageDetail.billNumber')} htmlFor="cl-no" hint={t('workPackageDetail.optionalEGRa')}><Input id="cl-no" value={claimNo} onChange={(e) => setClaimNo(e.target.value)} /></Field>
        <Field label={t('workPackageDetail.workDone')} htmlFor="cl-desc" hint={t('workPackageDetail.optionalEG1')}><Input id="cl-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
      <div className="flex flex-wrap gap-2">
        {approveNow && canRecordPayments(auth) && (
          <Button type="button" busy={save.isPending && save.variables} disabled={!parseNPR(amount) || save.isPending} onClick={(e) => submit(e, true)}>{t('workPackageDetail.saveAndPay')}</Button>
        )}
        <Button type="submit" variant={approveNow && canRecordPayments(auth) ? 'secondary' : 'primary'} busy={save.isPending && !save.variables}
          disabled={!parseNPR(amount) || save.isPending}>
          {approveNow ? t('workPackageDetail.savePayLater') : t('workPackageDetail.saveBill')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}

/**
 * One bill as a table row: number and date, billed, paid, status, and Pay or Approve. "More" opens
 * a row under it with the rest: approval details, reject, reverse, delete and photos.
 */
function ChargeItem({ c, subcontractorId }: { c: Charge; subcontractorId: string }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney()
  const [approving, setApproving] = useState(false)
  const [open, setOpen] = useState(false)
  const [label, tone] = CHARGE_STATUS[c.status]
  const after = async () => {
    await refreshData(queryClient, 'work')
    await refresh()
  }
  const reject = useMutation({ mutationFn: (reason: string) => rpc('reject_charge', { p_charge: c.id, p_reason: reason }), onSuccess: after })
  const remove = useMutation({ mutationFn: () => rpc('delete_charge_draft', { p_charge: c.id }), onSuccess: after })
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => rpc('reverse_cost_entry', { p_op_key: key, p_doc: c.id, p_date: a.date, p_reason: a.reason }),
    { onSuccess: after },
  )
  const outstanding = (c.approved_paisa ?? 0) - c.settled_paisa
  const [paidLabel, paidTone] = settlementLabel(outstanding, c.settled_paisa)
  const approved = c.status === 'approved'
  const badges = (
    <span className="flex flex-wrap gap-1">
      <Badge tone={tone}>{label}</Badge>
      {approved && <Badge tone={paidTone}>{paidLabel}</Badge>}
    </span>
  )
  const link = 'inline-flex min-h-11 min-w-11 [@media(pointer:fine)]:min-h-8 items-center text-xs font-semibold'

  return (
    <tbody className="border-b border-line last:border-0">
      <tr className="align-top">
        <td className="py-2 pr-3 pl-4">
          <div className="font-medium text-ink">{c.claim_no ? t('workPackageDetail.billClaimno', { claimNo: c.claim_no }) : t('workPackageDetail.bill')}</div>
          <div className="text-xs text-subtle"><DateText value={c.charge_date} display={auth.dateDisplay} />{c.description && ` · ${c.description}`}</div>
          {/* Phone: the status and paid columns move here. */}
          <div className="mt-1 sm:hidden">{badges}</div>
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatNPR(c.claimed_paisa)}
          {/* Approved as billed (one-step entry): the second figure would only repeat it. */}
          {c.approved_paisa != null && c.approved_paisa !== c.claimed_paisa && (
            <div className="text-xs text-subtle">{t('workPackageDetail.approvedCost')} {formatNPR(c.approved_paisa)}</div>
          )}
          {approved && <div className="text-xs text-subtle sm:hidden">{t('workPackageDetail.paid')} {formatNPR(c.settled_paisa)}</div>}
        </td>
        <td className="hidden py-2 pr-3 text-right tabular-nums sm:table-cell">
          {approved && formatNPR(c.settled_paisa)}
          {/* Part paid: what is left, as on bills and labour. */}
          {approved && outstanding > 0 && c.settled_paisa > 0 && <div className="text-xs text-subtle">{t('workPackageDetail.stillDue')} {formatNPR(outstanding)}</div>}
        </td>
        <td className="hidden py-2 pr-3 sm:table-cell">{badges}</td>
        <td className="py-2 pr-4 text-right whitespace-nowrap">
          {approved && outstanding > 0 && canRecordPayments(auth) && (
            <div><Link to={`/payments/new?subcontractor=${subcontractorId}&doc=${c.id}`} className={`${link} text-brand hover:underline`}>{t('workPackageDetail.payThis')}</Link></div>
          )}
          {c.status === 'draft' && canPost(auth) && !approving && (
            <div><button type="button" className={`${link} text-brand hover:underline`} onClick={() => { setApproving(true); setOpen(true) }}>{t('workPackageDetail.approve')}</button></div>
          )}
          <div>
            <button type="button" className={`${link} text-slate hover:underline`} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? t('workPackageDetail.less') : t('workPackageDetail.more')}</button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            <div className="rounded-lg bg-muted p-3 text-sm">
              {c.approved_date && c.approved_date !== c.charge_date && <Detail label={t('workPackageDetail.approvedOn')}><DateText value={c.approved_date} display={auth.dateDisplay} /></Detail>}
              {c.decision_note && <Detail label={c.status === 'rejected' ? t('workPackageDetail.reason') : t('common.note')}>{c.decision_note}</Detail>}
              {approving && <ApproveForm c={c} onDone={async () => { setApproving(false); await after() }} onCancel={() => setApproving(false)} />}
              <div className="flex flex-wrap gap-2">
                {c.status === 'draft' && canPost(auth) && !approving && (
                  <ReasonButton variant="ghost" title={t('workPackageDetail.rejectThisBill')} confirmLabel={t('workPackageDetail.reject')} busy={reject.isPending}
                    error={reject.error && friendlyError(reject.error)} onConfirm={(reason) => reject.mutate(reason)}>
                    {t('workPackageDetail.reject')}</ReasonButton>
                )}
                {c.status === 'draft' && (c.created_by === auth.userId || canPost(auth)) && (
                  <ConfirmButton confirmLabel={t('workPackageDetail.deleteBill')} disabled={remove.isPending} onConfirm={() => remove.mutate()}>{t('workPackageDetail.delete')}</ConfirmButton>
                )}
                {approved && canPost(auth) && (
                  <ReasonButton variant="ghost" title={t('workPackageDetail.reverseThisApprovedWork')} hint={t('workPackageDetail.costGoesBackDown')}
                    confirmLabel={t('workPackageDetail.reverse')} busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
                    withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('workPackageDetail.reversalDate') }}
                    onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
                    {t('workPackageDetail.reverse')}</ReasonButton>
                )}
              </div>
              <ErrorBanner>{(remove.error || reject.error) && friendlyError(remove.error || reject.error)}</ErrorBanner>
              <div className="mt-2">
                <Attachments owner={{ charge_id: c.id }} canAdd={c.status === 'draft'} canRemove={c.status === 'draft'} label={t('workPackageDetail.addBillPhoto')} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  )
}

function ApproveForm({ c, onDone, onCancel }: { c: Charge; onDone: () => unknown; onCancel: () => void }) {
  const auth = useCompany()
  const [amount, setAmount] = useState(paisaToInput(c.claimed_paisa))
  const [date, setDate] = useState(todayKathmandu())
  const [note, setNote] = useState('')
  const approved = parseNPR(amount)
  const less = approved !== null && approved < c.claimed_paisa
  const approve = usePosting(
    (key) => rpc('approve_charge', { p_op_key: key, p_charge: c.id, p_approved_paisa: approved!, p_date: date, p_note: note.trim() || undefined }),
    { onSuccess: onDone },
  )
  function submit(e: FormEvent) {
    e.preventDefault()
    if (approved && (!less || note.trim())) approve.mutate()
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <p className="text-sm text-subtle">{t('workPackageDetail.approvingMakesThisProject')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('workPackageDetail.amountApproved')} htmlFor={`ap-amount-${c.id}`}><MoneyInput id={`ap-amount-${c.id}`} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('workPackageDetail.approvalDate')} htmlFor={`ap-date-${c.id}`}><DateInput id={`ap-date-${c.id}`} value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label={less ? t('workPackageDetail.whyLessThanBilled') : t('common.note')} htmlFor={`ap-note-${c.id}`} hint={less ? t('workPackageDetail.requiredEGMeasured') : t('common.optional')}>
          <Input id={`ap-note-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ErrorBanner>{approve.error && friendlyError(approve.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={approve.isPending} disabled={!approved || (less && !note.trim())}>{t('workPackageDetail.approveValue', { value: approved ? formatNPR(approved) : '' })}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}
