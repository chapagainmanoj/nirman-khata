// One supplier, in the order a contractor asks: what do I owe and for which bills, call them,
// what is on the way or came without a bill, their rates; then the full record. Contact details,
// PAN and payment terms (SupplierInfoPage) and their rates (SupplierRatesPage) are on their own
// pages, linked beside Call and WhatsApp.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { ButtonLink, Card, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { BalanceCard, ContactRow, Khata, MatchCard, PaymentList, Tabs } from '../parties/PartyParts'
import { useBills, useSuppliers } from './api'
import { ShowMore } from '../../components/ShowMore'
import { BillRow } from './BillRow'
import { canEnter, canManageSuppliers, canRecordPayments } from './permissions'
import { SupplierForm } from './SuppliersPage'
import { ComingFromThem, OwedByProject, TheirRates, UnpaidBills, useTheirRates } from './SupplierParts'

type Tab = 'khata' | 'bills' | 'payments'

export function SupplierDetailPage() {
  const { supplierId = '' } = useParams()
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)
  const [tab, setTab] = useState<Tab>(auth.canSeeFinance ? 'khata' : 'bills')
  const hasRates = !!useTheirRates(supplierId, auth.canSeeFinance).data?.length

  if (suppliers.isPending) return <Spinner />
  if (suppliers.error) return <ErrorBanner onRetry={() => void suppliers.refetch()}>{friendlyError(suppliers.error)}</ErrorBanner>
  const s = suppliers.data.find((x) => x.id === supplierId)
  if (!s) return <EmptyState title="Supplier not found"><Link className="text-slate" to="/suppliers">Back to suppliers</Link></EmptyState>

  // Record payment is the main action here; orders start from the project or "+ Record".
  const pays = canRecordPayments(auth)
  const tabs: Array<[Tab, string]> = auth.canSeeFinance
    ? [['khata', 'Khata'], ['bills', 'Bills'], ['payments', 'Payments']]
    : [['bills', 'My bill drafts']]

  return (
    <>
      <PageHeader
        title={s.name}
        crumbs={[{ to: '/parties', label: 'Parties' }, { to: '/suppliers', label: 'Suppliers' }]}
        subtitle={s.categories.join(' · ') || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {pays && <ButtonLink to={`/payments/new?supplier=${s.id}`}>Record payment</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant={pays ? 'secondary' : 'primary'} to={`/bills/new?supplier=${s.id}`}>Enter bill</ButtonLink>}
          </div>
        }
      />
      <ContactRow phone={s.phone} links={[
        [`/suppliers/${s.id}/details`, 'Details'],
        hasRates && [`/suppliers/${s.id}/rates`, 'Their rates'],
      ]} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {auth.canSeeFinance && <BalanceCard kind="supplier" partyId={s.id}><OwedByProject supplierId={s.id} /></BalanceCard>}
        {auth.canSeeFinance && <UnpaidBills supplierId={s.id} />}
        {canEnter(auth) && <ComingFromThem supplierId={s.id} />}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Supplier records">
        {tab === 'khata' && <Khata kind="supplier" partyId={s.id} />}
        {tab === 'bills' && <BillList supplierId={s.id} />}
        {tab === 'payments' && (
          <div className="flex flex-col gap-4">
            {canRecordPayments(auth) && <MatchCard kind="supplier" partyId={s.id} />}
            <PaymentList kind="supplier" partyId={s.id} />
          </div>
        )}
      </Tabs>
    </>
  )
}

type Supplier = NonNullable<ReturnType<typeof useSuppliers>['data']>[number]

const hasDetails = (s: Supplier) => !!(s.contact_person || s.phone || s.address || s.pan_vat || s.payment_terms)

/** Who the supplier is: contact, address, PAN / VAT, payment terms, with Edit to change them. */
export function SupplierInfoPage() {
  const { supplierId = '' } = useParams()
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)

  if (suppliers.isPending) return <Spinner />
  if (suppliers.error) return <ErrorBanner onRetry={() => void suppliers.refetch()}>{friendlyError(suppliers.error)}</ErrorBanner>
  const s = suppliers.data.find((x) => x.id === supplierId)
  if (!s) return <SupplierNotFound />

  return (
    <>
      <PageHeader title="Details" crumbs={supplierCrumbs(s)} />
      <Card title={s.name} actions={canManageSuppliers(auth) && <ButtonLink variant="ghost" to={`/suppliers/${s.id}/edit`}>Edit</ButtonLink>}>
        <Detail label="Contact">{s.contact_person}</Detail>
        <Detail label="Phone">{s.phone && <a className="text-slate" href={`tel:${s.phone}`}>{s.phone}</a>}</Detail>
        <Detail label="Address">{s.address}</Detail>
        <Detail label="PAN / VAT">{s.pan_vat}</Detail>
        <Detail label="Payment terms">{s.payment_terms}</Detail>
        {!hasDetails(s) && <p className="text-sm text-subtle">No contact details yet.</p>}
      </Card>
    </>
  )
}

/** Changing a supplier's details, on its own page; Save or Cancel goes back to Details. */
export function SupplierEditPage() {
  const { supplierId = '' } = useParams()
  const auth = useCompany()
  const navigate = useNavigate()
  const suppliers = useSuppliers(auth.companyId)

  if (suppliers.isPending) return <Spinner />
  if (suppliers.error) return <ErrorBanner onRetry={() => void suppliers.refetch()}>{friendlyError(suppliers.error)}</ErrorBanner>
  const s = suppliers.data.find((x) => x.id === supplierId)
  if (!s) return <SupplierNotFound />

  const details = `/suppliers/${s.id}/details`
  return (
    <>
      <PageHeader title="Edit supplier" crumbs={[...supplierCrumbs(s), { to: details, label: 'Details' }]} />
      <SupplierForm supplier={s} onDone={() => navigate(details, { replace: true })} />
    </>
  )
}

const supplierCrumbs = (s: Supplier) => [{ to: '/parties', label: 'Parties' }, { to: '/suppliers', label: 'Suppliers' }, { to: `/suppliers/${s.id}`, label: s.name }]

function SupplierNotFound() {
  return <EmptyState title="Supplier not found"><Link className="text-slate" to="/suppliers">Back to suppliers</Link></EmptyState>
}

/** The last billed rate for each material from this supplier: checked before ordering. */
export function SupplierRatesPage() {
  const { supplierId = '' } = useParams()
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)

  if (suppliers.isPending) return <Spinner />
  if (suppliers.error) return <ErrorBanner onRetry={() => void suppliers.refetch()}>{friendlyError(suppliers.error)}</ErrorBanner>
  const s = suppliers.data.find((x) => x.id === supplierId)
  if (!s || !auth.canSeeFinance) return <EmptyState title="Supplier not found"><Link className="text-slate" to="/suppliers">Back to suppliers</Link></EmptyState>

  return (
    <>
      <PageHeader
        title="Their rates"
        crumbs={supplierCrumbs(s)}
      />
      <TheirRates supplierId={s.id} emptyText="No posted bills with rates yet." />
    </>
  )
}

function BillList({ supplierId }: { supplierId: string }) {
  const bills = useBills({ supplierId })
  return (
    <Card>
      {bills.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void bills.refetch()}>{bills.error && friendlyError(bills.error)}</ErrorBanner>
      {bills.data?.length === 0 && <p className="text-sm text-subtle">No bills.</p>}
      <ul>{bills.data?.map((b) => <BillRow key={b.id} bill={b} />)}</ul>
      <ShowMore list={bills} />
    </Card>
  )
}
