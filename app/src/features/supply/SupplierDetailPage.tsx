// One supplier: contact, balance, khata, bills, payments, and matching payments to bills.
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Button, ButtonLink, Card, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { BalanceCard, Khata, MatchCard, PaymentList, Tabs } from '../parties/PartyParts'
import { useBills, useSuppliers } from './api'
import { BillRow } from './BillRow'
import { usePartyBalances } from '../parties/api'
import { canEnter, canManageSuppliers, canRecordPayments } from './permissions'
import { SupplierForm } from './SuppliersPage'

type Tab = 'khata' | 'bills' | 'payments'

export function SupplierDetailPage() {
  const { supplierId = '' } = useParams()
  const auth = useCompany()
  const suppliers = useSuppliers(auth.companyId)
  const balances = usePartyBalances(auth.companyId, 'supplier', auth.canSeeFinance)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Tab>(auth.canSeeFinance ? 'khata' : 'bills')

  if (suppliers.isPending) return <Spinner />
  if (suppliers.error) return <ErrorBanner onRetry={() => void suppliers.refetch()}>{friendlyError(suppliers.error)}</ErrorBanner>
  const s = suppliers.data.find((x) => x.id === supplierId)
  if (!s) return <EmptyState title="Supplier not found"><Link className="text-brand" to="/suppliers">Back to suppliers</Link></EmptyState>

  // The main action follows the situation: pay when money is owed, otherwise order.
  const owes = (balances.data?.find((x) => x.party_id === supplierId)?.balance_paisa ?? 0) > 0
  const payFirst = owes && canRecordPayments(auth)
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
            {canRecordPayments(auth) && <ButtonLink variant={payFirst ? 'primary' : 'secondary'} to={`/payments/new?supplier=${s.id}`}>Record payment</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant={payFirst ? 'secondary' : 'primary'} to={`/slips/new?supplier=${s.id}`}>New slip</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant="secondary" to={`/bills/new?supplier=${s.id}`}>Enter bill</ButtonLink>}
          </div>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {editing ? (
          <div className="lg:col-span-2"><SupplierForm supplier={s} onDone={() => setEditing(false)} /></div>
        ) : (
          <Card title="Details" actions={canManageSuppliers(auth) && <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
            <Detail label="Contact">{s.contact_person}</Detail>
            <Detail label="Phone">{s.phone && <a className="text-brand" href={`tel:${s.phone}`}>{s.phone}</a>}</Detail>
            <Detail label="Address">{s.address}</Detail>
            <Detail label="PAN / VAT">{s.pan_vat}</Detail>
            <Detail label="Payment terms">{s.payment_terms}</Detail>
          </Card>
        )}
        {auth.canSeeFinance && <BalanceCard kind="supplier" partyId={s.id} />}
        {auth.canSeeFinance && canRecordPayments(auth) && <MatchCard kind="supplier" partyId={s.id} />}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Supplier records">
        {tab === 'khata' && <Khata kind="supplier" partyId={s.id} />}
        {tab === 'bills' && <BillList supplierId={s.id} />}
        {tab === 'payments' && <PaymentList kind="supplier" partyId={s.id} />}
      </Tabs>
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
    </Card>
  )
}
