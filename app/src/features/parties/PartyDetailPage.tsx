// One subcontractor, crew or payee: contact, balance, khata, payments, matching, and what
// is particular to the kind (work packages, labour entry, becoming a supplier).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { PACKAGE_STATUS } from '../../lib/labels'
import { useProjects } from '../projects/api'
import { useWorkPackages } from '../subcontract/api'
import { rpc } from '../supply/api'
import { canEnter, canManageSuppliers, canRecordPayments } from '../supply/permissions'
import { PARTY, partyCrumbs, type PartyKind } from './kinds'
import { PartyForm, subtitleOf, usePartyRows } from './PartiesPage'
import { labourPath } from '../labour/api'
import { MembersCard } from '../labour/MembersCard'
import { BalanceCard, Khata, MatchCard, PaymentList, Tabs } from './PartyParts'

type Tab = 'khata' | 'payments'

export function PartyDetailPage({ kind }: { kind: PartyKind }) {
  const { partyId = '' } = useParams()
  const auth = useCompany()
  const rows = usePartyRows(kind)
  const projects = useProjects(auth.companyId)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Tab>('khata')

  if (rows.isPending) return <Spinner />
  if (rows.error) return <ErrorBanner onRetry={() => void rows.refetch()}>{friendlyError(rows.error)}</ErrorBanner>
  const r = rows.data.find((x) => x.id === partyId)
  if (!r) {
    return <EmptyState title={`${PARTY[kind].one} not found`}><Link className="text-slate" to={PARTY[kind].path}>Back to {PARTY[kind].many.toLowerCase()}</Link></EmptyState>
  }
  const code = (id: string | null | undefined) => projects.data?.find((p) => p.id === id)?.code
  const sub = subtitleOf(kind, r, code)
  // A subcontractor with nothing filled in gets a link under the name, not an empty card.
  const noDetails = kind === 'subcontractor' && [r.contact_person, r.phone, r.address, r.pan_vat, r.notes].every((f) => !f)
  const showMembers = kind === 'crew' && auth.company.labour_mode === 'attendance' && canEnter(auth)

  return (
    <>
      <PageHeader
        title={r.name}
        crumbs={partyCrumbs(kind)}
        subtitle={<span className="flex flex-wrap items-center gap-2">{sub}{!r.active && <Badge>Inactive</Badge>}</span>}
        after={noDetails && !editing && canManageSuppliers(auth) && (
          <button type="button" onClick={() => setEditing(true)}
            className="flex min-h-11 items-center text-sm font-medium text-slate underline underline-offset-2">
            Add phone, contact person, PAN
          </button>
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            {kind === 'subcontractor' && canManageSuppliers(auth) && (
              <ButtonLink variant="secondary" to={`/work/new?subcontractor=${r.id}`}>New work package</ButtonLink>
            )}
            {kind === 'crew' && canEnter(auth) && (
              <ButtonLink variant="secondary" to={labourPath(auth.company, { crew: r.id, project: r.project_id })}>
                {auth.company.labour_mode === 'attendance' ? 'Attendance' : 'Enter labour'}
              </ButtonLink>
            )}
            {canRecordPayments(auth) && <ButtonLink to={`/payments/new?${kind}=${r.id}`}>Record payment</ButtonLink>}
          </div>
        }
      />
      {editing && <div className="mb-4"><PartyForm kind={kind} party={r} onDone={() => setEditing(false)} /></div>}
      {/* Money on the left (it decides what to do next), who they are on the right. Each column
          stacks on its own, so a short card never leaves a hole beside a tall one. */}
      <div className={`grid items-start gap-4 ${auth.canSeeFinance ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}`}>
        {auth.canSeeFinance && (
          <div className="grid min-w-0 gap-4">
            <BalanceCard kind={kind} partyId={r.id} />
            {canRecordPayments(auth) && <MatchCard kind={kind} partyId={r.id} />}
          </div>
        )}
        {((!editing && !noDetails) || showMembers) && (
          <div className="grid min-w-0 gap-4">
            {!editing && !noDetails && <PartyDetails kind={kind} party={r} code={code} onEdit={canManageSuppliers(auth) ? () => setEditing(true) : undefined} />}
            {showMembers && <MembersCard crewId={r.id} projectId={r.project_id ?? null} />}
          </div>
        )}
      </div>

      {auth.canSeeFinance && (
        <Tabs tabs={[['khata', 'Khata'], ['payments', 'Payments']]} value={tab} onChange={setTab} label={`${PARTY[kind].one} records`}>
          {tab === 'khata' && <Khata kind={kind} partyId={r.id} />}
          {tab === 'payments' && <PaymentList kind={kind} partyId={r.id} />}
        </Tabs>
      )}

      {/* After the khata: the money record is what people open this page to check. */}
      {kind === 'subcontractor' && <PackageList subcontractorId={r.id} />}
    </>
  )
}

type PartyRow = NonNullable<ReturnType<typeof usePartyRows>['data']>[number]

/** Contact details. An empty subcontractor shows a link under its name instead (see above). */
function PartyDetails({ kind, party: r, code, onEdit }: {
  kind: PartyKind; party: PartyRow; code: (id: string | null | undefined) => string | undefined; onEdit?: () => void
}) {
  return (
    <Card title="Details" actions={onEdit && <Button variant="ghost" onClick={onEdit}>Edit</Button>}>
      {kind === 'subcontractor' && <Detail label="Contact">{r.contact_person}</Detail>}
      <Detail label="Phone">{r.phone && <a className="text-slate" href={`tel:${r.phone}`}>{r.phone}</a>}</Detail>
      {kind === 'subcontractor' && <Detail label="Address">{r.address}</Detail>}
      {kind === 'subcontractor' && <Detail label="PAN">{r.pan_vat}</Detail>}
      {kind === 'crew' && <Detail label="Project">{r.project_id ? code(r.project_id) : 'Any project'}</Detail>}
      <Detail label="Notes">{r.notes}</Detail>
      {kind === 'payee' && <PromotePayee payeeId={r.id} supplierId={r.promoted_supplier_id ?? null} />}
    </Card>
  )
}

function PackageList({ subcontractorId }: { subcontractorId: string }) {
  const packages = useWorkPackages({ subcontractorId })
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-base font-semibold text-ink">Work packages</h2>
      {packages.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void packages.refetch()}>{packages.error && friendlyError(packages.error)}</ErrorBanner>
      {packages.data?.length === 0 && <p className="text-sm text-subtle">No work packages on your projects.</p>}
      {!!packages.data?.length && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {packages.data.map((w) => {
            const [label, tone] = PACKAGE_STATUS[w.status]
            const pct = Math.min(100, Math.max(0, Number(w.progress_pct)))
            return (
              <li key={w.id}>
                <Link to={`/work/${w.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words text-ink">{w.scope}</div>
                    <div className="text-xs text-subtle">{w.projects?.code}</div>
                  </div>
                  {/* Progress: neutral bar, the number beside it (PRODUCT.md: bars are not colour-coded). */}
                  <div className="hidden w-32 items-center gap-2 sm:flex" aria-hidden>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm text-ink tabular-nums">{pct}% done</span>
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
    return <p className="mt-2 text-sm">Now a supplier: <Link className="text-slate" to={`/suppliers/${supplierId}`}>open supplier</Link>. Earlier expenses stay here.</p>
  }
  if (!canManageSuppliers(auth)) return null
  return (
    <div className="mt-3">
      <ConfirmButton confirmLabel="Make supplier" onConfirm={() => promote.mutate()} disabled={promote.isPending}>
        Make this a supplier
      </ConfirmButton>
      <p className="mt-1 text-xs text-subtle">Once you order from them with order slips and bills. Earlier expenses stay here.</p>
      <ErrorBanner>{promote.error && friendlyError(promote.error)}</ErrorBanner>
    </div>
  )
}
