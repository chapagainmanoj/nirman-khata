// One delivery (challan): what came, its photo, returns, and the way to its bill (req §10, §20).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateText } from '../../components/DateInput'
import { Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { memberName, useMembers } from '../projects/api'
import { rpc, useDelivery, useDeliveryStatusFor } from './api'
import { billableQty, DeliveryLines, isLocked, ReturnForm } from './DeliveryList'
import { canEnter } from './permissions'

export function DeliveryDetailPage() {
  const { deliveryId = '' } = useParams()
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const delivery = useDelivery(deliveryId)
  const status = useDeliveryStatusFor(deliveryId ? [deliveryId] : [])
  const members = useMembers(auth.companyId)
  const [returning, setReturning] = useState(false)

  const remove = useMutation({
    mutationFn: () => rpc('delete_delivery', { p_delivery: deliveryId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      void navigate('/deliveries', { replace: true })
    },
  })

  if (delivery.isPending) return <Spinner />
  if (delivery.error) return <ErrorBanner onRetry={() => void delivery.refetch()}>{friendlyError(delivery.error)}</ErrorBanner>
  const d = delivery.data
  if (!d) return <EmptyState title="Delivery not found">It does not exist, or it is for a project you cannot see.</EmptyState>

  return (
    <>
      <PageHeader
        title={d.challan_no ? `Challan ${d.challan_no}` : 'Delivery'}
        crumbs={[{ to: '/deliveries', label: 'Deliveries' }]}
        subtitle={<><Link className="text-slate" to={`/suppliers/${d.supplier_id}`}>{d.suppliers?.name}</Link> · <DateText value={d.receipt_date} display={auth.dateDisplay} /></>}
        actions={canEnter(auth) && billableQty(d, status) > 0 && (
          <ButtonLink variant="tonal" to={`/bills/new?supplier=${d.supplier_id}&delivery=${d.id}`}>Enter bill for this</ButtonLink>
        )}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="What came">
          <DeliveryLines d={d} status={status} />
          {canEnter(auth) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {!returning && <Button variant="ghost" onClick={() => setReturning(true)}>Return items</Button>}
              {!isLocked(d, status) && (
                <ConfirmButton label="Delete this delivery" confirmLabel="Delete" disabled={remove.isPending} onConfirm={() => remove.mutate()}>
                  Delete
                </ConfirmButton>
              )}
            </div>
          )}
          {returning && <ReturnForm d={d} onDone={() => setReturning(false)} />}
          <ErrorBanner>{remove.error && friendlyError(remove.error)}</ErrorBanner>
        </Card>

        <Card title="Delivery">
          <Detail label="Received on"><DateText value={d.receipt_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label="Project">{d.projects && <Link className="text-slate" to={`/projects/${d.project_id}`}>{d.projects.code} · {d.projects.name}</Link>}</Detail>
          <Detail label="Order slip">{d.slip_id && <Link className="text-slate" to={`/slips/${d.slip_id}`}>{d.order_slips?.number}</Link>}</Detail>
          <Detail label="No order slip">{!d.slip_id && d.no_slip_reason}</Detail>
          <Detail label="Received by">{memberName(members.data, d.received_by)}</Detail>
          <Detail label="Note">{d.note}</Detail>
        </Card>

        <Card title="Challan photo">
          <Attachments owner={{ delivery_id: d.id }} canAdd={canEnter(auth)} label="Add challan photo" />
        </Card>
      </div>
    </>
  )
}
