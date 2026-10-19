// Record what arrived at site (challan), against a slip or without one (req §10).
// Against a slip, lines are pre-filled with what is still pending, so staff only correct numbers.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments, PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { Button, ButtonLink, Card, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select, Spinner, type Crumb } from '../../components/ui'
import { useSimpleForms } from '../../auth/useSimpleForms'
import { More } from '../../components/More'
import { revealField } from '../../lib/forms'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { newId } from '../../lib/ids'
import { DELIVERY_ISSUES } from '../../lib/labels'
import { useMaterials, useUnits } from '../catalog/api'
import { MaterialOptions } from '../catalog/MaterialOptions'
import { useProjects } from '../projects/api'
import { projectChoices, useWorkingOnDefault } from '../projects/current'
import { rpc, useOpenSlips, useSlip, useSuppliers } from './api'
import { ChevronRightIcon, TrashIcon } from '../../components/icons'

type Line = {
  id: string
  slip_line_id: string | null
  label: string
  material_id: string
  material_text: string
  unit_id: string
  unit_note: string
  received: string
  rejected: string
  issue: string
  note: string
}

// Kept on the phone until saved; the id stays the same so a retry after a lost reply
// returns the delivery already saved instead of recording it twice.
type Values = {
  id: string
  supplierId: string
  projectId: string
  date: string
  challan: string
  reason: string
  note: string
  lines: Line[]
  photos: PendingPhoto[] // challan photos taken before saving; uploaded with the delivery
}

export function DeliveryNewPage() {
  const [params] = useSearchParams()
  const slipId = params.get('slip') ?? ''
  const slip = useSlip(slipId)
  if (slipId && slip.isPending) return <Spinner />
  if (slipId && (slip.error || !slip.data)) return <ErrorBanner>{slip.error ? friendlyError(slip.error) : t('delivery.slipNotFound')}</ErrorBanner>
  // Keyed so picking an open slip below starts a fresh form with that slip's lines.
  return <DeliveryForm key={`${slipId}:${params.get('project') ?? ''}`} slip={slip.data ?? null} projectParam={params.get('project') ?? ''} supplierParam={params.get('supplier') ?? ''} />
}

function DeliveryForm({ slip, projectParam, supplierParam }: {
  slip: NonNullable<ReturnType<typeof useSlip>['data']> | null
  projectParam: string
  supplierParam: string
}) {
  const auth = useCompany()
  const simple = useSimpleForms()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const suppliers = useSuppliers(auth.companyId)
  const projects = useProjects(auth.companyId)
  const materials = useMaterials(auth.companyId)
  const units = useUnits(auth.companyId)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const slipLines = (pid: string): Line[] =>
    slip?.lines.filter((l) => l.project_id === pid && (l.progress?.remaining_qty ?? l.qty) > 0).map((l) => ({
      id: newId(), slip_line_id: l.id, label: `${l.materials?.name ?? l.material_text}${l.spec ? ` · ${l.spec}` : ''}`,
      material_id: l.material_id ?? '', material_text: l.material_text ?? '', unit_id: l.unit_id, unit_note: l.unit_note ?? '',
      received: String(l.progress?.remaining_qty ?? l.qty), rejected: '', issue: '', note: '',
    })) ?? []
  const blank = (): Line => ({
    id: newId(), slip_line_id: null, label: '', material_id: '', material_text: '', unit_id: '', unit_note: '',
    received: '', rejected: '', issue: '', note: '',
  })
  const form = useForm<Values>({
    defaultValues: {
      id: newId(), supplierId: slip?.slip.supplier_id ?? supplierParam, projectId: projectParam, date: todayKathmandu(),
      challan: '', reason: '', note: '', lines: slip ? slipLines(projectParam) : [blank()], photos: [],
    },
  })
  const draft = useFormDraft(form, {
    userId: auth.userId, companyId: auth.companyId, formKey: `delivery-${slip?.slip.id ?? 'no-slip'}-${projectParam}`,
  })
  const { id, supplierId, projectId, date, challan, reason, note, lines, photos } = form.watch()
  const [photoFailed, setPhotoFailed] = useState(0)
  const set = <K extends keyof Values>(k: K) => (value: Values[K]) => form.setValue(k, value as never)
  const [setSupplierId, setProjectId, setDate, setChallan, setReason, setNote, setLines] =
    [set('supplierId'), set('projectId'), set('date'), set('challan'), set('reason'), set('note'), set('lines')]
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const slipProjects = slip ? [...new Set(slip.lines.map((l) => l.project_id))] : []
  // Without an order slip or a project in the link, start on the Working on project.
  useWorkingOnDefault(projectId, setProjectId, !!slip || !!projectParam)

  const save = useMutation({
    mutationFn: async () => {
      await rpc('record_delivery', { p_delivery: {
      id, supplier_id: supplierId, project_id: projectId, slip_id: slip?.slip.id ?? null, challan_no: challan,
      receipt_date: date, no_slip_reason: slip ? null : reason, note,
      lines: lines.filter((l) => Number(l.received) > 0).map((l) => ({
        id: l.id, slip_line_id: l.slip_line_id, material_id: l.material_id && l.material_id !== 'other' ? l.material_id : null,
        material_text: l.material_id === 'other' || !l.material_id ? l.material_text : null,
        unit_id: l.unit_id, unit_note: l.unit_note || null, received_qty: Number(l.received),
        rejected_qty: Number(l.rejected) || 0, issue: l.issue || null, note: l.note || null,
      })),
      } })
      return uploadPending({ userId: auth.userId, companyId: auth.companyId }, { delivery_id: id }, photos)
    },
    onSuccess: async (failed) => {
      setPhotoFailed(failed)
      await draft.clear()
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      await queryClient.invalidateQueries({ queryKey: ['slip'] })
      await queryClient.invalidateQueries({ queryKey: ['slips'] })
      await queryClient.invalidateQueries({ queryKey: ['delivery-lines'] })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const filled = lines.filter((l) => Number(l.received) > 0)
    const overRejected = filled.find((l) => Number(l.rejected) > Number(l.received))
    const problem =
      !supplierId ? t('delivery.err.supplier')
      : !projectId ? t('delivery.err.project')
      : !slip && !reason.trim() ? t('delivery.err.reason')
      : !filled.length ? t('delivery.err.qty')
      : filled.find((l) => !l.slip_line_id && (!l.unit_id || (!l.material_id || (l.material_id === 'other' && !l.material_text.trim()))))
        ? t('delivery.err.item')
      : overRejected ? t('delivery.err.rejected')
      : filled.find((l) => units.data?.find((u) => u.id === l.unit_id)?.needs_note && !l.unit_note.trim())
        ? t('delivery.err.vehicle')
      : ''
    setError(problem)
    // The rejected field may sit in a closed fold (simple forms); show it.
    if (overRejected && problem === t('delivery.err.rejected')) revealField(`dl${lines.indexOf(overRejected)}-x`)
    if (!problem) save.mutate()
  }

  // Where it was started from: the slip, the project, or the Deliveries list.
  const fromProject = projects.data?.find((p) => p.id === projectParam)
  const crumbs: Crumb[] = slip
    ? [{ to: '/slips', label: t('nav.slips') }, { to: `/slips/${slip.slip.id}`, label: slip.slip.number }]
    : projectParam
      ? [{ to: '/projects', label: t('nav.projects') }, { to: `/projects/${projectParam}`, label: fromProject?.name ?? t('delivery.crumb.project') }]
      : [{ to: '/deliveries', label: t('nav.deliveries') }]

  if (saved) {
    return (
      <>
        <PageHeader title={t('delivery.saved.title')} crumbs={crumbs} />
        <Card title={t('delivery.photo')}>
          {photoFailed > 0 && <div className="mb-3"><Notice>{t('delivery.photo.failed')}</Notice></div>}
          {photos.length === 0 && <p className="mb-3 text-sm text-subtle">{t('delivery.photo.ask')}</p>}
          <Attachments owner={{ delivery_id: id }} canAdd label={t('delivery.photo.take')} />
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* The next step for a delivery is its bill. */}
          <ButtonLink to={`/bills/new?supplier=${supplierId}&delivery=${id}`}>{t('delivery.saved.bill')}</ButtonLink>
          {slip ? <ButtonLink variant="secondary" to={`/slips/${slip.slip.id}`}>{t('delivery.saved.slip')}</ButtonLink> : <ButtonLink variant="secondary" to={`/projects/${projectId}`}>{t('delivery.saved.project')}</ButtonLink>}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('delivery.title')} crumbs={crumbs} subtitle={slip ? `${slip.slip.number} · ${slip.slip.suppliers?.name}` : undefined} />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('delivery.restored')}</Notice></div>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!slip && <OpenSlips supplierId={supplierId} projectId={projectId} />}
        <Card title={t('delivery.photo')}>
          <PhotoPicker value={photos} onChange={(v) => form.setValue('photos', v)} label={t('delivery.photo.take')} what={t('delivery.photo')} />
        </Card>
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {!slip && (
              <Field label={t('common.supplier')} htmlFor="dl-supplier">
                <Select id="dl-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">{t('common.supplier.choose')}</option>
                  {suppliers.data?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t('delivery.project')} htmlFor="dl-project">
              <Select id="dl-project" value={projectId}
                onChange={(e) => { setProjectId(e.target.value); if (slip) setLines(slipLines(e.target.value)) }}>
                <option value="">{t('common.project.choose')}</option>
                {(slip ? (projects.data ?? []).filter((p) => slipProjects.includes(p.id)) : projectChoices(projects.data, 'site')).map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('delivery.date')} htmlFor="dl-date"><DateInput id="dl-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
            <Field label={t('delivery.challan')} htmlFor="dl-challan"><Input id="dl-challan" value={challan} onChange={(e) => setChallan(e.target.value)} /></Field>
            {!slip && (
              <Field label={t('delivery.reason')} htmlFor="dl-reason"><Input id="dl-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            )}
          </div>
        </Card>

        {slip && projectId && lines.length === 0 && <Notice>{t('delivery.allReceived')}</Notice>}
        {lines.map((l, i) => (
          <Card key={l.id} title={l.slip_line_id ? l.label : t('delivery.item', { n: i + 1 })}
            actions={lines.length > 1 && <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}><TrashIcon size={16} />{t('common.remove')}</Button>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {!l.slip_line_id && (
                <>
                  <Field label={t('common.material')} htmlFor={`dl${i}-m`}>
                    <Select id={`dl${i}-m`} value={l.material_id} onChange={(e) => {
                      const m = materials.data?.find((x) => x.id === e.target.value)
                      setLine(i, { material_id: e.target.value, unit_id: m?.default_unit_id ?? l.unit_id })
                    }}>
                      <option value="">{t('common.material.choose')}</option>
                      <MaterialOptions companyId={auth.companyId} userId={auth.userId} />
                      <option value="other">{t('common.material.other')}</option>
                    </Select>
                  </Field>
                  {l.material_id === 'other' && (
                    <Field label={t('common.material.name')} htmlFor={`dl${i}-mt`}>
                      <Input id={`dl${i}-mt`} value={l.material_text} onChange={(e) => setLine(i, { material_text: e.target.value })} />
                    </Field>
                  )}
                  <Field label={t('common.unit')} htmlFor={`dl${i}-u`}>
                    <Select id={`dl${i}-u`} value={l.unit_id} onChange={(e) => setLine(i, { unit_id: e.target.value })}>
                      <option value="">{t('common.unit')}</option>
                      {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  {units.data?.find((u) => u.id === l.unit_id)?.needs_note && (
                    <Field label={t('delivery.vehicle')} htmlFor={`dl${i}-un`}>
                      <Input id={`dl${i}-un`} value={l.unit_note} onChange={(e) => setLine(i, { unit_note: e.target.value })} />
                    </Field>
                  )}
                </>
              )}
              {(() => {
                const received = (
                  <Field label={l.slip_line_id ? t('delivery.received.unit', { unit: units.data?.find((u) => u.id === l.unit_id)?.code ?? '' }) : t('delivery.received')} htmlFor={`dl${i}-r`}>
                    <Input id={`dl${i}-r`} inputMode="decimal" value={l.received} onChange={(e) => setLine(i, { received: e.target.value })} />
                  </Field>
                )
                const rejected = (
                  <Field label={t('delivery.rejected')} htmlFor={`dl${i}-x`}>
                    <Input id={`dl${i}-x`} inputMode="decimal" value={l.rejected} onChange={(e) => setLine(i, { rejected: e.target.value })} />
                  </Field>
                )
                const issue = (
                  <Field label={t('delivery.problem')} htmlFor={`dl${i}-i`}>
                    <Select id={`dl${i}-i`} value={l.issue} onChange={(e) => setLine(i, { issue: e.target.value })}>
                      <option value="">{t('delivery.problem.none')}</option>
                      {Object.entries(DELIVERY_ISSUES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                )
                const wrong = (l.issue || Number(l.rejected) > 0) && (
                  <Field label={t('delivery.wrong')} htmlFor={`dl${i}-n`}>
                    <Input id={`dl${i}-n`} value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} />
                  </Field>
                )
                // Simple forms fold the problem fields; Detailed keeps Received and Rejected side by side.
                if (!simple) return <><div className="grid grid-cols-2 gap-3">{received}{rejected}</div>{issue}{wrong}</>
                const problemSummary = [Number(l.rejected) > 0 && t('delivery.problem.rejected', { qty: l.rejected }), l.issue && DELIVERY_ISSUES[l.issue as keyof typeof DELIVERY_ISSUES]]
                  .filter(Boolean).join(', ') || t('delivery.problem.summaryNone')
                return (
                  <>
                    {received}
                    <More label={t('delivery.problem.ask')} summary={problemSummary}>
                      <div className="grid grid-cols-2 gap-3">{rejected}{issue}</div>
                      {wrong}
                    </More>
                  </>
                )
              })()}
            </div>
          </Card>
        ))}
        {!slip && <div><Button type="button" variant="secondary" onClick={() => setLines([...lines, blank()])}>{t('delivery.addItem')}</Button></div>}
        <Field label={t('common.note')} htmlFor="dl-note"><Input id="dl-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending}>{t('delivery.save')}</Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>{t('common.cancel')}</Button>
        </FormActions>
      </form>
    </>
  )
}

/**
 * Most deliveries answer an order slip. Before typing a delivery "without a slip", offer the
 * open slips that fit the supplier and project chosen so far; picking one pre-fills its lines.
 */
function OpenSlips({ supplierId, projectId }: { supplierId: string; projectId: string }) {
  const auth = useCompany()
  const slips = useOpenSlips({ companyId: auth.companyId, supplierId: supplierId || undefined, projectId: projectId || undefined })
  const open = slips.data ?? []
  if (!open.length) return null
  return (
    <Card title={t('delivery.openSlips')}>
      <p className="mb-2 text-sm text-subtle">{t('delivery.openSlips.hint')}</p>
      <ul className="divide-y divide-line">
        {open.slice(0, 5).map((s) => {
          const project = projectId || s.project_ids[0] || ''
          return (
            <li key={s.id}>
              <Link to={`/deliveries/new?slip=${s.id}&project=${project}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm hover:text-brand-dark">
                <span className="min-w-0 truncate"><span className="font-semibold text-ink">{s.number}</span> · {s.suppliers?.name}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-slate">{t('delivery.openSlips.receive')}<ChevronRightIcon size={16} /></span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
