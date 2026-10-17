// One supplier, in the order a contractor asks: what do I owe and for which bills, call them,
// what is on the way or came without a bill, their rates; then the full record and contact details.
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Button, ButtonLink, Card, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { BalanceCard, Khata, MatchCard, PaymentList, Tabs } from '../parties/PartyParts'
import { useBills, useSuppliers } from './api'
import { ShowMore } from '../../components/ShowMore'
import { BillRow } from './BillRow'
import { usePartyBalances } from '../parties/api'
import { canEnter, canManageSuppliers, canRecordPayments } from './permissions'
import { SupplierForm } from './SuppliersPage'
import { ComingFromThem, OwedByProject, TheirRates, UnpaidBills } from './SupplierParts'
import { parseLoginId } from '../../lib/login-id'

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
  if (!s) return <EmptyState title="Supplier not found"><Link className="text-slate" to="/suppliers">Back to suppliers</Link></EmptyState>

  // The main action follows the situation: pay when money is owed, otherwise order.
  const owes = (balances.data?.find((x) => x.party_id === supplierId)?.balance_paisa ?? 0) > 0
  const payFirst = owes && canRecordPayments(auth)
  const mobile = s.phone ? parseLoginId(s.phone) : null
  const whatsApp = mobile?.kind === 'phone' ? `https://wa.me/${mobile.phone.slice(1)}` : null
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
            {canEnter(auth) && <ButtonLink variant={payFirst ? 'secondary' : 'primary'} to={`/slips/new?supplier=${s.id}`}>New order slip</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant="secondary" to={`/bills/new?supplier=${s.id}`}>Enter bill</ButtonLink>}
          </div>
        }
      />
      {/* One tap to call or message: how most orders and reminders happen. */}
      {s.phone && (
        <div className="-mt-2 mb-4 flex flex-wrap gap-2">
          <ButtonLink variant="secondary" to={`tel:${s.phone}`} reloadDocument>Call {s.phone}</ButtonLink>
          {whatsApp && <ButtonLink variant="secondary" to={whatsApp} reloadDocument target="_blank" rel="noreferrer">WhatsApp</ButtonLink>}
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {auth.canSeeFinance && <BalanceCard kind="supplier" partyId={s.id}><OwedByProject supplierId={s.id} /></BalanceCard>}
        {auth.canSeeFinance && <UnpaidBills supplierId={s.id} />}
        {canEnter(auth) && <ComingFromThem supplierId={s.id} />}
        {auth.canSeeFinance && <TheirRates supplierId={s.id} />}
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

      <div className="mt-6">
        {editing ? (
          <SupplierForm supplier={s} onDone={() => setEditing(false)} />
        ) : (
          <Card title="Details" actions={canManageSuppliers(auth) && <Button variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}>
            <Detail label="Contact">{s.contact_person}</Detail>
            <Detail label="Phone">{s.phone && <a className="text-slate" href={`tel:${s.phone}`}>{s.phone}</a>}</Detail>
            <Detail label="Address">{s.address}</Detail>
            <Detail label="PAN / VAT">{s.pan_vat}</Detail>
            <Detail label="Payment terms">{s.payment_terms}</Detail>
            {!s.contact_person && !s.phone && !s.address && !s.pan_vat && !s.payment_terms && <p className="text-sm text-subtle">No contact details yet.</p>}
          </Card>
        )}
      </div>
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
