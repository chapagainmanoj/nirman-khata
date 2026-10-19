// One payment: how it is split across projects, which bills it cleared, proof photo,
// allocation changes and reversal (req §12.3, §20).
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, Card, Detail, EmptyState, ErrorBanner, Field, Input, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { billTitle, PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { memberName, useMembers, useProjects } from '../projects/api'
import { usePayment } from './api'
import { useRefreshMoney } from '../../data/refresh'
import { rpc, usePosting } from '../../data/rpc'
import { canPost, canRecordPayments } from '../../data/permissions'
import { t } from '../../lib/i18n'

export function PaymentDetailPage() {
  const { paymentId = '' } = useParams()
  const auth = useCompany()
  const photoFailed = (useLocation().state as { photoFailed?: number } | null)?.photoFailed ?? 0
  const payment = usePayment(paymentId)
  const projects = useProjects(auth.companyId)
  const members = useMembers(auth.companyId)
  const refresh = useRefreshMoney()
  // One change form open at a time: "split", "reverse" or "unmatch:<bill>:<project>".
  const [form, setForm] = useState<string | null>(null)
  const formProps = (key: string) => ({ open: form === key, onOpenChange: (o: boolean) => setForm(o ? key : null) })
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
    return <EmptyState title={t('paymentDetail.paymentNotFound')}>{t('paymentDetail.itDoesNotExist')}</EmptyState>
  }

  const project = (id: string) => projects.data?.find((x) => x.id === id)
  const byProject = [...new Set(allocations.map((a) => a.project_id))]
    .map((id) => ({ id, amount: allocations.filter((a) => a.project_id === id).reduce((s, a) => s + a.amount_paisa, 0) }))
    .filter((r) => r.amount !== 0)
  const matched = Object.values(settlements.reduce<Record<string, { doc_id: string; label: string; to: string | null; project_id: string; amount: number }>>((acc, s) => {
    const docId = s.doc_id!
    const k = `${docId}:${s.project_id}`
    const [label, to] = s.bill_id ? [billTitle(s.supplier_bills?.bill_no), `/bills/${s.bill_id}`]
      : s.charge_id ? [t('paymentDetail.workChargeValue', { value: s.subcontract_charges?.claim_no ?? '' }).trim(), `/work/${s.subcontract_charges?.work_package_id}`]
      : s.labour_cost_id ? [t('paymentDetail.labourValue', { value: s.labour_costs?.work_type ?? '' }).trim(), `/projects/${s.project_id}`]
      : [t('paymentDetail.expenseValue', { value: s.expenses?.description ?? '' }), `/projects/${s.project_id}`]
    acc[k] ??= { doc_id: docId, label, to, project_id: s.project_id, amount: 0 }
    acc[k].amount += s.amount_paisa
    return acc
  }, {})).filter((m) => m.amount > 0)
  const party = p.suppliers ?? p.subcontractors ?? p.crews ?? p.payees
  const partyPath = p.supplier_id ? `/suppliers/${p.supplier_id}` : p.subcontractor_id ? `/subcontractors/${p.subcontractor_id}`
    : p.crew_id ? `/crews/${p.crew_id}` : `/payees/${p.payee_id}`
  const posted = p.status === 'posted'

  return (
    <>
      <PageHeader
        title={t('paymentDetail.paymentNumber', { number: p.number })}
        crumbs={[{ to: '/payments', label: t('paymentDetail.payments') }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link className="text-slate" to={partyPath}>{party?.name}</Link>
            {p.status === 'reversed' && <Badge tone="bad">{t('paymentDetail.reversed')}</Badge>}
          </span>
        }
      />
      {photoFailed > 0 && (
        <div className="mb-4"><Notice>{t('paymentDetail.thePaymentIsSaved')}{' '}{photoFailed === 1 ? 'a photo' : t('paymentDetail.photofailedPhotos', { photoFailed })} {t('paymentDetail.didNotUpload')}{' '}{photoFailed === 1 ? t('paymentDetail.itIs') : t('paymentDetail.theyAre')} {t('paymentDetail.keptOnThisPhone')}{' '}{photoFailed === 1 ? 'it' : 'them'} {t('paymentDetail.againBelow')}</Notice></div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('paymentDetail.payment')}>
          <div className="mb-2 text-lg font-semibold text-ink tabular-nums">{formatNPR(p.amount_paisa)}</div>
          <Detail label={t('paymentDetail.paidOn')}><DateText value={p.payment_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label={t('paymentDetail.how')}>{PAYMENT_METHODS[p.method]}</Detail>
          {p.work_packages && <Detail label={t('paymentDetail.workPackage')}><Link className="text-slate" to={`/work/${p.work_package_id}`}>{p.work_packages.scope}</Link></Detail>}
          <Detail label={t('paymentDetail.reference')}>{p.reference}</Detail>
          <Detail label={t('paymentDetail.recordedBy')}>{memberName(members.data, p.created_by)}</Detail>
          <Detail label={t('paymentDetail.notes')}>{p.notes}</Detail>
        </Card>

        <Card title={t('paymentDetail.splitByProject')}>
          {byProject.map((r) => (
            <Detail key={r.id} label={`${project(r.id)?.code ?? ''} · ${project(r.id)?.name ?? t('paymentDetail.project')}`}>{formatNPR(r.amount)}</Detail>
          ))}
          {p.amount_paisa - p.allocated_paisa !== 0 && (
            <Detail label={t('paymentDetail.notAssignedToA')}>{formatNPR(p.amount_paisa - p.allocated_paisa)}</Detail>
          )}
          {posted && canPost(auth) && !p.work_package_id && (
            <AllocationForm paymentId={p.id} split={byProject} {...formProps('split')} />
          )}
        </Card>

        <Card title={t('paymentDetail.whatItPaid')}>
          {matched.length === 0 && <p className="text-sm text-subtle">{t('paymentDetail.notMatchedToBills')}{' '}{p.is_peski ? t('paymentDetail.itIsPeskiUntil') : t('paymentDetail.itCountsAsOverpaid')}</p>}
          <ul>
            {matched.map((m) => (
              <li key={`${m.doc_id}:${m.project_id}`} className="border-b border-line py-2 text-sm last:border-0">
                <div className="flex items-start justify-between gap-2">
                  {m.to
                    ? <Link className="font-medium text-slate" to={m.to}>{m.label} · {project(m.project_id)?.code}</Link>
                    : <span className="font-medium text-ink">{m.label} · {project(m.project_id)?.code}</span>}
                  <span className="tabular-nums">{formatNPR(m.amount)}</span>
                </div>
                {posted && canRecordPayments(auth) && (
                  <div className="mt-1">
                    <ReasonButton variant="ghost" {...formProps(`unmatch:${m.doc_id}:${m.project_id}`)} title={t('paymentDetail.unmatchFromThisBill')} hint={t('paymentDetail.theMoneyStaysWith')}
                      confirmLabel={t('paymentDetail.unmatch')} busy={unsettle.isPending} error={unsettle.error && friendlyError(unsettle.error)}
                      onConfirm={(reason) => unsettle.mutate({ bill: m.doc_id, project: m.project_id, amount: m.amount, reason })}>
                      {t('paymentDetail.unmatch')}</ReasonButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {posted && canRecordPayments(auth) && (
            <p className="mt-2 text-xs text-subtle">{t('paymentDetail.toMatchItTo')}{' '}{p.supplier_id ? 'supplier' : 'party'} {t('paymentDetail.page')}</p>
          )}
        </Card>

        <Card title={t('paymentDetail.proof')}>
          <Attachments owner={{ payment_id: p.id }} canAdd={posted && canRecordPayments(auth)} label={t('paymentDetail.addReceiptOrCheque')} />
        </Card>
      </div>

      {posted && canPost(auth) && (
        <div className="mt-6">
          <ReasonButton variant="danger" {...formProps('reverse')} title={t('paymentDetail.reverseThisPayment')} hint={t('paymentDetail.eg.chequeBouncedBills')}
            confirmLabel={t('paymentDetail.reversePayment')} busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('paymentDetail.reversalDate') }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            {t('paymentDetail.reversePayment')}</ReasonButton>
        </div>
      )}
    </>
  )
}

const UNASSIGNED = 'unassigned'

/**
 * Move money from one place to another: "not assigned" or any project. A project-to-project
 * move is two changes in one call, so it happens all at once (dated on the payment, I-9).
 */
function AllocationForm({ paymentId, split, open, onOpenChange }: {
  paymentId: string
  split: Array<{ id: string; amount: number }>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [from, setFrom] = useState(split.length === 1 ? split[0].id : UNASSIGNED)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const paisa = parseNPR(amount) ?? 0
  const changes = [
    from !== UNASSIGNED && { project_id: from, amount_paisa: -paisa },
    to && to !== UNASSIGNED && { project_id: to, amount_paisa: paisa },
  ].filter((c): c is { project_id: string; amount_paisa: number } => !!c)
  const allocate = usePosting(
    (key) => rpc('allocate_payment', { p_op_key: key, p_payment: paymentId, p_reason: reason, p_changes: changes }),
    { onSuccess: async () => { onOpenChange(false); setAmount(''); setReason(''); setTo(''); await refresh() } },
  )
  const ready = !!to && from !== to && paisa > 0 && !!reason.trim()
  const name = (id: string) => {
    const p = projects.data?.find((x) => x.id === id)
    return p ? `${p.code} · ${p.name}` : t('paymentDetail.project')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ready) allocate.mutate()
  }

  if (!open) return <Button variant="ghost" className="mt-2" onClick={() => onOpenChange(true)}>{t('paymentDetail.changeSplit')}</Button>
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-lg bg-muted p-3">
      <div className="font-semibold text-ink">{t('paymentDetail.moveMoney')}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('paymentDetail.from')} htmlFor="al-from">
          <Select id="al-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value={UNASSIGNED}>{t('paymentDetail.notAssigned')}</option>
            {split.map((r) => <option key={r.id} value={r.id}>{name(r.id)} ({formatNPR(r.amount)})</option>)}
          </Select>
        </Field>
        <Field label={t('paymentDetail.to')} htmlFor="al-to">
          <Select id="al-to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{t('paymentDetail.choose')}</option>
            {from !== UNASSIGNED && <option value={UNASSIGNED}>{t('paymentDetail.notAssigned')}</option>}
            {projects.data?.filter((p) => p.id !== from).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label={t('paymentDetail.amount')} htmlFor="al-amount"><MoneyInput id="al-amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label={t('paymentDetail.reason')} htmlFor="al-reason"><Input id="al-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{allocate.error && friendlyError(allocate.error)}</ErrorBanner>
      <div className="flex gap-2">
        <Button type="submit" busy={allocate.isPending} disabled={!ready}>{t('paymentDetail.move')}</Button>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}
