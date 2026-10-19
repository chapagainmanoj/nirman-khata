// One supplier bill. Drafts: preview, checks and posting (Accounts). Posted bills: cost and
// payable per line, settlement per project, credits and reversal (req §11, §12, §20).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments, QueuedPhotos } from '../../components/Attachments'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Field, Input, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { BILL_STATUS, billTitle, settlementLabel } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { memberName, useHeadings, useMembers, useProjects } from '../projects/api'
import { rpc, useBill, useBillPreview, useBillProjectStatus, useCredits, usePosting, useRefreshMoney } from './api'
import { canEnter, canPost, canRecordPayments } from './permissions'
import { t } from '../../lib/i18n'

const qty = (n: number | null) => (n === null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))

export function BillDetailPage() {
  const { billId = '' } = useParams()
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const bill = useBill(billId)
  // From "Save and post": the draft is saved, but posting may have been refused by a check.
  const arrived = (useLocation().state as { postError?: string; failedPhotos?: number; alreadySent?: boolean; sent?: boolean } | null) ?? {}
  const projects = useProjects(auth.companyId)
  const headings = useHeadings(auth.companyId)
  const members = useMembers(auth.companyId)
  const refresh = useRefreshMoney()
  const b = bill.data?.bill
  const isDraft = b?.status === 'draft' || b?.status === 'under_review'
  const seesAmounts = !!bill.data?.charges
  const preview = useBillPreview(billId, !!b && isDraft && seesAmounts)
  const status = useBillProjectStatus(billId, b?.status === 'posted')
  const credits = useCredits(billId, !!b && !isDraft && auth.canSeeFinance)

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['bill', billId] })]),
  })
  const post = usePosting((key) => rpc('post_bill', { p_op_key: key, p_bill: billId }), { onSuccess: () => refresh() })
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => rpc('reverse_bill', { p_op_key: key, p_bill: billId, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )

  if (bill.isPending) return <Spinner />
  if (bill.error) return <ErrorBanner onRetry={() => void bill.refetch()}>{friendlyError(bill.error)}</ErrorBanner>
  // Site staff stop seeing a bill once it goes to Accounts: say where it went, not "not found".
  if (!b && arrived.sent) {
    return (
      <>
        <EmptyState title={t('billDetail.sentToAccounts')}>
          {arrived.alreadySent ? t('billDetail.thisBillHadAlready') : t('billDetail.accountsWillCheckIt')}{' '}
          <Link className="text-slate" to="/bills/new">{t('billDetail.enterAnotherBill')}</Link>
        </EmptyState>
        {/* A photo that did not upload is kept on this phone; it can still be added to the sent bill. */}
        <div className="mt-4"><QueuedPhotos owner={{ bill_id: billId }} /></div>
      </>
    )
  }
  if (!b) return <EmptyState title={t('billDetail.billNotFound')}>{t('billDetail.itDoesNotExist')}{' '}<Link className="text-slate" to="/suppliers">{t('billDetail.suppliers')}</Link></EmptyState>

  const { charges, lines } = bill.data
  const [statusLabel, statusTone] = BILL_STATUS[b.status]
  const project = (id: string) => projects.data?.find((p) => p.id === id)
  const heading = (id: string) => headings.data?.find((h) => h.id === id)?.name
  const lineFor = (id: string) => preview.data?.lines.find((l) => l.line_id === id)
  const outstanding = status.data?.reduce((s, r) => s + r.outstanding_paisa, 0) ?? 0
  const settled = status.data?.reduce((s, r) => s + r.settled_paisa, 0) ?? 0
  const blockers = preview.data?.checks.filter((c) => c.severity !== 'warning') ?? []
  const canEdit = isDraft && ((b.status === 'draft' && b.created_by === auth.userId) || canPost(auth))
  // A photo is evidence, not money: it can still be added once the bill is sent or posted, by its
  // creator or by Accounts. Only a draft lets a photo be removed.
  const canAddPhoto = (isDraft && canEdit && canEnter(auth))
    || ((b.status === 'under_review' || b.status === 'posted') && (canPost(auth) || b.created_by === auth.userId))
  const subtotal = lines.reduce((s, l) => s + l.amount_paisa, 0)
  // Each line's share of the bill-level charges, named: "Incl. transport + VAT".
  const chargeNames = [
    charges?.transport_paisa && t('billDetail.charge.transport'), charges?.vat_paisa && t('billDetail.charge.vat'),
    charges?.discount_paisa && t('billDetail.charge.discount'),
  ].filter(Boolean).join(' + ')
  const chargesNote = chargeNames ? t('billDetail.inclChargenames', { chargeNames }) : t('billDetail.withCharges')

  return (
    <>
      <PageHeader
        title={billTitle(b.bill_no)}
        crumbs={[{ to: '/bills', label: t('billDetail.bills') }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link className="text-slate" to={`/suppliers/${b.supplier_id}`}>{b.suppliers?.name}</Link>
            <Badge tone={statusTone}>{statusLabel}</Badge>
            {b.status === 'posted' && status.data && (() => {
              const [l, t] = settlementLabel(outstanding, settled)
              return <Badge tone={t}>{l}</Badge>
            })()}
          </span>
        }
      />
      {arrived.postError && isDraft && <div className="mb-4"><Notice>{t('billDetail.savedAsADraft', { postError: arrived.postError })}</Notice></div>}
      {arrived.alreadySent && <div className="mb-4"><Notice>{t('billDetail.thisBillHadAlready')}</Notice></div>}
      {!!arrived.failedPhotos && <div className="mb-4"><Notice>{t('billDetail.theBillIsSaved')}</Notice></div>}
      {b.status === 'under_review' && !canPost(auth) && <div className="mb-4"><Notice>{t('billDetail.sentToAccountsFor')}</Notice></div>}
      {b.status === 'draft' && !canPost(auth) && b.created_by === auth.userId && (
        <div className="mb-4"><Notice>{t('billDetail.draftSendItTo')}</Notice></div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {canEdit && <ButtonLink variant="secondary" to={`/bills/${b.id}/edit`}>{t('common.edit')}</ButtonLink>}
        {b.status === 'draft' && canEdit && !canPost(auth) && (
          <Button busy={act.isPending} onClick={() => act.mutate(() => rpc('submit_bill', { p_bill: b.id }))}>{t('billDetail.sendToAccounts')}</Button>
        )}
        {isDraft && canPost(auth) && (
          <Button busy={post.isPending} disabled={!!preview.data?.allocation_error || blockers.length > 0}
            onClick={() => post.mutate()}>
            {t('billDetail.postBill')}</Button>
        )}
        {isDraft && canEdit && (
          <ConfirmButton confirmLabel={t('billDetail.deleteDraft')}
            onConfirm={() => act.mutate(async () => { await rpc('delete_bill_draft', { p_bill: b.id }); navigate(`/suppliers/${b.supplier_id}`, { replace: true }) })}>
            {t('billDetail.delete')}</ConfirmButton>
        )}
        {b.status === 'posted' && canRecordPayments(auth) && outstanding > 0 && (
          <ButtonLink to={`/payments/new?supplier=${b.supplier_id}&bill=${b.id}`}>{t('billDetail.payThisBill')}</ButtonLink>
        )}
      </div>
      <ErrorBanner>{(act.error || post.error) && friendlyError(act.error || post.error)}</ErrorBanner>

      {isDraft && preview.data && (preview.data.checks.length > 0 || preview.data.allocation_error) && (
        <Card title={t('billDetail.beforePosting')} className="mb-4">
          <ul className="flex flex-col gap-1 text-sm">
            {preview.data.allocation_error && <li className="text-danger">{preview.data.allocation_error}</li>}
            {preview.data.checks.map((c, i) => (
              <li key={i} className={c.severity === 'warning' ? 'text-subtle' : 'text-danger'}>
                {c.message}{c.severity === 'reason' && t('billDetail.addReasonOnLine')}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('billDetail.lines')} className="lg:col-span-2">
          {lines.length === 0 && <p className="text-sm text-subtle">{t('billDetail.noLinesYouCan')}</p>}
          <ul>
            {lines.map((l) => {
              const pv = lineFor(l.id)
              const cost = b.status === 'draft' || b.status === 'under_review' ? pv?.cost : l.cost_amount_paisa
              const payable = b.status === 'draft' || b.status === 'under_review' ? pv?.payable : l.payable_amount_paisa
              return (
                <li key={l.id} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium break-words text-ink">
                      {l.materials?.name ?? l.description ?? t('billDetail.charge')}
                      {l.qty !== null && <span className="font-normal text-subtle"> · {qty(l.qty)} {l.units?.code}{l.rate_paisa !== null && ` @ ${formatNPR(l.rate_paisa)}`}</span>}
                    </div>
                    <div className="text-xs text-subtle">{project(l.project_id)?.code} · {heading(l.heading_id)}</div>
                    {l.unmatched_reason && <div className="text-xs text-warn-ink">{t('billDetail.noDeliveryUnmatchedreason', { unmatchedReason: l.unmatched_reason })}</div>}
                    {l.rate_variance_reason && <div className="text-xs text-warn-ink">{t('billDetail.rateRatevariancereason', { rateVarianceReason: l.rate_variance_reason })}</div>}
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <div className="font-semibold text-ink">{formatNPR(l.amount_paisa)}</div>
                    {payable !== undefined && payable !== null && payable !== l.amount_paisa && (
                      <div className="text-xs text-subtle">{chargesNote} {formatNPR(payable)}</div>
                    )}
                    {cost !== undefined && cost !== null && cost !== payable && <div className="text-xs text-subtle">{t('billDetail.costCost', { cost: formatNPR(cost) })}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
          {charges && (
            <div className="mt-2 border-t border-line pt-2">
              <Detail label={t('billDetail.lines')}>{formatNPR(subtotal)}</Detail>
              {charges.discount_paisa > 0 && <Detail label={t('billDetail.discount')}>-{formatNPR(charges.discount_paisa)}</Detail>}
              {charges.transport_paisa > 0 && <Detail label={t('billDetail.transport')}>{formatNPR(charges.transport_paisa)}</Detail>}
              {charges.vat_paisa > 0 && <Detail label={`VAT${b.vat_treatment === 'vat_recoverable' ? t('billDetail.recoverableNotProjectCost') : ''}`}>{formatNPR(charges.vat_paisa)}</Detail>}
              <div className="flex justify-between gap-4 pt-2 text-base font-bold text-ink tabular-nums">
                <span>{t('billDetail.billTotal')}</span>
                <span>{formatNPR(charges.total_paisa ?? subtotal - charges.discount_paisa + charges.transport_paisa + charges.vat_paisa)}</span>
              </div>
            </div>
          )}
        </Card>

        <Card title={t('billDetail.bill')}>
          <Detail label={t('billDetail.billDate')}><DateText value={b.bill_date} display={auth.dateDisplay} dual /></Detail>
          {b.cost_date !== b.bill_date && <Detail label={t('billDetail.costDate')}><DateText value={b.cost_date} display={auth.dateDisplay} dual /></Detail>}
          <Detail label={t('billDetail.due')}>{b.due_date && <DateText value={b.due_date} display={auth.dateDisplay} />}</Detail>
          <Detail label={t('billDetail.enteredBy')}>{memberName(members.data, b.created_by)}</Detail>
          {b.posted_by && <Detail label={t('billDetail.postedBy')}>{memberName(members.data, b.posted_by)}</Detail>}
          <Detail label={t('billDetail.notes')}>{b.notes}</Detail>
        </Card>

        {b.status !== 'draft' && b.status !== 'under_review' && status.data && status.data.length > 0 && (
          <Card title={t('billDetail.paidSoFar')}>
            {status.data.map((r) => (
              <div key={r.project_id} className="border-b border-line py-2 text-sm last:border-0">
                <div className="font-medium text-ink">{project(r.project_id!)?.code} · {project(r.project_id!)?.name}</div>
                <Detail label={t('billDetail.owedOnThisBill')}>{formatNPR(r.payable_paisa)}</Detail>
                {r.credited_paisa > 0 && <Detail label={t('billDetail.credits')}>-{formatNPR(r.credited_paisa)}</Detail>}
                <Detail label={t('billDetail.paid')}>{formatNPR(r.settled_paisa)}</Detail>
                <div className="flex justify-between gap-4 pt-2 font-semibold text-ink tabular-nums">
                  <span>{t('billDetail.stillOwed')}</span><span>{formatNPR(r.outstanding_paisa)}</span>
                </div>
              </div>
            ))}
          </Card>
        )}

        <Card title={t('billDetail.billPhoto')}>
          <Attachments owner={{ bill_id: b.id }} canAdd={canAddPhoto} canRemove={b.status === 'draft' && canEdit} label={t('billDetail.takeBillPhoto')} />
        </Card>

        {b.status !== 'draft' && b.status !== 'under_review' && auth.canSeeFinance && !!credits.data?.length && (
          <Card title={t('billDetail.credits')} className="lg:col-span-2">
            <ul>
              {credits.data?.map((c) => (
                <CreditRow key={c.id} credit={c} billPosted={b.status === 'posted'} />
              ))}
            </ul>
            {b.status === 'posted' && canPost(auth) && <CreditForm billId={b.id} lines={lines} />}
          </Card>
        )}
      </div>

      {b.status === 'posted' && canPost(auth) && (
        <div className="mt-6 flex flex-wrap items-start gap-2">
          {credits.data?.length === 0 && <CreditForm billId={b.id} lines={lines} />}
          <ReasonButton variant="danger" title={t('billDetail.reverseThisBill')}
            hint={t('billDetail.creditsOnTheBill')}
            confirmLabel={t('billDetail.reverseBill')} busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('billDetail.reversalDate') }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            {t('billDetail.reverseBill')}</ReasonButton>
        </div>
      )}
    </>
  )
}

type Credit = NonNullable<ReturnType<typeof useCredits>['data']>[number]

function CreditRow({ credit: c, billPosted }: { credit: Credit; billPosted: boolean }) {
  const auth = useCompany()
  const refresh = useRefreshMoney()
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => rpc('reverse_credit', { p_op_key: key, p_credit: c.id, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )
  const total = c.credit_lines.reduce((s, l) => s + l.amount_paisa, 0)
  return (
    <li className="border-b border-line py-2 text-sm last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink">{c.number}{c.supplier_credit_no && ` · ${t('billDetail.supplierNo', { no: c.supplier_credit_no })}`}</div>
          <div className="text-xs text-subtle"><DateText value={c.credit_date} display={auth.dateDisplay} /> · {c.reason}</div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className="font-semibold">-{formatNPR(total)}</div>
          {c.status === 'reversed' && <Badge tone="bad">{t('billDetail.reversed')}</Badge>}
        </div>
      </div>
      {c.status === 'posted' && billPosted && canPost(auth) && (
        <div className="mt-2">
          <ReasonButton variant="ghost" title={t('billDetail.reverseThisCredit')} confirmLabel={t('billDetail.reverseCredit')} busy={reverse.isPending}
            error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('billDetail.reversalDate') }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            {t('billDetail.reverseCredit')}</ReasonButton>
        </div>
      )}
    </li>
  )
}

type Line = NonNullable<ReturnType<typeof useBill>['data']>['lines'][number]

/** Supplier credit note: lowers cost and payable when posted (req §20). */
function CreditForm({ billId, lines }: { billId: string; lines: Line[] }) {
  const auth = useCompany()
  const refresh = useRefreshMoney()
  const [open, setOpen] = useState(false)
  const [id, setId] = useState(newId)
  const [date, setDate] = useState(todayKathmandu())
  const [reason, setReason] = useState('')
  const [supplierNo, setSupplierNo] = useState('')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [returns, setReturns] = useState<Record<string, { return_line: string; qty: string }>>({})
  const [error, setError] = useState('')
  const returnLines = useReturnLinesForBill(billId, open)

  const post = usePosting(
    (key) => rpc('post_credit', { p_op_key: key, p_credit: {
      id, bill_id: billId, credit_date: date, reason, supplier_credit_no: supplierNo || null,
      lines: Object.entries(amounts).filter(([, v]) => (parseNPR(v) ?? 0) > 0).map(([bill_line_id, v]) => ({
        bill_line_id, amount_paisa: parseNPR(v),
        supplier_return_line_id: returns[bill_line_id]?.return_line || null,
        credited_qty: returns[bill_line_id]?.return_line ? Number(returns[bill_line_id].qty) : null,
      })),
    } }),
    { onSuccess: async () => { setOpen(false); setAmounts({}); setReturns({}); setReason(''); setSupplierNo(''); setId(newId()); await refresh() } },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    const any = Object.values(amounts).some((v) => (parseNPR(v) ?? 0) > 0)
    const problem = !any ? t('billDetail.enterTheCreditAmount') : !reason.trim() ? t('billDetail.giveTheReasonFor') : ''
    setError(problem)
    if (!problem) post.mutate()
  }

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>{t('billDetail.addCreditNote')}</Button>
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">{t('billDetail.creditNoteFromThe')}</div>
      {lines.map((l) => {
        const rl = returnLines.data?.filter((r) => r.bill_line_id === l.id) ?? []
        return (
          <div key={l.id} className="grid gap-2 sm:grid-cols-2">
            <Field label={`${l.materials?.name ?? l.description ?? t('billDetail.charge')} (owed ${formatNPR(l.payable_amount_paisa)})`} htmlFor={`cr-${l.id}`}>
              <MoneyInput id={`cr-${l.id}`} value={amounts[l.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })} />
            </Field>
            {rl.length > 0 && (amounts[l.id] ?? '') !== '' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('billDetail.forReturnedGoods')} htmlFor={`crr-${l.id}`}>
                  <Select id={`crr-${l.id}`} value={returns[l.id]?.return_line ?? ''}
                    onChange={(e) => setReturns({ ...returns, [l.id]: { return_line: e.target.value, qty: String(rl.find((r) => r.id === e.target.value)?.qty ?? '') } })}>
                    <option value="">{t('billDetail.notAReturn')}</option>
                    {rl.map((r) => <option key={r.id} value={r.id}>{t('billDetail.returndateQtyReturned', { returnDate: r.return_date, qty: r.qty })}</option>)}
                  </Select>
                </Field>
                {returns[l.id]?.return_line && (
                  <Field label={t('billDetail.quantityCredited')} htmlFor={`crq-${l.id}`}>
                    <Input id={`crq-${l.id}`} inputMode="decimal" value={returns[l.id].qty}
                      onChange={(e) => setReturns({ ...returns, [l.id]: { ...returns[l.id], qty: e.target.value } })} />
                  </Field>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('billDetail.creditDate')} htmlFor="cr-date"><DateInput id="cr-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label={t('billDetail.supplierSCreditNote')} htmlFor="cr-no"><Input id="cr-no" value={supplierNo} onChange={(e) => setSupplierNo(e.target.value)} /></Field>
        <Field label={t('billDetail.reason')} htmlFor="cr-reason"><Input id="cr-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{error || (post.error && friendlyError(post.error))}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={post.isPending}>{t('billDetail.postCredit')}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}

/** Returns recorded against deliveries matched to this bill's lines. */
function useReturnLinesForBill(billId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['bill', billId, 'returns'],
    enabled,
    queryFn: async () => {
      const { data: matches, error } = await supabase
        .from('bill_line_delivery_lines').select('bill_line_id, delivery_line_id, bill_lines!inner(bill_id)').eq('bill_lines.bill_id', billId)
      if (error) throw error
      if (!matches.length) return []
      const { data: rl, error: e2 } = await supabase
        .from('supplier_return_lines').select('id, qty, delivery_line_id, supplier_returns(return_date)')
        .in('delivery_line_id', matches.map((m) => m.delivery_line_id))
      if (e2) throw e2
      return rl.flatMap((r) => matches.filter((m) => m.delivery_line_id === r.delivery_line_id).map((m) => ({
        id: r.id, qty: r.qty, bill_line_id: m.bill_line_id, return_date: r.supplier_returns?.return_date ?? '',
      })))
    },
  })
}
