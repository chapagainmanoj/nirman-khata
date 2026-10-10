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
import { PARTY, type PartyKind } from './kinds'
import { PartyForm, subtitleOf, usePartyRows } from './PartiesPage'
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
    return <EmptyState title={`${PARTY[kind].one} not found`}><Link className="text-brand" to={PARTY[kind].path}>Back to {PARTY[kind].many.toLowerCase()}</Link></EmptyState>
  }
  const code = (id: string | null | undefined) => projects.data?.find((p) => p.id === id)?.code
  const sub = subtitleOf(kind, r, code)

  return (
    <>
      <PageHeader
        title={r.name}
        crumbs={[{ to: '/parties', label: 'Parties' }, { to: PARTY[kind].path, label: PARTY[kind].many }]}
        subtitle={<span className="flex flex-wrap items-center gap-2">{sub}{!r.active && <Badge>Inactive</Badge>}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
            {kind === 'subcontractor' && canManageSuppliers(auth) && (
              <ButtonLink variant="secondary" to={`/work/new?subcontractor=${r.id}`}>New work package</ButtonLink>
            )}
            {kind === 'crew' && canEnter(auth) && (
              <ButtonLink variant="secondary" to={`/labour/new?crew=${r.id}${r.project_id ? `&project=${r.project_id}` : ''}`}>Enter labour</ButtonLink>
            )}
            {canRecordPayments(auth) && <ButtonLink to={`/payments/new?${kind}=${r.id}`}>Record payment</ButtonLink>}
          </div>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {editing ? (
          <div className="lg:col-span-2"><PartyForm kind={kind} party={r} onDone={() => setEditing(false)} /></div>
        ) : (
          <Card title="Details" actions={canManageSuppliers(auth) && <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
            {kind === 'subcontractor' && <Detail label="Contact">{r.contact_person}</Detail>}
            <Detail label="Phone">{r.phone && <a className="text-brand" href={`tel:${r.phone}`}>{r.phone}</a>}</Detail>
            {kind === 'subcontractor' && <Detail label="Address">{r.address}</Detail>}
            {kind === 'subcontractor' && <Detail label="PAN">{r.pan_vat}</Detail>}
            {kind === 'crew' && <Detail label="Project">{r.project_id ? code(r.project_id) : 'Any project'}</Detail>}
            <Detail label="Notes">{r.notes}</Detail>
            {kind === 'payee' && <PromotePayee payeeId={r.id} supplierId={r.promoted_supplier_id ?? null} />}
          </Card>
        )}
        {auth.canSeeFinance && <BalanceCard kind={kind} partyId={r.id} />}
        {auth.canSeeFinance && canRecordPayments(auth) && <MatchCard kind={kind} partyId={r.id} />}
      </div>

      {kind === 'subcontractor' && <PackageList subcontractorId={r.id} />}

      {auth.canSeeFinance && (
        <Tabs tabs={[['khata', 'Khata'], ['payments', 'Payments']]} value={tab} onChange={setTab} label={`${PARTY[kind].one} records`}>
          {tab === 'khata' && <Khata kind={kind} partyId={r.id} />}
          {tab === 'payments' && <PaymentList kind={kind} partyId={r.id} />}
        </Tabs>
      )}
    </>
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
      <ul className="grid gap-3 sm:grid-cols-2">
        {packages.data?.map((w) => {
          const [label, tone] = PACKAGE_STATUS[w.status]
          return (
            <li key={w.id}>
              <Link to={`/work/${w.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold break-words text-ink">{w.scope}</div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <div className="mt-1 text-sm text-subtle">{w.projects?.code} · {Number(w.progress_pct)}% done</div>
              </Link>
            </li>
          )
        })}
      </ul>
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
    return <p className="mt-2 text-sm">Now a supplier: <Link className="text-brand" to={`/suppliers/${supplierId}`}>open supplier</Link>. Earlier expenses stay here.</p>
  }
  if (!canManageSuppliers(auth)) return null
  return (
    <div className="mt-3">
      <ConfirmButton confirmLabel="Make supplier" onConfirm={() => promote.mutate()} disabled={promote.isPending}>
        Make this a supplier
      </ConfirmButton>
      <p className="mt-1 text-xs text-subtle">For a payee you now order from with slips and bills. Earlier expenses stay with the payee.</p>
      <ErrorBanner>{promote.error && friendlyError(promote.error)}</ErrorBanner>
    </div>
  )
}
