// Labour, expenses and subcontract work on a project page. Staff without finance access see
// only the entries they made in the last 7 days (X2); finance users see everything.
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, ButtonLink, ErrorBanner, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { PACKAGE_STATUS, PAYMENT_METHODS, settlementLabel } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { ShowMore } from '../../components/ShowMore'
import { BalanceText } from '../parties/PartyParts'
import { usePackageFigures, useWorkPackages } from '../subcontract/api'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canEnter, canManageSuppliers, canPost } from '../supply/permissions'
import { useExpenses, useLabourCosts } from './api'
import { labourPath } from '../labour/api'

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

/**
 * Reverse a labour cost or expense (Accounts/Admin): cost goes back down; money already paid becomes
 * overpaid. A company expense posted nothing, so reversing it only marks it reversed.
 */
function ReverseEntry({ id, what, company, open, onOpenChange }: {
  id: string; what: string; company?: boolean
  /** Controlled, for a table that opens the form in its own row. */
  open?: boolean; onOpenChange?: (open: boolean) => void
}) {
  const auth = useCompany()
  const refresh = useRefreshMoney()
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => company
      ? rpc('reverse_company_expense', { p_op_key: key, p_expense: id, p_date: a.date, p_reason: a.reason })
      : rpc('reverse_cost_entry', { p_op_key: key, p_doc: id, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )
  return (
    <ReasonButton variant="ghost" title={`Reverse this ${what}`}
      hint={company ? 'It stays in the list, marked reversed.' : 'Cost goes back down. Money already paid becomes overpaid, deducted from their next bill.'}
      confirmLabel="Reverse" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
      withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
      onConfirm={(reason, date) => reverse.mutate({ reason, date })} open={open} onOpenChange={onOpenChange}>
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
    <Section title="Labour" action={canEnter(auth) && <ButtonLink variant="secondary" to={labourPath(auth.company, { project: projectId })}>{auth.company.labour_mode === 'attendance' ? 'Attendance' : 'Enter labour'}</ButtonLink>}>
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
                  <DateText value={l.work_date} display={auth.dateDisplay} /> · {l.workers?.name ?? l.crews?.name}
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

type Expense = ReturnType<typeof useExpenses>['data'] extends (infer E)[] | undefined ? E : never

/**
 * Other expenses as a compact table: a busy site enters many, so a row is one line (about 44px).
 * On a project: who it is owed to and whether it is paid. A company expense (no project) was paid
 * when entered and is owed to no one, so it says how it was paid instead. On a phone the date,
 * project and who move under "What for". Reversing opens its form in a row of its own.
 */
export function ExpenseTable({ rows, projectCode }: {
  rows: Expense[]
  /** Show a Project column (the list mixes projects); returns the code for a project id. */
  projectCode?: (id: string | null) => string | null
}) {
  const auth = useCompany()
  const [reversing, setReversing] = useState<string | null>(null)
  const mayReverse = canPost(auth)
  const cols = 5 + (projectCode ? 1 : 0) + (mayReverse ? 1 : 0)
  const th = 'py-2 pr-3 font-medium'
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-subtle">
            <th scope="col" className={`hidden pl-4 sm:table-cell ${th}`}>Date</th>
            <th scope="col" className={`pl-4 sm:pl-0 ${th}`}>What for</th>
            {projectCode && <th scope="col" className={`hidden md:table-cell ${th}`}>Project</th>}
            <th scope="col" className={`hidden md:table-cell ${th}`}>Paid to</th>
            <th scope="col" className={`hidden lg:table-cell ${th}`}>Heading</th>
            <th scope="col" className={`text-right ${th}`}>Amount</th>
            <th scope="col" className={`hidden sm:table-cell ${th}`}>Status</th>
            {mayReverse && <th scope="col" className="w-0 py-2 pr-4"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const company = !e.project_id
            // The payment that paid it ("paid now" writes both): finance users only (settlement rows).
            const paidBy = (e.paid_by ?? []) as Array<{ id: string; number: string }>
            const where = company ? t('expenses.company') : projectCode?.(e.project_id) ?? ''
            const who = company
              ? e.paid_method && t('expenses.paid', { how: PAYMENT_METHODS[e.paid_method] })
              // The Cash payee is "Cash (not named)"; in a table row "Cash" says it.
              : <Link className="hover:underline" to={`/payees/${e.payee_id}`}>{e.payees?.is_cash ? PAYMENT_METHODS.cash : e.payees?.name}</Link>
            const status = (
              <span className="inline-flex flex-wrap items-center gap-x-2">
                {company
                  ? e.status === 'reversed' ? <Badge tone="bad">Reversed</Badge> : <Badge tone="good">Paid</Badge>
                  : <PaidBadge amount={e.amount_paisa} settled={e.settled_paisa} reversed={e.status === 'reversed'} />}
                {paidBy.map((p) => (
                  <Link key={p.id} className="text-xs text-slate underline underline-offset-2" to={`/payments/${p.id}`}>{p.number}</Link>
                ))}
              </span>
            )
            const canReverse = mayReverse && e.status === 'posted'
            return (
              <Fragment key={e.id}>
                <tr className={`border-b border-line align-middle last:border-0 ${e.status === 'reversed' ? 'text-subtle' : ''}`}>
                  <td className="hidden py-2 pr-3 pl-4 whitespace-nowrap text-subtle sm:table-cell"><DateText value={e.expense_date} display={auth.dateDisplay} /></td>
                  <td className="py-2 pr-3 pl-4 sm:pl-0">
                    <div className="font-medium break-words text-ink">{e.description}</div>
                    {/* Phone: what the hidden columns say, and the status. */}
                    <div className="text-xs text-subtle md:hidden">
                      <span className="sm:hidden"><DateText value={e.expense_date} display={auth.dateDisplay} /> · </span>
                      {projectCode && <>{where} · </>}{who}
                    </div>
                    <div className="mt-1 sm:hidden">{status}</div>
                  </td>
                  {projectCode && <td className="hidden py-2 pr-3 whitespace-nowrap md:table-cell">{where}</td>}
                  <td className="hidden py-2 pr-3 md:table-cell">{who}</td>
                  <td className="hidden py-2 pr-3 text-subtle lg:table-cell">{e.cost_headings?.name}{e.bill_no && ` · Bill ${e.bill_no}`}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{formatNPR(e.amount_paisa)}</td>
                  <td className="hidden py-2 pr-3 sm:table-cell">{status}</td>
                  {mayReverse && (
                    <td className="py-2 pr-4 text-right">
                      {canReverse && reversing !== e.id && (
                        <button type="button" onClick={() => setReversing(e.id)}
                          className="min-h-11 text-sm font-medium text-subtle underline underline-offset-2 hover:text-ink [@media(pointer:fine)]:min-h-8">
                          Reverse
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                {canReverse && reversing === e.id && (
                  <tr className="border-b border-line">
                    <td colSpan={cols} className="px-4 py-2">
                      <ReverseEntry id={e.id} what={company ? 'company expense' : 'other expense'} company={company}
                        open onOpenChange={(o) => { if (!o) setReversing(null) }} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ExpenseSection({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const expenses = useExpenses({ projectId })
  return (
    <Section title="Other expenses" action={canEnter(auth) && <ButtonLink variant="secondary" to={`/expenses/new?project=${projectId}`}>Enter other expense</ButtonLink>}>
      {!auth.canSeeFinance && <p className="mb-2 text-xs text-subtle">{t('expenses.mine')}</p>}
      {expenses.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void expenses.refetch()}>{expenses.error && friendlyError(expenses.error)}</ErrorBanner>
      {expenses.data?.length === 0 && <p className="text-sm text-subtle">No other expenses entered yet.</p>}
      {expenses.data && expenses.data.length > 0 && (
        <ExpenseTable rows={expenses.data} />
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
