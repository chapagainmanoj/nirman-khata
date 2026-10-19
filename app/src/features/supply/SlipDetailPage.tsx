// One order slip: lines by project with received vs remaining (req §9.2 step 7), approval,
// sharing with the supplier, deliveries against it.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Notice, PageHeader, Spinner, Status } from '../../components/ui'
import { formatDate, formatDateTime, formatDual, relativeDay } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { FULFILMENT, SLIP_STATUS } from '../../lib/labels'
import { formatNPR, lineAmount } from '../../lib/money'
import { platform } from '../../platform'
import { memberName, useMembers, useProjects } from '../projects/api'
import { rpc, useSlip } from './api'
import { DeliveryList } from './DeliveryList'
import { useState } from 'react'
import { ArrowRightIcon, CheckIcon, ShareIcon } from '../../components/icons'
import { t } from '../../lib/i18n'

const qty = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }))

export function SlipDetailPage() {
  const { slipId = '' } = useParams()
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Sent again after a lost answer: the first send had gone through.
  const alreadySent = !!(useLocation().state as { alreadySent?: boolean } | null)?.alreadySent
  const slip = useSlip(slipId)
  const projects = useProjects(auth.companyId)
  const members = useMembers(auth.companyId)
  const [shareNote, setShareNote] = useState('')
  const [moreActions, setMoreActions] = useState(false)

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['slip', slipId] })
      await queryClient.invalidateQueries({ queryKey: ['slips'] })
    },
  })

  if (slip.isPending) return <Spinner />
  if (slip.error) return <ErrorBanner onRetry={() => void slip.refetch()}>{friendlyError(slip.error)}</ErrorBanner>
  if (!slip.data) return <EmptyState title={t('slipDetail.orderSlipNotFound')}><Link className="text-slate" to="/slips">{t('slipDetail.backToOrderSlips')}</Link></EmptyState>

  const { slip: s, lines, perms } = slip.data
  const [statusLabel, statusTone] = SLIP_STATUS[s.status]
  const [fLabel, fTone] = FULFILMENT[perms?.fulfilment ?? 'not_received']
  // "Received 60 / 640 bags" when every line uses one unit; otherwise the badge says enough.
  const allLines = lines
  const oneUnit = allLines.length > 0 && allLines.every((l) => l.unit_id === allLines[0].unit_id)
  const received = oneUnit && allLines.some((l) => l.progress)
    ? `${qty(allLines.reduce((t, l) => t + Number(l.progress?.received_qty ?? 0), 0))} / ${qty(allLines.reduce((t, l) => t + Number(l.qty), 0))} ${allLines[0].units?.name ?? ''}`
    : ''
  const project = (id: string) => projects.data?.find((p) => p.id === id)
  const byProject = [...new Set(lines.map((l) => l.project_id))].map((id) => ({ id, lines: lines.filter((l) => l.project_id === id) }))
  const lineName = (l: (typeof lines)[number]) => l.materials?.name ?? l.material_text ?? t('common.material')
  const err = act.error && friendlyError(act.error)
  // What an approver weighs: when it is needed and roughly what it costs.
  const priced = lines.filter((l) => l.est_rate_paisa !== null)
  const estimate = priced.reduce((t, l) => t + (lineAmount(Number(l.est_rate_paisa), l.qty) ?? 0), 0)
  const facts = [
    s.required_date && s.status !== 'cancelled' && !['fully_received', 'closed_short'].includes(perms?.fulfilment ?? '') &&
      t('slipDetail.neededByRequireddateRequireddate2', { requiredDate: formatDate(s.required_date, auth.dateDisplay), requiredDate2: relativeDay(s.required_date) }),
    priced.length > 0 && `Est. ${formatNPR(estimate)}${priced.length < lines.length ? ` for ${priced.length} of ${lines.length} lines` : ''}`,
  ].filter(Boolean).join(' · ')

  async function share() {
    const text = [
      t('slipDetail.orderSlipNumber', { number: s.number }),
      auth.company.name,
      t('slipDetail.toName', { name: s.suppliers?.name }),
      t('slipDetail.dateRequestdate', { requestDate: formatDual(s.request_date, auth.dateDisplay) }),
      s.required_date && t('slipDetail.neededByRequireddate', { requiredDate: formatDual(s.required_date, auth.dateDisplay) }),
      ...byProject.flatMap((g) => [
        '',
        t('slipDetail.forValueValue2', { value: project(g.id)?.code ?? '', value2: project(g.id)?.name ?? '' }),
        ...g.lines.map((l, i) => `${i + 1}. ${lineName(l)}${l.spec ? ` (${l.spec})` : ''}: ${qty(l.qty)} ${l.units?.name ?? ''}${l.unit_note ? ` ${l.unit_note}` : ''}${l.note ? ` - ${l.note}` : ''}`),
      ]),
      '',
      s.site_contact && t('slipDetail.siteContactSitecontact', { siteContact: s.site_contact }),
      s.delivery_instructions && t('slipDetail.instructionsDeliveryinstructions', { deliveryInstructions: s.delivery_instructions }),
    ].filter((x): x is string => typeof x === 'string').join('\n')
    const result = await platform.share({ title: t('slipDetail.orderSlipNumber2', { number: s.number }), text })
    if (result === 'cancelled') return
    if (result === 'unsupported') return setShareNote(t('slipDetail.sharingIsNotAvailable'))
    setShareNote(result === 'copied' ? t('slipDetail.copiedPasteItInto') : '')
    act.mutate(() => rpc('mark_slip_sent', { p_slip: s.id, p_via: result === 'copied' ? 'copied' : 'share' }))
  }

  return (
    <>
      <PageHeader
        title={`${s.number} · ${s.suppliers?.name ?? ''}`}
        crumbs={[{ to: '/slips', label: t('slipDetail.orderSlips') }]}
        subtitle={
          s.status === 'approved' ? (
            // One progress line instead of three badges: Approved → Sent → Received.
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label={t('slipDetail.progress')}>
              <li className="inline-flex items-center gap-1 font-medium text-good-ink"><CheckIcon size={16} />{statusLabel}</li>
              <li aria-hidden className="text-subtle"><ArrowRightIcon size={14} /></li>
              <li className={`inline-flex items-center gap-1 font-medium ${s.sent_at ? 'text-good-ink' : 'text-warn-ink'}`}>
                {s.sent_at ? <><CheckIcon size={16} />{t('slipDetail.sent')}</> : t('slipDetail.notSentYet')}
              </li>
              <li aria-hidden className="text-subtle"><ArrowRightIcon size={14} /></li>
              <li><Badge tone={fTone}>{fLabel}</Badge>{received && <span className="ml-1 text-subtle tabular-nums">{received}</span>}</li>
            </ol>
          ) : <Badge tone={statusTone}>{statusLabel}</Badge>
        }
        after={facts && <p className="mt-1 text-sm font-medium text-ink">{facts}</p>}
      />
      {alreadySent && <div className="mb-4"><Notice>{t('slipDetail.thisOrderSlipHad')}</Notice></div>}
      {s.status === 'rejected' && s.rejected_reason && <div className="mb-4"><Notice>{t('slipDetail.rejectedRejectedreason', { rejectedReason: s.rejected_reason })}</Notice></div>}
      {s.closed_short_reason && <div className="mb-4"><Notice>{t('slipDetail.closedShortClosedshortreason', { closedShortReason: s.closed_short_reason })}</Notice></div>}

      {/* One row of actions; a reason form that opens takes the full width below them. */}
      <div className="mb-4 flex flex-wrap items-start gap-2 empty:hidden">
        {perms?.can_edit && <ButtonLink variant="secondary" to={`/slips/${s.id}/edit`}>{t('common.edit')}</ButtonLink>}
        {perms?.can_submit && (
          <Button busy={act.isPending} onClick={() => act.mutate(() => rpc('submit_slip', { p_slip: s.id }))}>
            {auth.company.slip_approval_required ? t('slipDetail.submitForApproval') : t('slipDetail.submit')}
          </Button>
        )}
        {perms?.can_approve && (
          <Button busy={act.isPending} onClick={() => act.mutate(() => rpc('decide_slip', { p_slip: s.id, p_approve: true }))}>{t('slipDetail.approve')}</Button>
        )}
        {perms?.can_share && <Button variant={s.sent_at ? 'secondary' : 'primary'} onClick={() => void share()}><ShareIcon size={18} />{t('slipDetail.shareWithSupplier')}</Button>}
        {perms?.can_delete && (
          <ConfirmButton confirmLabel={t('slipDetail.deleteDraft')}
            onConfirm={() => act.mutate(async () => { await rpc('delete_slip_draft', { p_slip: s.id }); navigate('/slips', { replace: true }) })}>
            {t('slipDetail.delete')}</ConfirmButton>
        )}
        {perms?.can_approve && (
          <ReasonButton title={t('slipDetail.rejectThisOrderSlip')} confirmLabel={t('slipDetail.reject')} variant="danger" busy={act.isPending} error={err}
            onConfirm={(reason) => act.mutate(() => rpc('decide_slip', { p_slip: s.id, p_approve: false, p_reason: reason }))}>
            {t('slipDetail.reject')}</ReasonButton>
        )}
        {(perms?.can_close_short || perms?.can_cancel) && !moreActions && (
          <Button variant="ghost" aria-expanded={false} onClick={() => setMoreActions(true)}>{t('slipDetail.moreActions')}</Button>
        )}
        {perms?.can_close_short && moreActions && (
          <ReasonButton title={t('slipDetail.closeShort')} hint={t('slipDetail.eg.supplierOutOf')} confirmLabel={t('slipDetail.closeOrderSlip')}
            busy={act.isPending} error={err}
            onConfirm={(reason) => act.mutate(() => rpc('close_slip_short', { p_slip: s.id, p_reason: reason }))}>
            {t('slipDetail.closeShort')}</ReasonButton>
        )}
        {perms?.can_cancel && moreActions && (
          <ReasonButton title={t('slipDetail.cancelThisOrderSlip')} confirmLabel={t('slipDetail.cancelOrderSlip')} variant="danger" busy={act.isPending} error={err}
            onConfirm={(reason) => act.mutate(() => rpc('cancel_slip', { p_slip: s.id, p_reason: reason }))}>
            {t('slipDetail.cancelSlip')}</ReasonButton>
        )}
      </div>
      <Status className="mb-4 text-sm text-subtle">{shareNote}</Status>
      <ErrorBanner>{err}</ErrorBanner>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {byProject.map((g) => (
          <Card key={g.id} title={`${project(g.id)?.code ?? ''} · ${project(g.id)?.name ?? t('slipDetail.project')}`}
            actions={perms?.can_record_delivery && (
              <ButtonLink variant="secondary" to={`/deliveries/new?slip=${s.id}&project=${g.id}`}>{t('slipDetail.recordDelivery')}</ButtonLink>
            )}>
            <ul>
              {g.lines.map((l) => (
                <li key={l.id} className="border-b border-line py-2 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium break-words text-ink">{lineName(l)}{l.spec && <span className="text-subtle"> · {l.spec}</span>}</div>
                      {l.note && <div className="text-xs text-subtle">{l.note}</div>}
                      {l.est_rate_paisa !== null && <div className="text-xs text-subtle">{t('slipDetail.expectedEstratePerCode', { estRate: formatNPR(l.est_rate_paisa), code: l.units?.code })}</div>}
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      <div className="font-semibold text-ink">{qty(l.qty)} {l.units?.name}{l.unit_note && <span className="font-normal text-subtle"> {l.unit_note}</span>}</div>
                      {s.status === 'approved' && l.progress && (
                        <>
                          <div className="text-xs text-subtle">
                            {t('slipDetail.receivedReceivedqtyPendingRemainingqty', { receivedQty: qty(l.progress.received_qty), remainingQty: qty(l.progress.remaining_qty) })}</div>
                          <div className="mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className="h-full rounded-full bg-good-ink" style={{ width: `${Math.min(100, (Number(l.progress.received_qty) / Number(l.qty)) * 100)}%` }} />
                          </div>
                        </>
                      )}
                      {l.progress?.over_received && <Badge tone="warn">{t('slipDetail.moreThanOrdered')}</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Card title={t('slipDetail.orderSlip')}>
          <Detail label={t('slipDetail.requested')}><DateText value={s.request_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label={t('slipDetail.neededBy')}>{s.required_date && <DateText value={s.required_date} display={auth.dateDisplay} dual />}</Detail>
          <Detail label={t('slipDetail.requestedBy')}>{memberName(members.data, s.created_by)}</Detail>
          {s.decided_by && <Detail label={s.status === 'rejected' ? t('slipDetail.rejectedBy') : t('slipDetail.approvedBy')}>{memberName(members.data, s.decided_by)}</Detail>}
          <Detail label={t('slipDetail.siteContact')}>{s.site_contact}</Detail>
          <Detail label={t('slipDetail.instructions')}>{s.delivery_instructions}</Detail>
          <Detail label={t('slipDetail.notes')}>{s.notes}</Detail>
          {s.sent_at && <Detail label={t('slipDetail.sent')}>{formatDateTime(s.sent_at, auth.dateDisplay)}</Detail>}
        </Card>
      </div>

      {s.status === 'approved' && (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-ink">{t('slipDetail.deliveries')}</h2>
          <DeliveryList filter={{ slipId: s.id }} />
        </section>
      )}
    </>
  )
}
