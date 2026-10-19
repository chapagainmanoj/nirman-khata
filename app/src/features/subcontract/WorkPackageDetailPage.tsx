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
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canManageSuppliers, canPost, canRecordPayments } from '../supply/permissions'
import { useCharges, usePackageFigures, useWorkPackage } from './api'

type Charge = NonNullable<ReturnType<typeof useCharges>['data']>[number]

export function WorkPackageDetailPage() {
  const { packageId = '' } = useParams()
  const auth = useCompany()
  const pkg = useWorkPackage(packageId)
  const figures = usePackageFigures(pkg.data?.project_id ?? '', auth.canSeeFinance)
  const charges = useCharges(packageId, auth.canSeeFinance)
  const [claiming, setClaiming] = useState(false)
  // Back from paying, when what they hold paid it all (pay_subcontractor made no payment).
  const paidFromHeld = (useLocation().state as { paidFromHeld?: number } | null)?.paidFromHeld

  if (pkg.isPending) return <Spinner />
  if (pkg.error) return <ErrorBanner onRetry={() => void pkg.refetch()}>{friendlyError(pkg.error)}</ErrorBanner>
  if (!pkg.data) return <EmptyState title="Work package not found">It does not exist or you are not assigned to its project.</EmptyState>
  const w = pkg.data
  const f = figures.data?.find((x) => x.work_package_id === w.id)
  const [statusLabel, statusTone] = PACKAGE_STATUS[w.status]
  const unit = w.units?.code

  return (
    <>
      <PageHeader
        title={w.scope}
        crumbs={[{ to: '/parties', label: 'Parties' }, { to: '/subcontractors', label: 'Subcontractors' }]}
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
            {canManageSuppliers(auth) && <ButtonLink variant="secondary" to={`/work/${w.id}/edit`}>Edit</ButtonLink>}
            {canRecordPayments(auth) && auth.canSeeFinance && (
              <ButtonLink to={`/payments/new?subcontractor=${w.subcontractor_id}&package=${w.id}`}>Pay peski or bill</ButtonLink>
            )}
          </div>
        }
      />
      {!!paidFromHeld && <div className="mb-4"><Notice>{formatNPR(paidFromHeld)} taken from money they hold. Nothing paid in cash.</Notice></div>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Work">
          <Detail label="Progress">{Number(w.progress_pct)}%</Detail>
          <Detail label="Heading">{w.cost_headings?.name}</Detail>
          <Detail label="Priced">{w.rate_basis === 'rate' ? `Rate per ${w.units?.name ?? ''}` : 'Lump sum'}</Detail>
          {w.terms?.quantity != null && <Detail label="Expected quantity">{Number(w.terms.quantity).toLocaleString('en-IN')} {unit}</Detail>}
          <Detail label="Planned">{(w.planned_start || w.planned_end) && <><DateText value={w.planned_start} display={auth.dateDisplay} />{w.planned_end && <> to <DateText value={w.planned_end} display={auth.dateDisplay} /></>}</>}</Detail>
          <Detail label="Notes">{w.notes}</Detail>
        </Card>
        {auth.canSeeFinance && (
          <Card title="Money">
            {figures.isPending && <Spinner />}
            <ErrorBanner onRetry={() => void figures.refetch()}>{figures.error && friendlyError(figures.error)}</ErrorBanner>
            {f && (
              <>
                <Detail label="Agreed value">{formatNPR(f.agreed_value_paisa)}</Detail>
                {w.terms?.rate_paisa != null && <Detail label="Rate">{formatNPR(w.terms.rate_paisa)} per {unit}</Detail>}
                <Detail label="Work done (cost)">
                  {formatNPR(f.approved_paisa)}
                  {f.agreed_value_paisa ? <span className="text-subtle"> · {percent(f.approved_paisa, f.agreed_value_paisa)}</span> : null}
                </Detail>
                {f.pending_claims_paisa > 0 && <Detail label="Bills waiting">{formatNPR(f.pending_claims_paisa)}</Detail>}
                <Detail label="Paid">{formatNPR(f.paid_paisa)}</Detail>
                <Detail label="Balance"><BalanceText paisa={f.balance_paisa} /></Detail>
                <Detail label="Remaining value">{formatNPR(f.remaining_value_paisa)}</Detail>
                {f.remaining_value_paisa !== null && f.remaining_value_paisa < 0 && (
                  <p className="mt-2 text-sm text-warn-ink">Approved work is more than the agreed value.</p>
                )}
              </>
            )}
          </Card>
        )}
      </div>

      {auth.canSeeFinance && (
        <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">Work done (bills)</h2>
            {!claiming && <Button variant="secondary" onClick={() => setClaiming(true)}>Add bill</Button>}
          </div>
          {claiming && <BillForm packageId={w.id} subcontractorId={w.subcontractor_id} onDone={() => setClaiming(false)} />}
          {charges.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void charges.refetch()}>{charges.error && friendlyError(charges.error)}</ErrorBanner>
          {charges.data?.length === 0 && !claiming && (
            <p className="text-sm text-subtle">No bills yet. Add the subcontractor's bill or running measurement when it comes.</p>
          )}
          <ul className="grid gap-3 lg:grid-cols-2">
            {charges.data?.map((c) => <ChargeItem key={c.id} c={c} subcontractorId={w.subcontractor_id} />)}
          </ul>
        </section>
      )}

      {auth.canSeeFinance && (
        <Card title="Agreement and measurements" className="mt-6">
          <Attachments owner={{ work_package_id: w.id }} canAdd={canManageSuppliers(auth)} label="Add agreement or measurement photo" />
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
      await queryClient.invalidateQueries({ queryKey: ['charges', packageId] })
      await queryClient.invalidateQueries({ queryKey: ['package-figures'] })
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
      <div className="font-semibold text-ink">New bill</div>
      <p className="text-sm text-subtle">
        {approveNow
          ? 'Saving adds this work to project cost and to what you owe them, from the bill date.'
          : 'Accounts approves it before it counts as cost.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={approveNow ? 'Amount' : 'Amount billed'} htmlFor="cl-amount" hint={approveNow ? 'What you agree to pay for this work' : undefined}>
          <MoneyInput id="cl-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Bill date" htmlFor="cl-date"><DateInput id="cl-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label="Bill number" htmlFor="cl-no" hint="Optional, e.g. RA-1"><Input id="cl-no" value={claimNo} onChange={(e) => setClaimNo(e.target.value)} /></Field>
        <Field label="Work done" htmlFor="cl-desc" hint="Optional, e.g. 1,600 sq.ft ground floor walls"><Input id="cl-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
      <div className="flex flex-wrap gap-2">
        {approveNow && canRecordPayments(auth) && (
          <Button type="button" busy={save.isPending && save.variables} disabled={!parseNPR(amount) || save.isPending} onClick={(e) => submit(e, true)}>Save and pay</Button>
        )}
        <Button type="submit" variant={approveNow && canRecordPayments(auth) ? 'secondary' : 'primary'} busy={save.isPending && !save.variables}
          disabled={!parseNPR(amount) || save.isPending}>
          {approveNow ? 'Save, pay later' : 'Save bill'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

function ChargeItem({ c, subcontractorId }: { c: Charge; subcontractorId: string }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const refresh = useRefreshMoney()
  const [approving, setApproving] = useState(false)
  const [label, tone] = CHARGE_STATUS[c.status]
  const after = async () => {
    await queryClient.invalidateQueries({ queryKey: ['charges', c.work_package_id] })
    await queryClient.invalidateQueries({ queryKey: ['package-figures'] })
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

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-ink">{c.claim_no ? `Bill ${c.claim_no}` : 'Bill'}</div>
          <div className="text-xs text-subtle"><DateText value={c.charge_date} display={auth.dateDisplay} />{c.description && ` · ${c.description}`}</div>
        </div>
        <span className="flex gap-1">
          <Badge tone={tone}>{label}</Badge>
          {c.status === 'approved' && <Badge tone={paidTone}>{paidLabel}</Badge>}
        </span>
      </div>
      <div className="mt-2 text-sm">
        <Detail label="Billed">{formatNPR(c.claimed_paisa)}</Detail>
        {/* Approved as billed on the bill date (one-step entry): the two lines would only repeat it. */}
        {c.approved_paisa != null && c.approved_paisa !== c.claimed_paisa && <Detail label="Approved (cost)">{formatNPR(c.approved_paisa)}</Detail>}
        {c.approved_date && c.approved_date !== c.charge_date && <Detail label="Approved on"><DateText value={c.approved_date} display={auth.dateDisplay} /></Detail>}
        {c.status === 'approved' && <Detail label="Paid">{formatNPR(c.settled_paisa)}</Detail>}
        {/* Part paid: what is left, as on bills and labour. */}
        {c.status === 'approved' && outstanding > 0 && c.settled_paisa > 0 && <Detail label="Still due">{formatNPR(outstanding)}</Detail>}
        {c.decision_note && <Detail label={c.status === 'rejected' ? 'Reason' : 'Note'}>{c.decision_note}</Detail>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {c.status === 'draft' && canPost(auth) && !approving && <Button onClick={() => setApproving(true)}>Approve</Button>}
        {c.status === 'approved' && outstanding > 0 && canRecordPayments(auth) && (
          <ButtonLink variant="secondary" to={`/payments/new?subcontractor=${subcontractorId}&doc=${c.id}`}>Pay this</ButtonLink>
        )}
        {c.status === 'draft' && (c.created_by === auth.userId || canPost(auth)) && (
          <ConfirmButton confirmLabel="Delete bill" disabled={remove.isPending} onConfirm={() => remove.mutate()}>Delete</ConfirmButton>
        )}
      </div>
      {approving && <ApproveForm c={c} onDone={async () => { setApproving(false); await after() }} onCancel={() => setApproving(false)} />}
      {c.status === 'draft' && canPost(auth) && !approving && (
        <div className="mt-2">
          <ReasonButton variant="ghost" title="Reject this bill" confirmLabel="Reject" busy={reject.isPending}
            error={reject.error && friendlyError(reject.error)} onConfirm={(reason) => reject.mutate(reason)}>
            Reject
          </ReasonButton>
        </div>
      )}
      {c.status === 'approved' && canPost(auth) && (
        <div className="mt-2">
          <ReasonButton variant="ghost" title="Reverse this approved work" hint="Cost goes back down; money paid for it is peski again, or overpaid."
            confirmLabel="Reverse" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            Reverse
          </ReasonButton>
        </div>
      )}
      <ErrorBanner>{(remove.error || reject.error) && friendlyError(remove.error || reject.error)}</ErrorBanner>
      <div className="mt-2">
        <Attachments owner={{ charge_id: c.id }} canAdd={c.status === 'draft'} canRemove={c.status === 'draft'} label="Add bill photo" />
      </div>
    </li>
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
      <p className="text-sm text-subtle">Approving makes this project cost from the approval date. Payments are recorded separately.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount approved" htmlFor={`ap-amount-${c.id}`}><MoneyInput id={`ap-amount-${c.id}`} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Approval date" htmlFor={`ap-date-${c.id}`}><DateInput id={`ap-date-${c.id}`} value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
        <Field label={less ? 'Why less than billed?' : 'Note'} htmlFor={`ap-note-${c.id}`} hint={less ? 'Required, e.g. measured 1,600 sq.ft, not 1,800' : 'Optional'}>
          <Input id={`ap-note-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <ErrorBanner>{approve.error && friendlyError(approve.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={approve.isPending} disabled={!approved || (less && !note.trim())}>Approve {approved ? formatNPR(approved) : ''}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
