// One subcontractor, crew, worker or payee: call them, balance, khata, payments, matching, and what
// is particular to the kind (work packages, labour entry). Contact details (and, for a payee,
// becoming a supplier) are on their own page (PartyInfoPage), linked under the name. When the
// company works by attendance, a crew's page is its workers' calendar (CrewBoard); each worker
// has their own page: the crews they are on (attendance is marked there, and only there), then
// their khata.
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Notice, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { PACKAGE_STATUS } from '../../lib/labels'
import { useProjects } from '../projects/api'
import { packageFiguresQuery, useWorkPackages } from '../subcontract/api'
import { rpc } from '../supply/api'
import { canEnter, canManageSuppliers, canRecordPayments } from '../supply/permissions'
import { PARTY, partyCrumbs, type PartyKind } from './kinds'
import { PartyForm, subtitleOf, usePartyRows } from './PartiesPage'
import { usePartyBalances } from './api'
import { labourPath, rateText } from '../labour/api'
import { CrewBoard } from '../labour/CrewBoard'
import { WorkerCrews } from '../labour/WorkerCrews'
import { WorkerForm } from '../labour/WorkerForm'
import { formatNPR } from '../../lib/money'
import { BalanceCard, ContactRow, Khata, MatchCard, OpeningBalance, PaymentList, Tabs } from './PartyParts'
import { RefundCard } from '../refunds/RefundCard'
import { t } from '../../lib/i18n'

type Tab = 'khata' | 'payments'

export function PartyDetailPage({ kind }: { kind: PartyKind }) {
  const { partyId = '' } = useParams()
  const auth = useCompany()
  const rows = usePartyRows(kind)
  const projects = useProjects(auth.companyId)
  const [tab, setTab] = useState<Tab>('khata')
  const byAttendance = auth.company.labour_mode === 'attendance'
  const board = kind === 'crew' && byAttendance && canEnter(auth)
  // A crew paid as a crew before workers were paid one by one keeps its khata.
  const crewMoney = usePartyBalances(auth.companyId, 'crew', board && auth.canSeeFinance).data?.find((b) => b.party_id === partyId)
  const crewHasMoney = !board || !!crewMoney?.charged_paisa || !!crewMoney?.paid_paisa
  const paidFromHeld = (useLocation().state as { paidFromHeld?: number } | null)?.paidFromHeld
  // A subcontractor's money is read by the job (Contract card); the khata detail sits in its tab.
  const byJob = kind === 'subcontractor'

  if (rows.isPending) return <Spinner />
  if (rows.error) return <ErrorBanner onRetry={() => void rows.refetch()}>{friendlyError(rows.error)}</ErrorBanner>
  const r = rows.data.find((x) => x.id === partyId)
  if (!r) {
    return <EmptyState title={t('partyDetail.oneNotFound', { one: PARTY[kind].one })}><Link className="text-slate" to={PARTY[kind].path}>{t('partyDetail.backToValue', { value: PARTY[kind].many.toLowerCase() })}</Link></EmptyState>
  }
  const code = (id: string | null | undefined) => projects.data?.find((p) => p.id === id)?.code
  const sub = subtitleOf(kind, r, code)

  return (
    <>
      <PageHeader
        title={r.name}
        crumbs={partyCrumbs(kind)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {sub}{!r.active && <Badge>{t('partyDetail.inactive')}</Badge>}
            {/* No phone to call: Details joins this line rather than sitting alone on its own. */}
            {!r.phone && <Link className="inline-flex min-h-11 items-center font-medium text-slate underline underline-offset-2 [@media(pointer:fine)]:min-h-0" to={`${PARTY[kind].path}/${r.id}/details`}>{t('partyDetail.details')}</Link>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {kind === 'crew' && canEnter(auth) && !byAttendance && (
              <ButtonLink variant="secondary" to={labourPath(auth.company, { crew: r.id, project: r.project_id })}>{t('partyDetail.enterLabour')}</ButtonLink>
            )}
            {canRecordPayments(auth) && crewHasMoney && <ButtonLink to={`/payments/new?${kind}=${r.id}`}>{t('partyDetail.recordPayment')}</ButtonLink>}
          </div>
        }
      />
      {r.phone && <ContactRow phone={r.phone} links={[[`${PARTY[kind].path}/${r.id}/details`, t('partyDetail.details')]]} />}
      {!!paidFromHeld && <div className="mb-4"><Notice>{t('partyDetail.paidfromheldTakenFromMoney', { paidFromHeld: formatNPR(paidFromHeld) })}</Notice></div>}
      {/* A subcontractor is the jobs given to them: what is paid and left on them, then the jobs. */}
      {byJob && auth.canSeeFinance && <ContractCard subcontractorId={r.id} name={r.name} />}
      {byJob && <PackageList subcontractorId={r.id} />}
      {board && <CrewBoard crewId={r.id} projectId={r.project_id ?? null} />}
      {kind === 'worker' && byAttendance && canEnter(auth) && <WorkerCrews workerId={r.id} />}
      {auth.canSeeFinance && crewHasMoney && !byJob && (
        <div className={`grid items-start gap-4 ${board ? 'mt-6' : ''}`}>
          {board && <h2 className="text-base font-semibold text-ink">{t('partyDetail.paidToTheCrew')}</h2>}
          <BalanceCard kind={kind} partyId={r.id} />
          {canRecordPayments(auth) && <MatchCard kind={kind} partyId={r.id} />}
        </div>
      )}

      {auth.canSeeFinance && crewHasMoney && (
        <Tabs tabs={[['khata', t('partyDetail.khata')], ['payments', t('partyDetail.payments')]]} value={tab} onChange={setTab} label={t('partyDetail.oneRecords', { one: PARTY[kind].one })}>
          {tab === 'khata' && byJob && (
            <div className="mb-4 grid items-start gap-4">
              {/* The Contract card has the money; the khata below adds up to the balance. Here only
                  the opening balance (to set or correct) and matching. Money given back is asked
                  on the Contract card once no work is going on. */}
              {auth.seesAllProjects && <OpeningBalance kind={kind} partyId={r.id} plain />}
              {canRecordPayments(auth) && <MatchCard kind={kind} partyId={r.id} />}
            </div>
          )}
          {tab === 'khata' && <Khata kind={kind} partyId={r.id} />}
          {tab === 'payments' && <PaymentList kind={kind} partyId={r.id} />}
        </Tabs>
      )}
    </>
  )
}

/** Who the party is: contact details, with Edit to change them; a payee can become a supplier here. */
export function PartyInfoPage({ kind }: { kind: PartyKind }) {
  const { partyId = '' } = useParams()
  const auth = useCompany()
  const rows = usePartyRows(kind)
  const projects = useProjects(auth.companyId)

  if (rows.isPending) return <Spinner />
  if (rows.error) return <ErrorBanner onRetry={() => void rows.refetch()}>{friendlyError(rows.error)}</ErrorBanner>
  const r = rows.data.find((x) => x.id === partyId)
  if (!r) return <PartyNotFound kind={kind} />
  const code = (id: string | null | undefined) => projects.data?.find((p) => p.id === id)?.code
  const empty = kind !== 'worker' && [r.phone, r.notes, 'contact_person' in r && r.contact_person, 'address' in r && r.address, 'pan_vat' in r && r.pan_vat].every((f) => !f)
  return (
    <>
      <PageHeader title={t('partyDetail.details')} crumbs={[...partyCrumbs(kind), { to: `${PARTY[kind].path}/${r.id}`, label: r.name }]} />
      <PartyDetails kind={kind} party={r} code={code} empty={empty} edit={canManageSuppliers(auth) ? `${PARTY[kind].path}/${r.id}/edit` : undefined} />
    </>
  )
}

/** Changing a party's details, on its own page; Save or Cancel goes back to Details. */
export function PartyEditPage({ kind }: { kind: PartyKind }) {
  const { partyId = '' } = useParams()
  const navigate = useNavigate()
  const rows = usePartyRows(kind)

  if (rows.isPending) return <Spinner />
  if (rows.error) return <ErrorBanner onRetry={() => void rows.refetch()}>{friendlyError(rows.error)}</ErrorBanner>
  const r = rows.data.find((x) => x.id === partyId)
  if (!r) return <PartyNotFound kind={kind} />
  const details = `${PARTY[kind].path}/${r.id}/details`
  return (
    <>
      <PageHeader title={t('partyDetail.editValue', { value: PARTY[kind].one.toLowerCase() })}
        crumbs={[...partyCrumbs(kind), { to: `${PARTY[kind].path}/${r.id}`, label: r.name }, { to: details, label: t('partyDetail.details') }]} />
      {kind === 'worker' ? (
        <WorkerForm member={{ ...r, work_type: r.work_type ?? null, rate_kind: r.rate_kind ?? 'daily', rate_paisa: r.rate_paisa ?? 0 }}
          onDone={() => navigate(details, { replace: true })} />
      ) : (
        <PartyForm kind={kind} party={r} onDone={() => navigate(details, { replace: true })} />
      )}
    </>
  )
}

function PartyNotFound({ kind }: { kind: PartyKind }) {
  return <EmptyState title={t('partyDetail.oneNotFound', { one: PARTY[kind].one })}><Link className="text-slate" to={PARTY[kind].path}>{t('partyDetail.backToValue', { value: PARTY[kind].many.toLowerCase() })}</Link></EmptyState>
}

type PartyRow = NonNullable<ReturnType<typeof usePartyRows>['data']>[number]

/** Contact details. */
function PartyDetails({ kind, party: r, code, empty, edit }: {
  kind: PartyKind; party: PartyRow; code: (id: string | null | undefined) => string | undefined; empty: boolean; edit?: string
}) {
  return (
    <Card title={r.name} actions={edit && <ButtonLink variant="ghost" to={edit}>{t('common.edit')}</ButtonLink>}>
      {kind === 'subcontractor' && <Detail label={t('partyDetail.contact')}>{r.contact_person}</Detail>}
      <Detail label={t('partyDetail.phone')}>{r.phone && <a className="text-slate" href={`tel:${r.phone}`}>{r.phone}</a>}</Detail>
      {kind === 'subcontractor' && <Detail label={t('partyDetail.address')}>{r.address}</Detail>}
      {kind === 'subcontractor' && <Detail label={t('partyDetail.pan')}>{r.pan_vat}</Detail>}
      {kind === 'crew' && <Detail label={t('partyDetail.project')}>{r.project_id ? code(r.project_id) : t('partyDetail.anyProject')}</Detail>}
      {kind === 'worker' && <Detail label={t('partyDetail.work')}>{r.work_type}</Detail>}
      {kind === 'worker' && r.rate_paisa != null && <Detail label={t('partyDetail.rate')}>{rateText({ rate_kind: r.rate_kind ?? 'daily', rate_paisa: r.rate_paisa }, formatNPR)}</Detail>}
      <Detail label={t('partyDetail.notes')}>{r.notes}</Detail>
      {empty && kind !== 'crew' && <p className="text-sm text-subtle">{t('partyDetail.noContactDetailsYet')}</p>}
      {kind === 'payee' && <PromotePayee payeeId={r.id} supplierId={r.promoted_supplier_id ?? null} />}
    </Card>
  )
}

/** A subcontractor's work packages and, for finance users, each one's figures (work_package_figures, per project). */
function useSubcontractorPackages(subcontractorId: string) {
  const auth = useCompany()
  const packages = useWorkPackages({ subcontractorId })
  const projectIds = [...new Set(packages.data?.map((w) => w.project_id) ?? [])]
  const figures = useQueries({
    queries: projectIds.map((id) => packageFiguresQuery(id, auth.canSeeFinance)),
    combine: (rs) => ({ rows: rs.flatMap((q) => q.data ?? []), ready: rs.every((q) => q.data != null) }),
  })
  return { packages, figures }
}

/**
 * What the owner asks first about a subcontractor: what the jobs are worth, what has been paid, and
 * what is left, both on the whole contract and for work already approved. Cancelled jobs count only
 * for what was paid on them. Money with them outside any job (an opening balance, money paid
 * ahead) is one line from the khata balance; it pays their next bill first.
 */
function ContractCard({ subcontractorId, name }: { subcontractorId: string; name: string }) {
  const auth = useCompany()
  const { packages, figures } = useSubcontractorPackages(subcontractorId)
  const balance = usePartyBalances(auth.companyId, 'subcontractor', true).data?.find((b) => b.party_id === subcontractorId)
  // With no work going on, money they still hold is not coming off a bill: ask if they gave it back.
  const workGoingOn = packages.data?.some((w) => w.status === 'active') ?? true
  const askGiveBack = !workGoingOn && (
    <div className="mb-6">
      <RefundCard kind="subcontractor" partyId={subcontractorId}
        intro={(held) => t('partyDetail.nameStillHoldsHeld', { name, held })} />
    </div>
  )
  if (!packages.data?.length) return askGiveBack || null
  if (!figures.ready) return null
  const live = new Set(packages.data.filter((w) => w.status !== 'cancelled').map((w) => w.id))
  const sum = (pick: (f: (typeof figures.rows)[number]) => number | null, onlyLive = true) =>
    figures.rows.filter((f) => !onlyLive || live.has(f.work_package_id)).reduce((s, f) => s + (pick(f) ?? 0), 0)
  const agreed = sum((f) => f.agreed_value_paisa)
  const approved = sum((f) => f.approved_paisa)
  const paid = sum((f) => f.paid_paisa, false)
  const noAgreed = figures.rows.some((f) => live.has(f.work_package_id) && f.agreed_value_paisa == null)
  const due = sum((f) => f.approved_paisa, false) - paid
  // The khata balance less what the jobs account for: money outside any job.
  const outside = balance && balance.company_level ? balance.balance_paisa - due : 0
  return (
    <>
      <Card title={t('partyDetail.contract')} className="mb-6">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-subtle">{t('partyDetail.agreedForTheWork')}</dt><dd className="text-right tabular-nums">{formatNPR(agreed)}</dd>
          <dt className="text-subtle">{t('partyDetail.paidSoFar')}</dt><dd className="text-right tabular-nums">{formatNPR(paid)}</dd>
          <dt className="font-semibold text-ink">{t('partyDetail.leftToPayOn')}</dt>
          <dd className="text-right font-semibold tabular-nums text-ink">{formatNPR(agreed - paid)}</dd>
        </dl>
        {noAgreed && <p className="mt-1 text-xs text-subtle">{t('partyDetail.someWorkHasNo')}</p>}
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
          <dt className="text-subtle">{t('partyDetail.workDoneApprovedBills')}</dt><dd className="text-right tabular-nums">{formatNPR(approved)}</dd>
          <dt className="font-semibold text-ink">{due >= 0 ? t('partyDetail.dueNow') : t('partyDetail.theyHoldPeski')}</dt>
          <dd className="text-right font-semibold tabular-nums text-ink">{due === 0 ? t('partyDetail.nothing') : formatNPR(Math.abs(due))}</dd>
        </dl>
        {outside < 0 && (
          <p className="mt-3 text-sm text-subtle">
            {t('partyDetail.alsoWithThemFrom')}{' '}<span className="font-semibold text-ink">{formatNPR(-outside)}</span>.{workGoingOn && t('partyDetail.itPaysTheirNext')}
          </p>
        )}
        {outside > 0 && (
          <p className="mt-3 text-sm text-subtle">
            {t('partyDetail.alsoOwedFromBefore')}{' '}<span className="font-semibold text-ink">{formatNPR(outside)}</span>{t('partyDetail.seeTheKhata')}</p>
        )}
      </Card>
      {askGiveBack}
    </>
  )
}

// Active jobs first, then completed, then cancelled; newest first within each.
const PACKAGE_ORDER = { active: 0, completed: 1, cancelled: 2 } as const

/** The subcontractor's work packages, with each one's agreed value, approved work and balance for finance users. */
function PackageList({ subcontractorId }: { subcontractorId: string }) {
  const auth = useCompany()
  const { packages, figures: { rows: figures } } = useSubcontractorPackages(subcontractorId)
  const list = [...(packages.data ?? [])].sort((a, b) => PACKAGE_ORDER[a.status] - PACKAGE_ORDER[b.status])
  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{t('partyDetail.workPackages')}</h2>
        {canManageSuppliers(auth) && <ButtonLink variant="secondary" to={`/work/new?subcontractor=${subcontractorId}`}>{t('partyDetail.newWorkPackage')}</ButtonLink>}
      </div>
      {packages.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void packages.refetch()}>{packages.error && friendlyError(packages.error)}</ErrorBanner>
      {packages.data?.length === 0 && (
        <p className="text-sm text-subtle">{t('partyDetail.noWorkPackagesOn')}</p>
      )}
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {list.map((w) => {
            const [label, tone] = PACKAGE_STATUS[w.status]
            const pct = Math.min(100, Math.max(0, Number(w.progress_pct)))
            const f = figures.find((x) => x.work_package_id === w.id)
            return (
              <li key={w.id}>
                <Link to={`/work/${w.id}`} className={`flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted ${w.status === 'active' ? '' : 'text-subtle'}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium break-words ${w.status === 'active' ? 'text-ink' : ''}`}>{w.scope}</div>
                    <div className="text-xs text-subtle">
                      {w.projects?.code}
                      {f && <> {t('partyDetail.approvedOfAgreedvalueApproved', { approved: formatNPR(f.approved_paisa), agreedValue: formatNPR(f.agreed_value_paisa) })}{' '}{f.balance_paisa > 0 ? t('partyDetail.balanceToPay', { balance: formatNPR(f.balance_paisa) }) : f.balance_paisa < 0 ? t('partyDetail.amountPeski', { amount: formatNPR(-f.balance_paisa) }) : t('partyDetail.nothingToPay')}</>}
                    </div>
                  </div>
                  {/* Progress: neutral bar, the number beside it (PRODUCT.md: bars are not colour-coded). */}
                  <div className="hidden w-32 items-center gap-2 sm:flex" aria-hidden>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums">{t('partyDetail.pctDone', { pct })}</span>
                  <Badge tone={tone}>{label}</Badge>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** A payee that turns out to be a regular supplier (req §15). Its past expenses stay with it. */
function PromotePayee({ payeeId, supplierId }: { payeeId: string; supplierId: string | null }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const promote = useMutation({
    mutationFn: () => rpc('promote_payee', { p_payee: payeeId }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['payees'] })
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      navigate(`/suppliers/${id}`)
    },
  })
  if (supplierId) {
    return <p className="mt-2 text-sm">{t('partyDetail.nowASupplier')}{' '}<Link className="text-slate" to={`/suppliers/${supplierId}`}>{t('partyDetail.openSupplier')}</Link>{t('partyDetail.earlierExpensesStayHere')}</p>
  }
  if (!canManageSuppliers(auth)) return null
  return (
    <div className="mt-3">
      <ConfirmButton confirmLabel={t('partyDetail.makeSupplier')} onConfirm={() => promote.mutate()} disabled={promote.isPending}>
        {t('partyDetail.makeThisASupplier')}</ConfirmButton>
      <p className="mt-1 text-xs text-subtle">{t('partyDetail.onceYouOrderFrom')}</p>
      <ErrorBanner>{promote.error && friendlyError(promote.error)}</ErrorBanner>
    </div>
  )
}
