// Labour, expenses and subcontract work on a project page. Staff without finance access see
// only the entries they made in the last 7 days (X2); finance users see everything.
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, ButtonLink, ErrorBanner, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PACKAGE_STATUS, settlementLabel } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { ShowMore } from '../../components/ShowMore'
import { BalanceText } from '../parties/PartyParts'
import { usePackageFigures, useWorkPackages } from '../subcontract/api'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canEnter, canManageSuppliers, canPost } from '../supply/permissions'
import { useExpenses, useLabourCosts } from './api'

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Reverse a labour cost or expense (Accounts/Admin): cost goes back down; money paid stays as advance. */
function ReverseEntry({ id, what }: { id: string; what: string }) {
  const auth = useCompany()
  const refresh = useRefreshMoney()
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => rpc('reverse_cost_entry', { p_op_key: key, p_doc: id, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )
  return (
    <ReasonButton variant="ghost" title={`Reverse this ${what}`} hint="Cost goes back down. Money already paid stays as advance."
      confirmLabel="Reverse" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
      withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
      onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
      Reverse
    </ReasonButton>
  )
}

function PaidBadge({ amount, settled, reversed }: { amount: number; settled: number; reversed: boolean }) {
  if (reversed) return <Badge tone="bad">Reversed</Badge>
  const [label, tone] = settlementLabel(amount - settled, settled)
  return <Badge tone={tone}>{label}</Badge>
}

export function LabourSection({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const labour = useLabourCosts({ projectId })
  return (
    <Section title="Labour" action={canEnter(auth) && <ButtonLink variant="secondary" to={`/labour/new?project=${projectId}`}>Enter labour</ButtonLink>}>
      {!auth.canSeeFinance && <p className="mb-2 text-xs text-subtle">Shows labour you entered in the last 7 days.</p>}
      {labour.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void labour.refetch()}>{labour.error && friendlyError(labour.error)}</ErrorBanner>
      {labour.data?.length === 0 && <p className="text-sm text-subtle">No labour entered yet.</p>}
      {labour.data && labour.data.length > 0 && (
        <ul className="rounded-xl border border-line bg-surface px-4">
          {labour.data.map((l) => (
            <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink">
                  <DateText value={l.work_date} display={auth.dateDisplay} /> · {l.crews?.name}
                </div>
                <div className="text-xs text-subtle">
                  {[l.work_type, l.headcount && `${l.headcount} people`, l.person_days && `${Number(l.person_days)} person-days`, l.description]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
                <span>{formatNPR(l.amount_paisa)}</span>
                <PaidBadge amount={l.amount_paisa} settled={l.settled_paisa} reversed={l.status === 'reversed'} />
                {l.status === 'posted' && canPost(auth) && <ReverseEntry id={l.id} what="labour entry" />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ShowMore list={labour} />
    </Section>
  )
}

export function ExpenseSection({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const expenses = useExpenses({ projectId })
  return (
    <Section title="Other expenses" action={canEnter(auth) && <ButtonLink variant="secondary" to={`/expenses/new?project=${projectId}`}>Enter expense</ButtonLink>}>
      {!auth.canSeeFinance && <p className="mb-2 text-xs text-subtle">Shows expenses you entered in the last 7 days.</p>}
      {expenses.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void expenses.refetch()}>{expenses.error && friendlyError(expenses.error)}</ErrorBanner>
      {expenses.data?.length === 0 && <p className="text-sm text-subtle">No expenses entered yet.</p>}
      {expenses.data && expenses.data.length > 0 && (
        <ul className="rounded-xl border border-line bg-surface px-4">
          {expenses.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0 text-sm">
                <div className="font-medium break-words text-ink">{e.description}</div>
                <div className="text-xs text-subtle">
                  <DateText value={e.expense_date} display={auth.dateDisplay} /> ·{' '}
                  <Link className="hover:underline" to={`/payees/${e.payee_id}`}>{e.payees?.name}</Link>
                  {e.cost_headings && ` · ${e.cost_headings.name}`}{e.bill_no && ` · Bill ${e.bill_no}`}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
                <span>{formatNPR(e.amount_paisa)}</span>
                <PaidBadge amount={e.amount_paisa} settled={e.settled_paisa} reversed={e.status === 'reversed'} />
                {e.status === 'posted' && canPost(auth) && <ReverseEntry id={e.id} what="expense" />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ShowMore list={expenses} />
    </Section>
  )
}

export function SubcontractSection({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const packages = useWorkPackages({ projectId })
  const figures = usePackageFigures(projectId, auth.canSeeFinance)
  const fig = new Map(figures.data?.map((f) => [f.work_package_id, f]))
  return (
    <Section title="Subcontract work" action={canManageSuppliers(auth) && <ButtonLink variant="secondary" to={`/work/new?project=${projectId}`}>New work package</ButtonLink>}>
      {packages.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void packages.refetch()}>{packages.error && friendlyError(packages.error)}</ErrorBanner>
      {packages.data?.length === 0 && <p className="text-sm text-subtle">No work given to subcontractors yet.</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {packages.data?.map((w) => {
          const [label, tone] = PACKAGE_STATUS[w.status]
          const f = fig.get(w.id)
          return (
            <li key={w.id}>
              <Link to={`/work/${w.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-slate">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold break-words text-ink">{w.scope}</div>
                    <div className="text-sm text-subtle">{w.subcontractors?.name} · {Number(w.progress_pct)}% done</div>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                {f && (
                  <div className="mt-2 text-sm">
                    Approved {formatNPR(f.approved_paisa)}{f.agreed_value_paisa !== null && ` of ${formatNPR(f.agreed_value_paisa)}`} ·{' '}
                    <BalanceText paisa={f.balance_paisa} />
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
