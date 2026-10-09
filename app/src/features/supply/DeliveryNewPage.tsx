// Record what arrived at site (challan), against a slip or without one (req §10).
// Against a slip, lines are pre-filled with what is still pending, so staff only correct numbers.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { Button, ButtonLink, Card, ErrorBanner, Field, Input, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { DELIVERY_ISSUES } from '../../lib/labels'
import { useMaterials, useUnits } from '../catalog/api'
import { useProjects } from '../projects/api'
import { rpc, useSlip, useSuppliers } from './api'

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
}

export function DeliveryNewPage() {
  const [params] = useSearchParams()
  const slipId = params.get('slip') ?? ''
  const slip = useSlip(slipId)
  if (slipId && slip.isPending) return <Spinner />
  if (slipId && (slip.error || !slip.data)) return <ErrorBanner>{slip.error ? friendlyError(slip.error) : 'Slip not found.'}</ErrorBanner>
  return <DeliveryForm slip={slip.data ?? null} projectParam={params.get('project') ?? ''} supplierParam={params.get('supplier') ?? ''} />
}

function DeliveryForm({ slip, projectParam, supplierParam }: {
  slip: NonNullable<ReturnType<typeof useSlip>['data']> | null
  projectParam: string
  supplierParam: string
}) {
  const auth = useCompany()
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
      challan: '', reason: '', note: '', lines: slip ? slipLines(projectParam) : [blank()],
    },
  })
  const draft = useFormDraft(form, {
    userId: auth.userId, companyId: auth.companyId, formKey: `delivery-${slip?.slip.id ?? 'no-slip'}-${projectParam}`,
  })
  const { id, supplierId, projectId, date, challan, reason, note, lines } = form.watch()
  const set = <K extends keyof Values>(k: K) => (value: Values[K]) => form.setValue(k, value as never)
  const [setSupplierId, setProjectId, setDate, setChallan, setReason, setNote, setLines] =
    [set('supplierId'), set('projectId'), set('date'), set('challan'), set('reason'), set('note'), set('lines')]
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const slipProjects = slip ? [...new Set(slip.lines.map((l) => l.project_id))] : []

  const save = useMutation({
    mutationFn: () => rpc('record_delivery', { p_delivery: {
      id, supplier_id: supplierId, project_id: projectId, slip_id: slip?.slip.id ?? null, challan_no: challan,
      receipt_date: date, no_slip_reason: slip ? null : reason, note,
      lines: lines.filter((l) => Number(l.received) > 0).map((l) => ({
        id: l.id, slip_line_id: l.slip_line_id, material_id: l.material_id && l.material_id !== 'other' ? l.material_id : null,
        material_text: l.material_id === 'other' || !l.material_id ? l.material_text : null,
        unit_id: l.unit_id, unit_note: l.unit_note || null, received_qty: Number(l.received),
        rejected_qty: Number(l.rejected) || 0, issue: l.issue || null, note: l.note || null,
      })),
    } }),
    onSuccess: async () => {
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
    const problem =
      !supplierId ? 'Choose the supplier.'
      : !projectId ? 'Choose the project.'
      : !slip && !reason.trim() ? 'Say why there is no slip (e.g. urgent purchase).'
      : !filled.length ? 'Enter at least one received quantity.'
      : filled.find((l) => !l.slip_line_id && (!l.unit_id || (!l.material_id || (l.material_id === 'other' && !l.material_text.trim()))))
        ? 'Each item needs a material and unit.'
      : filled.find((l) => Number(l.rejected) > Number(l.received)) ? 'Rejected cannot be more than received.'
      : filled.find((l) => units.data?.find((u) => u.id === l.unit_id)?.needs_note && !l.unit_note.trim())
        ? 'Describe the trip or load (vehicle, size).'
      : ''
    setError(problem)
    if (!problem) save.mutate()
  }

  if (saved) {
    return (
      <>
        <PageHeader title="Delivery recorded" />
        <Card title="Challan photo">
          <p className="mb-3 text-sm text-subtle">Take a photo of the challan so accounts can match the bill.</p>
          <Attachments owner={{ delivery_id: id }} canAdd label="Take challan photo" />
        </Card>
        <div className="mt-4 flex gap-2">
          {slip ? <ButtonLink to={`/slips/${slip.slip.id}`}>Back to slip</ButtonLink> : <ButtonLink to={`/projects/${projectId}`}>Back to project</ButtonLink>}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Record delivery" subtitle={slip ? `${slip.slip.number} · ${slip.slip.suppliers?.name}` : 'Without an order slip'} />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored your unsaved delivery.</Notice></div>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {!slip && (
              <Field label="Supplier" htmlFor="dl-supplier">
                <Select id="dl-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Choose supplier</option>
                  {suppliers.data?.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Project (site)" htmlFor="dl-project">
              <Select id="dl-project" value={projectId}
                onChange={(e) => { setProjectId(e.target.value); if (slip) setLines(slipLines(e.target.value)) }}>
                <option value="">Choose project</option>
                {(projects.data ?? []).filter((p) => !slip || slipProjects.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Received on" htmlFor="dl-date"><DateInput id="dl-date" value={date} onChange={setDate} display={auth.dateDisplay} /></Field>
            <Field label="Challan number" htmlFor="dl-challan"><Input id="dl-challan" value={challan} onChange={(e) => setChallan(e.target.value)} /></Field>
            {!slip && (
              <Field label="Why no slip?" htmlFor="dl-reason"><Input id="dl-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            )}
          </div>
        </Card>

        {slip && projectId && lines.length === 0 && <Notice>Everything on this slip for this project has been received.</Notice>}
        {lines.map((l, i) => (
          <Card key={l.id} title={l.slip_line_id ? l.label : `Item ${i + 1}`}
            actions={lines.length > 1 && <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {!l.slip_line_id && (
                <>
                  <Field label="Material" htmlFor={`dl${i}-m`}>
                    <Select id={`dl${i}-m`} value={l.material_id} onChange={(e) => {
                      const m = materials.data?.find((x) => x.id === e.target.value)
                      setLine(i, { material_id: e.target.value, unit_id: m?.default_unit_id ?? l.unit_id })
                    }}>
                      <option value="">Choose material</option>
                      {materials.data?.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      <option value="other">Other (type it)</option>
                    </Select>
                  </Field>
                  {l.material_id === 'other' && (
                    <Field label="Material name" htmlFor={`dl${i}-mt`}>
                      <Input id={`dl${i}-mt`} value={l.material_text} onChange={(e) => setLine(i, { material_text: e.target.value })} />
                    </Field>
                  )}
                  <Field label="Unit" htmlFor={`dl${i}-u`}>
                    <Select id={`dl${i}-u`} value={l.unit_id} onChange={(e) => setLine(i, { unit_id: e.target.value })}>
                      <option value="">Unit</option>
                      {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  {units.data?.find((u) => u.id === l.unit_id)?.needs_note && (
                    <Field label="Which vehicle / size?" htmlFor={`dl${i}-un`}>
                      <Input id={`dl${i}-un`} value={l.unit_note} onChange={(e) => setLine(i, { unit_note: e.target.value })} />
                    </Field>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Received${l.slip_line_id ? ` (${units.data?.find((u) => u.id === l.unit_id)?.code ?? ''})` : ''}`} htmlFor={`dl${i}-r`}>
                  <Input id={`dl${i}-r`} inputMode="decimal" value={l.received} onChange={(e) => setLine(i, { received: e.target.value })} />
                </Field>
                <Field label="Rejected" htmlFor={`dl${i}-x`}>
                  <Input id={`dl${i}-x`} inputMode="decimal" value={l.rejected} onChange={(e) => setLine(i, { rejected: e.target.value })} />
                </Field>
              </div>
              <Field label="Problem" htmlFor={`dl${i}-i`}>
                <Select id={`dl${i}-i`} value={l.issue} onChange={(e) => setLine(i, { issue: e.target.value })}>
                  <option value="">No problem</option>
                  {Object.entries(DELIVERY_ISSUES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              {(l.issue || Number(l.rejected) > 0) && (
                <Field label="What was wrong?" htmlFor={`dl${i}-n`}>
                  <Input id={`dl${i}-n`} value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} />
                </Field>
              )}
            </div>
          </Card>
        ))}
        {!slip && <div><Button type="button" variant="secondary" onClick={() => setLines([...lines, blank()])}>Add another item</Button></div>}
        <Field label="Note" htmlFor="dl-note"><Input id="dl-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={save.isPending}>Save delivery</Button>
          <Button type="button" variant="secondary" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
        </div>
      </form>
    </>
  )
}
