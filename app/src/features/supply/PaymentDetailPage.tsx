// One payment: how it is split across projects, which bills it cleared, proof photo,
// allocation changes and reversal (req §12.3, §20).
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, Card, Detail, EmptyState, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { memberName, useMembers, useProjects } from '../projects/api'
import { rpc, usePayment, usePosting, useRefreshMoney } from './api'
import { canPost, canRecordPayments } from './permissions'

export function PaymentDetailPage() {
  const { paymentId = '' } = useParams()
  const auth = useCompany()
  const payment = usePayment(paymentId)
  const projects = useProjects(auth.companyId)
  const members = useMembers(auth.companyId)
  const refresh = useRefreshMoney()
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => rpc('reverse_payment', { p_op_key: key, p_payment: paymentId, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )
  const unsettle = usePosting(
    (key, a: { bill: string; project: string; amount: number; reason: string }) => rpc('unsettle', {
      p_op_key: key, p_payment: paymentId, p_bill: a.bill, p_project: a.project, p_amount_paisa: a.amount, p_reason: a.reason,
    }),
    { onSuccess: () => refresh() },
  )

  if (payment.isPending) return <Spinner />
  if (payment.error) return <ErrorBanner onRetry={() => void payment.refetch()}>{friendlyError(payment.error)}</ErrorBanner>
  const { payment: p, allocations, settlements } = payment.data
  if (!p) {
    return <EmptyState title="Payment not found">It does not exist, or part of it is for projects you cannot see.</EmptyState>
  }

  const project = (id: string) => projects.data?.find((x) => x.id === id)
  const byProject = [...new Set(allocations.map((a) => a.project_id))]
    .map((id) => ({ id, amount: allocations.filter((a) => a.project_id === id).reduce((s, a) => s + a.amount_paisa, 0) }))
    .filter((r) => r.amount !== 0)
  const matched = Object.values(settlements.reduce<Record<string, { bill_id: string; bill_no: string; project_id: string; amount: number }>>((acc, s) => {
    const k = `${s.bill_id}:${s.project_id}`
    acc[k] ??= { bill_id: s.bill_id, bill_no: s.supplier_bills?.bill_no ?? '', project_id: s.project_id, amount: 0 }
    acc[k].amount += s.amount_paisa
    return acc
  }, {})).filter((m) => m.amount > 0)
  const posted = p.status === 'posted'

  return (
    <>
      <PageHeader
        title={`Payment ${p.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link className="text-brand" to={`/suppliers/${p.supplier_id}`}>{p.suppliers?.name}</Link>
            {p.status === 'reversed' && <Badge tone="bad">Reversed</Badge>}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payment">
          <div className="mb-2 text-lg font-semibold text-ink tabular-nums">{formatNPR(p.amount_paisa)}</div>
          <Detail label="Paid on"><DateText value={p.payment_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label="How">{PAYMENT_METHODS[p.method]}</Detail>
          <Detail label="Reference">{p.reference}</Detail>
          <Detail label="Recorded by">{memberName(members.data, p.created_by)}</Detail>
          <Detail label="Notes">{p.notes}</Detail>
        </Card>

        <Card title="Split by project">
          {byProject.map((r) => (
            <Detail key={r.id} label={`${project(r.id)?.code ?? ''} · ${project(r.id)?.name ?? 'Project'}`}>{formatNPR(r.amount)}</Detail>
          ))}
          {p.amount_paisa - p.allocated_paisa !== 0 && (
            <Detail label="Not assigned to a project">{formatNPR(p.amount_paisa - p.allocated_paisa)}</Detail>
          )}
          {posted && canPost(auth) && <AllocationForm paymentId={p.id} />}
        </Card>

        <Card title="Bills it paid">
          {matched.length === 0 && <p className="text-sm text-subtle">Not matched to bills yet. It counts as advance until it is.</p>}
          <ul>
            {matched.map((m) => (
              <li key={`${m.bill_id}:${m.project_id}`} className="border-b border-line py-2 text-sm last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <Link className="font-medium text-brand" to={`/bills/${m.bill_id}`}>Bill {m.bill_no} · {project(m.project_id)?.code}</Link>
                  <span className="tabular-nums">{formatNPR(m.amount)}</span>
                </div>
                {posted && canRecordPayments(auth) && (
                  <div className="mt-1">
                    <ReasonButton variant="ghost" title="Unmatch from this bill" hint="The money stays with the project as advance."
                      confirmLabel="Unmatch" busy={unsettle.isPending} error={unsettle.error && friendlyError(unsettle.error)}
                      onConfirm={(reason) => unsettle.mutate({ bill: m.bill_id, project: m.project_id, amount: m.amount, reason })}>
                      Unmatch
                    </ReasonButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {posted && canRecordPayments(auth) && (
            <p className="mt-2 text-xs text-subtle">To match it to more bills, use "Match payments to bills" on the supplier page.</p>
          )}
        </Card>

        <Card title="Proof">
          <Attachments owner={{ payment_id: p.id }} canAdd={posted && canRecordPayments(auth)} label="Add receipt or cheque photo" />
        </Card>
      </div>

      {posted && canPost(auth) && (
        <div className="mt-6">
          <ReasonButton variant="danger" title="Reverse this payment" hint="e.g. Cheque bounced. Bills it paid become unpaid again."
            confirmLabel="Reverse payment" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            Reverse payment
          </ReasonButton>
        </div>
      )}
    </>
  )
}

/** Move money between "not assigned" and a project (dated on the payment, I-9). */
function AllocationForm({ paymentId }: { paymentId: string }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [direction, setDirection] = useState<'to' | 'from'>('to')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const allocate = usePosting(
    (key) => rpc('allocate_payment', {
      p_op_key: key, p_payment: paymentId, p_reason: reason,
      p_changes: [{ project_id: projectId, amount_paisa: (parseNPR(amount) ?? 0) * (direction === 'to' ? 1 : -1) }],
    }),
    { onSuccess: async () => { setOpen(false); setAmount(''); setReason(''); await refresh() } },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    if (projectId && parseNPR(amount) && reason.trim()) allocate.mutate()
  }

  if (!open) return <Button variant="ghost" className="mt-2" onClick={() => setOpen(true)}>Change split</Button>
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Move" htmlFor="al-dir">
          <Select id="al-dir" value={direction} onChange={(e) => setDirection(e.target.value as 'to' | 'from')}>
            <option value="to">From "not assigned" to a project</option>
            <option value="from">From a project back to "not assigned"</option>
          </Select>
        </Field>
        <Field label="Project" htmlFor="al-project">
          <Select id="al-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Choose</option>
            {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="al-amount"><MoneyInput id="al-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason" htmlFor="al-reason"><Input id="al-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-subtle">To move between two projects, move it back to "not assigned" first, then to the other project.</p>
      <ErrorBanner>{allocate.error && friendlyError(allocate.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={allocate.isPending} disabled={!projectId || !parseNPR(amount) || !reason.trim()}>Save</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
