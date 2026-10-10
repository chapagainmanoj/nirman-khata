// One supplier bill. Drafts: preview, checks and posting (Accounts). Posted bills: cost and
// payable per line, settlement per project, credits and reversal (req §11, §12, §20).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
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

const qty = (n: number | null) => (n === null ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))

export function BillDetailPage() {
  const { billId = '' } = useParams()
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const bill = useBill(billId)
  // From "Save and post": the draft is saved, but posting may have been refused by a check.
  const arrived = (useLocation().state as { postError?: string; failedPhotos?: number } | null) ?? {}
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
  if (!b) return <EmptyState title="Bill not found">It does not exist or you cannot see it. <Link className="text-brand" to="/suppliers">Suppliers</Link></EmptyState>

  const { charges, lines } = bill.data
  const [statusLabel, statusTone] = BILL_STATUS[b.status]
  const project = (id: string) => projects.data?.find((p) => p.id === id)
  const heading = (id: string) => headings.data?.find((h) => h.id === id)?.name
  const lineFor = (id: string) => preview.data?.lines.find((l) => l.line_id === id)
  const outstanding = status.data?.reduce((s, r) => s + r.outstanding_paisa, 0) ?? 0
  const settled = status.data?.reduce((s, r) => s + r.settled_paisa, 0) ?? 0
  const blockers = preview.data?.checks.filter((c) => c.severity !== 'warning') ?? []
  const canEdit = isDraft && ((b.status === 'draft' && b.created_by === auth.userId) || canPost(auth))
  const subtotal = lines.reduce((s, l) => s + l.amount_paisa, 0)

  return (
    <>
      <PageHeader
        title={billTitle(b.bill_no)}
        crumbs={[{ to: '/bills', label: 'Bills' }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link className="text-brand" to={`/suppliers/${b.supplier_id}`}>{b.suppliers?.name}</Link>
            <Badge tone={statusTone}>{statusLabel}</Badge>
            {b.status === 'posted' && status.data && (() => {
              const [l, t] = settlementLabel(outstanding, settled)
              return <Badge tone={t}>{l}</Badge>
            })()}
          </span>
        }
      />
      {arrived.postError && isDraft && <div className="mb-4"><Notice>Saved as a draft, not posted: {arrived.postError}</Notice></div>}
      {!!arrived.failedPhotos && <div className="mb-4"><Notice>The bill is saved, but a photo did not upload. Take it again below.</Notice></div>}
      {b.status === 'under_review' && !canPost(auth) && <div className="mb-4"><Notice>Sent to Accounts for posting.</Notice></div>}
      {b.status === 'draft' && !canPost(auth) && b.created_by === auth.userId && (
        <div className="mb-4"><Notice>Draft. Send it to Accounts when the lines and photo are complete.</Notice></div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {canEdit && <ButtonLink variant="secondary" to={`/bills/${b.id}/edit`}>Edit</ButtonLink>}
        {b.status === 'draft' && canEdit && !canPost(auth) && (
          <Button busy={act.isPending} onClick={() => act.mutate(() => rpc('submit_bill', { p_bill: b.id }))}>Send to Accounts</Button>
        )}
        {isDraft && canPost(auth) && (
          <Button busy={post.isPending} disabled={!!preview.data?.allocation_error || blockers.length > 0}
            onClick={() => post.mutate()}>
            Post bill
          </Button>
        )}
        {isDraft && canEdit && (
          <ConfirmButton confirmLabel="Delete draft"
            onConfirm={() => act.mutate(async () => { await rpc('delete_bill_draft', { p_bill: b.id }); navigate(`/suppliers/${b.supplier_id}`, { replace: true }) })}>
            Delete
          </ConfirmButton>
        )}
        {b.status === 'posted' && canRecordPayments(auth) && outstanding > 0 && (
          <ButtonLink to={`/payments/new?supplier=${b.supplier_id}&bill=${b.id}`}>Pay this bill</ButtonLink>
        )}
      </div>
      <ErrorBanner>{(act.error || post.error) && friendlyError(act.error || post.error)}</ErrorBanner>

      {isDraft && preview.data && (preview.data.checks.length > 0 || preview.data.allocation_error) && (
        <Card title="Before posting" className="mb-4">
          <ul className="flex flex-col gap-1 text-sm">
            {preview.data.allocation_error && <li className="text-danger">{preview.data.allocation_error}</li>}
            {preview.data.checks.map((c, i) => (
              <li key={i} className={c.severity === 'warning' ? 'text-subtle' : 'text-danger'}>
                {c.message}{c.severity === 'reason' && ' — add a reason on the line (Edit).'}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Lines" className="lg:col-span-2">
          {lines.length === 0 && <p className="text-sm text-subtle">No lines you can see.</p>}
          <ul>
            {lines.map((l) => {
              const pv = lineFor(l.id)
              const cost = b.status === 'draft' || b.status === 'under_review' ? pv?.cost : l.cost_amount_paisa
              const payable = b.status === 'draft' || b.status === 'under_review' ? pv?.payable : l.payable_amount_paisa
              return (
                <li key={l.id} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium break-words text-ink">
                      {l.materials?.name ?? l.description ?? 'Charge'}
                      {l.qty !== null && <span className="font-normal text-subtle"> · {qty(l.qty)} {l.units?.code}{l.rate_paisa !== null && ` @ ${formatNPR(l.rate_paisa)}`}</span>}
                    </div>
                    <div className="text-xs text-subtle">{project(l.project_id)?.code} · {heading(l.heading_id)}</div>
                    {l.unmatched_reason && <div className="text-xs text-warn-ink">No delivery: {l.unmatched_reason}</div>}
                    {l.rate_variance_reason && <div className="text-xs text-warn-ink">Rate: {l.rate_variance_reason}</div>}
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums">
                    <div className="font-semibold text-ink">{formatNPR(l.amount_paisa)}</div>
                    {payable !== undefined && payable !== null && payable !== l.amount_paisa && (
                      <div className="text-xs text-subtle">With charges {formatNPR(payable)}</div>
                    )}
                    {cost !== undefined && cost !== null && cost !== payable && <div className="text-xs text-subtle">Cost {formatNPR(cost)}</div>}
                  </div>
                </li>
              )
            })}
          </ul>
          {charges && (
            <div className="mt-2 border-t border-line pt-2">
              <Detail label="Lines">{formatNPR(subtotal)}</Detail>
              {charges.discount_paisa > 0 && <Detail label="Discount">-{formatNPR(charges.discount_paisa)}</Detail>}
              {charges.transport_paisa > 0 && <Detail label="Transport">{formatNPR(charges.transport_paisa)}</Detail>}
              {charges.vat_paisa > 0 && <Detail label={`VAT${b.vat_treatment === 'vat_recoverable' ? ' (recoverable, not project cost)' : ''}`}>{formatNPR(charges.vat_paisa)}</Detail>}
              <Detail label="Bill total">
                {formatNPR(charges.total_paisa ?? subtotal - charges.discount_paisa + charges.transport_paisa + charges.vat_paisa)}
              </Detail>
            </div>
          )}
        </Card>

        <Card title="Bill">
          <Detail label="Bill date"><DateText value={b.bill_date} display={auth.dateDisplay} dual /></Detail>
          {b.cost_date !== b.bill_date && <Detail label="Cost date"><DateText value={b.cost_date} display={auth.dateDisplay} dual /></Detail>}
          <Detail label="Due">{b.due_date && <DateText value={b.due_date} display={auth.dateDisplay} />}</Detail>
          <Detail label="Entered by">{memberName(members.data, b.created_by)}</Detail>
          {b.posted_by && <Detail label="Posted by">{memberName(members.data, b.posted_by)}</Detail>}
          <Detail label="Notes">{b.notes}</Detail>
        </Card>

        <Card title="Bill photo">
          <Attachments owner={{ bill_id: b.id }} canAdd={isDraft && canEdit && canEnter(auth)} canRemove={b.status === 'draft' && canEdit} label="Take bill photo" />
        </Card>

        {b.status !== 'draft' && b.status !== 'under_review' && status.data && status.data.length > 0 && (
          <Card title="Paid so far">
            {status.data.map((r) => (
              <div key={r.project_id} className="border-b border-line py-2 text-sm last:border-0">
                <div className="font-medium text-ink">{project(r.project_id!)?.code} · {project(r.project_id!)?.name}</div>
                <Detail label="Owed on this bill">{formatNPR(r.payable_paisa)}</Detail>
                {r.credited_paisa > 0 && <Detail label="Credits">-{formatNPR(r.credited_paisa)}</Detail>}
                <Detail label="Matched to payments">{formatNPR(r.settled_paisa)}</Detail>
                <Detail label="Still owed">{formatNPR(r.outstanding_paisa)}</Detail>
              </div>
            ))}
          </Card>
        )}

        {b.status !== 'draft' && b.status !== 'under_review' && auth.canSeeFinance && (
          <Card title="Credits" className="lg:col-span-2">
            {credits.data?.length === 0 && <p className="text-sm text-subtle">No credit notes.</p>}
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
        <div className="mt-6">
          <ReasonButton variant="danger" title="Reverse this bill"
            hint="Credits on the bill are reversed with it, and payments matched to it become advance."
            confirmLabel="Reverse bill" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            Reverse bill
          </ReasonButton>
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
          <div className="font-medium text-ink">{c.number}{c.supplier_credit_no && ` · supplier no. ${c.supplier_credit_no}`}</div>
          <div className="text-xs text-subtle"><DateText value={c.credit_date} display={auth.dateDisplay} /> · {c.reason}</div>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <div className="font-semibold">-{formatNPR(total)}</div>
          {c.status === 'reversed' && <Badge tone="bad">Reversed</Badge>}
        </div>
      </div>
      {c.status === 'posted' && billPosted && canPost(auth) && (
        <div className="mt-2">
          <ReasonButton variant="ghost" title="Reverse this credit" confirmLabel="Reverse credit" busy={reverse.isPending}
            error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            Reverse credit
          </ReasonButton>
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
    const problem = !any ? 'Enter the credit amount on at least one line.' : !reason.trim() ? 'Give the reason for the credit.' : ''
    setError(problem)
    if (!problem) post.mutate()
  }

  if (!open) return <Button variant="secondary" className="mt-3" onClick={() => setOpen(true)}>Add credit note</Button>
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">Credit note from the supplier</div>
      {lines.map((l) => {
        const rl = returnLines.data?.filter((r) => r.bill_line_id === l.id) ?? []
        return (
          <div key={l.id} className="grid gap-2 sm:grid-cols-2">
            <Field label={`${l.materials?.name ?? l.description ?? 'Charge'} (owed ${formatNPR(l.payable_amount_paisa)})`} htmlFor={`cr-${l.id}`}>
              <MoneyInput id={`cr-${l.id}`} value={amounts[l.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })} />
            </Field>
            {rl.length > 0 && (amounts[l.id] ?? '') !== '' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="For returned goods" htmlFor={`crr-${l.id}`}>
                  <Select id={`crr-${l.id}`} value={returns[l.id]?.return_line ?? ''}
                    onChange={(e) => setReturns({ ...returns, [l.id]: { return_line: e.target.value, qty: String(rl.find((r) => r.id === e.target.value)?.qty ?? '') } })}>
                    <option value="">Not a return</option>
                    {rl.map((r) => <option key={r.id} value={r.id}>{r.return_date}: {r.qty} returned</option>)}
                  </Select>
                </Field>
                {returns[l.id]?.return_line && (
                  <Field label="Quantity credited" htmlFor={`crq-${l.id}`}>
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
        <Field label="Credit date" htmlFor="cr-date"><DateInput id="cr-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label="Supplier's credit note number" htmlFor="cr-no"><Input id="cr-no" value={supplierNo} onChange={(e) => setSupplierNo(e.target.value)} /></Field>
        <Field label="Reason" htmlFor="cr-reason"><Input id="cr-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{error || (post.error && friendlyError(post.error))}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={post.isPending}>Post credit</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
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
