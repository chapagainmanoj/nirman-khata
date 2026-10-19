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
import { t } from '../../lib/i18n'

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
  if (!d) return <EmptyState title={t('deliveryDetail.deliveryNotFound')}>{t('deliveryDetail.itDoesNotExist')}</EmptyState>

  return (
    <>
      <PageHeader
        title={d.challan_no ? t('deliveryDetail.challanChallanno', { challanNo: d.challan_no }) : t('deliveryDetail.delivery')}
        crumbs={[{ to: '/deliveries', label: t('deliveryDetail.deliveries') }]}
        subtitle={<><Link className="text-slate" to={`/suppliers/${d.supplier_id}`}>{d.suppliers?.name}</Link> · <DateText value={d.receipt_date} display={auth.dateDisplay} /></>}
        actions={canEnter(auth) && billableQty(d, status) > 0 && (
          <ButtonLink variant="tonal" to={`/bills/new?supplier=${d.supplier_id}&delivery=${d.id}`}>{t('deliveryDetail.enterBillForThis')}</ButtonLink>
        )}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('deliveryDetail.whatCame')}>
          <DeliveryLines d={d} status={status} />
          {canEnter(auth) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {!returning && <Button variant="ghost" onClick={() => setReturning(true)}>{t('deliveryDetail.returnItems')}</Button>}
              {!isLocked(d, status) && (
                <ConfirmButton label={t('deliveryDetail.deleteThisDelivery')} confirmLabel={t('deliveryDetail.delete')} disabled={remove.isPending} onConfirm={() => remove.mutate()}>
                  {t('deliveryDetail.delete')}</ConfirmButton>
              )}
            </div>
          )}
          {returning && <ReturnForm d={d} onDone={() => setReturning(false)} />}
          <ErrorBanner>{remove.error && friendlyError(remove.error)}</ErrorBanner>
        </Card>

        <Card title={t('deliveryDetail.delivery')}>
          <Detail label={t('deliveryDetail.receivedOn')}><DateText value={d.receipt_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label={t('deliveryDetail.project')}>{d.projects && <Link className="text-slate" to={`/projects/${d.project_id}`}>{d.projects.code} · {d.projects.name}</Link>}</Detail>
          <Detail label={t('deliveryDetail.orderSlip')}>{d.slip_id && <Link className="text-slate" to={`/slips/${d.slip_id}`}>{d.order_slips?.number}</Link>}</Detail>
          <Detail label={t('deliveryDetail.noOrderSlip')}>{!d.slip_id && d.no_slip_reason}</Detail>
          <Detail label={t('deliveryDetail.receivedBy')}>{memberName(members.data, d.received_by)}</Detail>
          <Detail label={t('common.note')}>{d.note}</Detail>
        </Card>

        <Card title={t('deliveryDetail.challanPhoto')}>
          <Attachments owner={{ delivery_id: d.id }} canAdd={canEnter(auth)} label={t('deliveryDetail.addChallanPhoto')} />
        </Card>
      </div>
    </>
  )
}
