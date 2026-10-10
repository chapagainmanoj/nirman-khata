// Enter a supplier bill (req §11.2). Paper first: the photo comes before any typing, and site
// staff can send just the photo to Accounts, who type the lines while looking at it (photo on
// the left on wide screens). Lines per project and heading, matched deliveries, header charges.
// Saved as a draft on the server (and on the device while typing); Accounts can save and post.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments, PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, Checkbox, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { addDays, formatDate, todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { formatNPR, paisaToInput, parseNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useMaterials, useUnits } from '../catalog/api'
import { useHeadings, useProjects } from '../projects/api'
import { rpc, useBill, useDeliveryLineStatus, useSuppliers } from './api'
import { canEnter, canPost } from './permissions'

type Match = { delivery_line_id: string; billed_qty: string }
type BillLine = {
  id: string
  line_type: 'material' | 'charge'
  project_id: string
  heading_id: string
  material_id: string
  description: string
  qty: string
  unit_id: string
  unit_note: string
  rate: string
  amount: string
  amount_edited: boolean
  unmatched_reason: string
  rate_variance_reason: string
  matches: Match[]
}
type Override = { charge: 'discount' | 'transport' | 'vat'; project_id: string; amount: string }
export type BillValues = {
  id: string
  supplier_id: string
  bill_no: string
  bill_date: string
  cost_date: string
  due_date: string
  notes: string
  discount: string
  transport: string
  vat: string
  vat_rate: string
  split_charges: boolean
  overrides: Override[]
  lines: BillLine[]
  paper_total: string
  photos: PendingPhoto[] // taken before the first save
  post_key: string // operation key for "Save and post", kept until it succeeds
}

const rupees = (paisa: number | null | undefined) => paisaToInput(paisa ?? null)

export function BillEditPage() {
  const { billId } = useParams()
  const existing = useBill(billId ?? '', !!billId)
  if (billId && existing.isPending) return <Spinner />
  if (billId && existing.error) return <ErrorBanner onRetry={() => void existing.refetch()}>{friendlyError(existing.error)}</ErrorBanner>
  const d = billId ? existing.data : null
  if (billId && (!d?.bill || !['draft', 'under_review'].includes(d.bill.status))) return <ErrorBanner>This bill cannot be edited.</ErrorBanner>

  const initial: BillValues | undefined = d?.bill ? {
    id: d.bill.id, supplier_id: d.bill.supplier_id, bill_no: d.bill.bill_no ?? '', bill_date: d.bill.bill_date,
    // Saved as the bill date when left empty; keep it empty so a corrected bill date carries it along.
    cost_date: d.bill.cost_date === d.bill.bill_date ? '' : d.bill.cost_date, due_date: d.bill.due_date ?? '', notes: d.bill.notes ?? '',
    discount: rupees(d.charges?.discount_paisa), transport: rupees(d.charges?.transport_paisa), vat: rupees(d.charges?.vat_paisa),
    vat_rate: String(d.charges?.vat_rate_pct ?? 13), split_charges: d.overrides.length > 0,
    paper_total: rupees(d.charges?.paper_total_paisa), photos: [], post_key: newId(),
    overrides: d.overrides.map((o) => ({ charge: o.charge, project_id: o.project_id, amount: rupees(o.amount_paisa) })),
    lines: d.lines.map((l) => ({
      id: l.id, line_type: l.line_type, project_id: l.project_id, heading_id: l.heading_id, material_id: l.material_id ?? '',
      description: l.description ?? '', qty: l.qty === null ? '' : String(l.qty), unit_id: l.unit_id ?? '', unit_note: l.unit_note ?? '',
      rate: rupees(l.rate_paisa), amount: rupees(l.amount_paisa), amount_edited: true,
      unmatched_reason: l.unmatched_reason ?? '', rate_variance_reason: l.rate_variance_reason ?? '',
      matches: d.matches.filter((m) => m.bill_line_id === l.id).map((m) => ({ delivery_line_id: m.delivery_line_id, billed_qty: String(m.billed_qty) })),
    })),
  } : undefined
  return <BillForm key={billId ?? 'new'} initial={initial} />
}

function BillForm({ initial }: { initial?: BillValues }) {
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const suppliers = useSuppliers(auth.companyId)
  const projects = useProjects(auth.companyId)
  const headings = useHeadings(auth.companyId)
  const materials = useMaterials(auth.companyId)
  const units = useUnits(auth.companyId)
  const [error, setError] = useState('')
  const [dupWarning, setDupWarning] = useState('')
  const accounts = canPost(auth)

  const form = useForm<BillValues>({
    defaultValues: initial ?? {
      id: newId(), supplier_id: params.get('supplier') ?? '', bill_no: '', bill_date: todayKathmandu(), cost_date: '',
      due_date: '', notes: '', discount: '', transport: '', vat: '', vat_rate: '13', split_charges: false, overrides: [], lines: [],
      paper_total: '', photos: [], post_key: newId(),
    },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: initial ? `bill-${initial.id}` : 'bill-new' })
  const lines = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' })
  const overrides = useFieldArray({ control: form.control, name: 'overrides', keyName: 'key' })
  const { register, control, watch, setValue, getValues } = form
  const supplierId = watch('supplier_id')
  const values = watch()

  const workable = projects.data?.filter((p) => p.status !== 'closed') ?? []
  const leafHeadings = headings.data?.filter((h) => h.active && (h.parent_id || !headings.data?.some((c) => c.parent_id === h.id))) ?? []
  const transportHeading = headings.data?.find((h) => h.kind === 'transport' && !h.parent_id)
  const unbilled = useDeliveryLineStatus({ supplierId, billableOnly: true }, !!supplierId)
  const deliveries = useDeliveriesById(unbilled.data?.map((u) => u.delivery_id!) ?? [])

  // Start with the supplier's unbilled deliveries as lines, so only rates are added (req §21).
  function addFromDeliveries(onlyDelivery?: string) {
    const taken = new Set(getValues('lines').flatMap((l) => l.matches.map((m) => m.delivery_line_id)))
    for (const u of unbilled.data ?? []) {
      if (taken.has(u.id!) || (onlyDelivery && u.delivery_id !== onlyDelivery)) continue
      const dl = deliveries.data?.get(u.id!)
      if (!dl || !dl.material_id) continue
      const m = materials.data?.find((x) => x.id === dl.material_id)
      lines.append({
        id: newId(), line_type: 'material', project_id: u.project_id!, heading_id: m?.default_heading_id ?? '',
        material_id: dl.material_id, description: '', qty: String(u.billable_qty), unit_id: dl.unit_id, unit_note: dl.unit_note ?? '',
        rate: '', amount: '', amount_edited: false, unmatched_reason: '', rate_variance_reason: '',
        matches: [{ delivery_line_id: u.id!, billed_qty: String(u.billable_qty) }],
      })
    }
  }

  // Opened from a delivery ("Enter bill for this"): its items become the first lines.
  const fromDelivery = params.get('delivery')
  const prefilled = useRef(false)
  useEffect(() => {
    if (initial || !fromDelivery || prefilled.current || !deliveries.data || !materials.data || getValues('lines').length) return
    prefilled.current = true
    addFromDeliveries(fromDelivery)
  }, [fromDelivery, deliveries.data, materials.data]) // eslint-disable-line react-hooks/exhaustive-deps

  function blankLine(type: 'material' | 'charge'): BillLine {
    const last = getValues('lines').at(-1)
    return {
      id: newId(), line_type: type, project_id: last?.project_id ?? params.get('project') ?? (workable.length === 1 ? workable[0].id : ''),
      heading_id: type === 'charge' ? transportHeading?.id ?? '' : '', material_id: '', description: type === 'charge' ? 'Transport' : '',
      qty: '', unit_id: '', unit_note: '', rate: '', amount: '', amount_edited: false, unmatched_reason: '', rate_variance_reason: '', matches: [],
    }
  }

  // Amount follows qty x rate until the user types an amount from the paper bill.
  function recalc(i: number) {
    const l = getValues(`lines.${i}`)
    const rate = parseNPR(l.rate)
    const q = Number(l.qty)
    if (!l.amount_edited && rate !== null && q > 0) setValue(`lines.${i}.amount`, paisaToInput(Math.round(rate * q)))
  }

  const subtotal = values.lines.reduce((s, l) => s + (parseNPR(l.amount) ?? 0), 0)
  const total = subtotal - (parseNPR(values.discount) ?? 0) + (parseNPR(values.transport) ?? 0) + (parseNPR(values.vat) ?? 0)
  const lineProjects = [...new Set(values.lines.map((l) => l.project_id).filter(Boolean))]
  const paper = parseNPR(values.paper_total)
  const [showCostDate, setShowCostDate] = useState(!!initial?.cost_date)
  const [showDue, setShowDue] = useState(!!initial?.due_date)

  type Then = 'draft' | 'submit' | 'post'
  const save = useMutation({
    mutationFn: async ({ v, then }: { v: BillValues; then: Then }) => {
      await rpc('save_bill_draft', { p_bill: toPayload(v) })
      // The bill exists now; photos taken before saving go up before it is sent on.
      const failedPhotos = await uploadPending(auth.companyId, { bill_id: v.id }, v.photos)
      if (failedPhotos && then === 'submit' && !v.lines.length) throw new Error('The bill photo did not upload. Check the connection and try again.')
      setValue('photos', [])
      if (then === 'submit') await rpc('submit_bill', { p_bill: v.id })
      // Posting can still be refused by a check; the saved draft then shows what to fix.
      let postError = ''
      if (then === 'post') {
        try {
          await rpc('post_bill', { p_op_key: v.post_key, p_bill: v.id })
        } catch (e) {
          postError = friendlyError(e)
        }
      }
      return { failedPhotos, postError }
    },
    onSuccess: async ({ failedPhotos, postError }, { v }) => {
      await draft.clear()
      await queryClient.invalidateQueries({ queryKey: ['bill', v.id] })
      await queryClient.invalidateQueries({ queryKey: ['bill-preview', v.id] })
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['attachments', 'bill_id', v.id] })
      navigate(`/bills/${v.id}`, { replace: true, state: { postError, failedPhotos } })
    },
  })

  async function checkDuplicate() {
    const v = getValues()
    if (!v.supplier_id || !v.bill_no.trim()) return setDupWarning('')
    const { data } = await supabase.from('supplier_bills').select('id')
      // Same number, any case; % and _ are matched literally, not as wildcards.
      .eq('supplier_id', v.supplier_id).ilike('bill_no', v.bill_no.trim().replace(/[\\%_]/g, (c) => `\\${c}`)).neq('id', v.id).neq('status', 'reversed')
    setDupWarning(data?.length ? `You can see another bill numbered ${v.bill_no.trim()} from this supplier. Check it is not entered twice.` : '')
  }

  function validate(v: BillValues, then: Then): string {
    if (!v.supplier_id) return 'Choose the supplier.'
    // Paper first: a draft needs only the supplier, and the photo alone can go to Accounts.
    if (then === 'draft' && !v.lines.length) return ''
    if (then === 'submit' && !v.lines.length && (v.photos.length || initial)) return ''
    if (!v.bill_no.trim()) return then === 'submit' ? 'Take the bill photo, or enter the bill number.' : 'Enter the bill number.'
    if (!v.lines.length) return 'Add at least one line.'
    for (const [i, l] of v.lines.entries()) {
      const n = `Line ${i + 1}`
      if (!l.project_id) return `${n}: choose the project.`
      if (!l.heading_id && !(l.material_id && materials.data?.find((m) => m.id === l.material_id)?.default_heading_id)) return `${n}: choose a cost heading.`
      if (parseNPR(l.amount) === null) return `${n}: enter the amount.`
      if (l.line_type === 'material') {
        if (!l.material_id && !l.description.trim()) return `${n}: choose or type the material.`
        if (!(Number(l.qty) > 0) || !l.unit_id) return `${n}: enter quantity and unit.`
      }
    }
    for (const c of ['discount', 'transport', 'vat'] as const) {
      if (v[c] && parseNPR(v[c]) === null) return `The ${c} is not a valid amount.`
    }
    if (then === 'post' && paper !== null && paper !== total) return `The lines and charges add up to ${formatNPR(total)}, but the paper bill says ${formatNPR(paper)}.`
    return ''
  }

  function run(then: Then) {
    const v = getValues()
    const problem = validate(v, then)
    setError(problem)
    if (!problem) save.mutate({ v, then })
  }

  const onBill = new Set(values.lines.flatMap((l) => l.matches.map((m) => m.delivery_line_id)))
  const notOnBill = supplierId ? (unbilled.data ?? []).filter((u) => !onBill.has(u.id!)) : []
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.code ?? ''

  return (
    <>
      <PageHeader title={initial ? 'Edit bill' : 'Enter supplier bill'} subtitle={accounts ? 'Check the lines against the paper bill, then post it.' : 'Nothing counts as cost until Accounts posts the bill.'} />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored your unsaved bill.</Notice></div>}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <Card title="Bill photo" className="lg:sticky lg:top-4">
        {initial ? (
          <Attachments owner={{ bill_id: initial.id }} canAdd={canEnter(auth)} canRemove label="Take bill photo" large />
        ) : (
          <Controller control={control} name="photos" render={({ field }) => (
            <PhotoPicker value={field.value} onChange={field.onChange} label="Take bill photo" what="Bill photo" large />
          )} />
        )}
        {!initial && !values.lines.length && (
          <p className="mt-2 text-sm text-subtle">
            {accounts ? 'Type the lines while looking at the photo.' : 'In a hurry? Choose the supplier, take the photo and send it to Accounts. They type the rest.'}
          </p>
        )}
      </Card>
      <form onSubmit={(e) => { e.preventDefault(); run('draft') }} className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" htmlFor="b-supplier">
              {/* Controlled: the options arrive after the form, so a registered select would show "Choose". */}
              <Select id="b-supplier" value={supplierId} onChange={(e) => setValue('supplier_id', e.target.value)} onBlur={() => void checkDuplicate()}>
                <option value="">Choose supplier</option>
                {suppliers.data?.filter((s) => s.active || s.id === supplierId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Bill number" htmlFor="b-no" hint={accounts ? undefined : 'Optional when you send the photo'}>
              <Input id="b-no" {...register('bill_no', { onBlur: () => void checkDuplicate() })} />
            </Field>
            <div className="sm:col-span-2"><Field label="Bill date" htmlFor="b-date">
              <Controller control={control} name="bill_date" render={({ field }) => (
                <DateInput id="b-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field></div>
            {showDue && (
              <div className="sm:col-span-2"><Field label="Due date" htmlFor="b-due" hint={
                <span className="flex gap-3">
                  {[15, 30].map((n) => (
                    <button key={n} type="button" className="underline underline-offset-4"
                      onClick={() => setValue('due_date', addDays(getValues('bill_date'), n))}>{n} days</button>
                  ))}
                </span>
              }>
                <Controller control={control} name="due_date" render={({ field }) => (
                  <DateInput id="b-due" value={field.value} onChange={field.onChange} display={auth.dateDisplay} allowEmpty />
                )} />
              </Field></div>
            )}
            {showCostDate && (
              <div className="sm:col-span-2"><Field label="Counts as cost on" htmlFor="b-cost" hint="Leave empty to use the bill date.">
                <Controller control={control} name="cost_date" render={({ field }) => (
                  <DateInput id="b-cost" value={field.value} onChange={field.onChange} display={auth.dateDisplay} allowEmpty />
                )} />
              </Field></div>
            )}
          </div>
          {(!showDue || !showCostDate) && (
            <div className="mt-2 flex flex-wrap gap-x-4">
              {!showDue && <Button type="button" variant="ghost" onClick={() => setShowDue(true)}>+ Add due date</Button>}
              {!showCostDate && <Button type="button" variant="ghost" onClick={() => setShowCostDate(true)}>Counts as cost on a different date?</Button>}
            </div>
          )}
          {dupWarning && <div className="mt-3"><Notice>{dupWarning}</Notice></div>}
        </Card>

        {notOnBill.length > 0 && (
          <Notice>
            {notOnBill.length} delivered item(s) from this supplier are not billed yet.{' '}
            <button type="button" className="font-semibold text-brand underline" onClick={() => addFromDeliveries()}>Add them as lines</button>
          </Notice>
        )}

        {lines.fields.map((field, i) => {
          const l = values.lines[i]
          if (!l) return null
          const unit = units.data?.find((u) => u.id === l.unit_id)
          const available = (unbilled.data ?? []).filter((u) =>
            u.project_id === l.project_id && deliveries.data?.get(u.id!)?.material_id === l.material_id &&
            deliveries.data?.get(u.id!)?.unit_id === l.unit_id && !l.matches.some((m) => m.delivery_line_id === u.id))
          const matched = l.matches.reduce((s, m) => s + Number(m.billed_qty || 0), 0)
          return (
            <Card key={field.key} title={l.line_type === 'charge' ? `Line ${i + 1}: charge` : `Line ${i + 1}`}
              actions={<Button type="button" variant="ghost" onClick={() => lines.remove(i)}>Remove</Button>}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Project" htmlFor={`bl${i}-p`}>
                  <Select id={`bl${i}-p`} {...register(`lines.${i}.project_id`)}>
                    <option value="">Choose project</option>
                    {workable.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                  </Select>
                </Field>
                {l.line_type === 'material' ? (
                  <Field label="Material" htmlFor={`bl${i}-m`}>
                    <Select id={`bl${i}-m`} value={l.material_id} onChange={(e) => {
                      const m = materials.data?.find((x) => x.id === e.target.value)
                      setValue(`lines.${i}.material_id`, e.target.value)
                      if (m) {
                        setValue(`lines.${i}.unit_id`, m.default_unit_id)
                        if (m.default_heading_id) setValue(`lines.${i}.heading_id`, m.default_heading_id)
                      }
                    }}>
                      <option value="">Other (type it)</option>
                      {materials.data?.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </Field>
                ) : null}
                {(l.line_type === 'charge' || !l.material_id) && (
                  <Field label="Description" htmlFor={`bl${i}-d`}><Input id={`bl${i}-d`} {...register(`lines.${i}.description`)} /></Field>
                )}
                <Field label="Cost heading" htmlFor={`bl${i}-h`}>
                  <Select id={`bl${i}-h`} {...register(`lines.${i}.heading_id`)}>
                    <option value="">Choose heading</option>
                    {leafHeadings.map((h) => {
                      const parent = headings.data?.find((p) => p.id === h.parent_id)
                      return <option key={h.id} value={h.id}>{parent ? `${parent.name} › ` : ''}{h.name}</option>
                    })}
                  </Select>
                </Field>
                {l.line_type === 'material' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity" htmlFor={`bl${i}-q`}><Input id={`bl${i}-q`} inputMode="decimal" {...register(`lines.${i}.qty`, { onChange: () => recalc(i) })} /></Field>
                    <Field label="Unit" htmlFor={`bl${i}-u`}>
                      <Select id={`bl${i}-u`} {...register(`lines.${i}.unit_id`)}>
                        <option value="">Unit</option>
                        {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                )}
                {unit?.needs_note && (
                  <Field label="Which vehicle / size?" htmlFor={`bl${i}-un`}><Input id={`bl${i}-un`} {...register(`lines.${i}.unit_note`)} /></Field>
                )}
                {l.line_type === 'material' && (
                  <Field label="Rate per unit" htmlFor={`bl${i}-r`}>
                    <Controller control={control} name={`lines.${i}.rate`} render={({ field: f }) => (
                      <MoneyInput id={`bl${i}-r`} value={f.value} onChange={(e) => { f.onChange(e); setValue(`lines.${i}.amount_edited`, false); recalc(i) }} />
                    )} />
                  </Field>
                )}
                <Field label="Amount" htmlFor={`bl${i}-a`} hint={l.line_type === 'material' ? 'Quantity × rate. Change it to match the paper bill.' : undefined}>
                  <Controller control={control} name={`lines.${i}.amount`} render={({ field: f }) => (
                    <MoneyInput id={`bl${i}-a`} value={f.value} onChange={(e) => { f.onChange(e); setValue(`lines.${i}.amount_edited`, true) }} />
                  )} />
                </Field>
              </div>

              {l.line_type === 'material' && (
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  <div className="font-medium text-ink">Delivered against</div>
                  {l.matches.length === 0 && <p className="text-subtle">Not matched to a delivery.</p>}
                  {l.matches.map((m, j) => {
                    const dl = deliveries.data?.get(m.delivery_line_id)
                    return (
                      <div key={m.delivery_line_id} className="mt-2 flex items-end gap-2">
                        <Field label={dl ? `Challan ${dl.challan_no ?? '—'} · ${formatDate(dl.receipt_date, auth.dateDisplay)}` : 'Delivery'} htmlFor={`bl${i}-m${j}`}>
                          <Input id={`bl${i}-m${j}`} inputMode="decimal" {...register(`lines.${i}.matches.${j}.billed_qty`)} />
                        </Field>
                        <Button type="button" variant="ghost" onClick={() => setValue(`lines.${i}.matches`, l.matches.filter((_, k) => k !== j))}>Unlink</Button>
                      </div>
                    )
                  })}
                  {available.length > 0 && (
                    <Select aria-label="Link a delivery" className="mt-2" value="" onChange={(e) => {
                      const u = available.find((x) => x.id === e.target.value)
                      if (u) setValue(`lines.${i}.matches`, [...l.matches, { delivery_line_id: u.id!, billed_qty: String(u.billable_qty) }])
                    }}>
                      <option value="">Link a delivery ({available.length} not billed)</option>
                      {available.map((u) => {
                        const dl = deliveries.data?.get(u.id!)
                        return <option key={u.id} value={u.id!}>{formatDate(dl?.receipt_date, auth.dateDisplay)} · challan {dl?.challan_no ?? '—'} · {u.billable_qty} not billed</option>
                      })}
                    </Select>
                  )}
                  {Number(l.qty) > 0 && matched < Number(l.qty) && (
                    <Field label={matched ? `Only ${matched} of ${l.qty} matched. Why?` : 'No delivery recorded. Why?'} htmlFor={`bl${i}-ur`}
                      hint="Accounts needs this to post the bill.">
                      <Input id={`bl${i}-ur`} {...register(`lines.${i}.unmatched_reason`)} />
                    </Field>
                  )}
                  {auth.canSeeFinance && (
                    <Field label="Rate difference reason (if the rate differs from the slip)" htmlFor={`bl${i}-rv`}>
                      <Input id={`bl${i}-rv`} {...register(`lines.${i}.rate_variance_reason`)} />
                    </Field>
                  )}
                </div>
              )}
            </Card>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => lines.append(blankLine('material'))}>Add material line</Button>
          <Button type="button" variant="secondary" onClick={() => lines.append(blankLine('charge'))}>Add charge line (transport, loading)</Button>
        </div>

        <Card title="Bill totals">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discount" htmlFor="b-disc">
              <Controller control={control} name="discount" render={({ field }) => <MoneyInput id="b-disc" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Transport (on the bill header)" htmlFor="b-trans">
              <Controller control={control} name="transport" render={({ field }) => <MoneyInput id="b-trans" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="VAT" htmlFor="b-vat" hint={
              <button type="button" className="text-brand underline" onClick={() => {
                const base = subtotal - (parseNPR(values.discount) ?? 0) + (parseNPR(values.transport) ?? 0)
                setValue('vat', paisaToInput(Math.round((base * Number(values.vat_rate || 13)) / 100)))
              }}>Work out {values.vat_rate || 13}% VAT</button>
            }>
              <Controller control={control} name="vat" render={({ field }) => <MoneyInput id="b-vat" value={field.value} onChange={field.onChange} />} />
            </Field>
          </div>
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-subtle">Lines {formatNPR(subtotal)}</span>
            <span className="font-semibold text-ink tabular-nums">Total {formatNPR(total)}</span>
          </div>
          {auth.canSeeFinance && (
            <div className="mt-3">
              <Field label="Total on the paper bill" htmlFor="b-paper" hint="Optional. Posting waits until the lines add up to it.">
                <Controller control={control} name="paper_total" render={({ field }) => <MoneyInput id="b-paper" value={field.value} onChange={field.onChange} />} />
              </Field>
              {paper !== null && (
                <p role="status" className={`mt-1 text-sm font-medium ${paper === total ? 'text-good-ink' : 'text-danger'}`}>
                  {paper === total ? 'Matches the paper bill.'
                    : paper > total ? `${formatNPR(paper - total)} missing: the paper bill says ${formatNPR(paper)}.`
                    : `${formatNPR(total - paper)} too much: the paper bill says ${formatNPR(paper)}.`}
                </p>
              )}
            </div>
          )}

          {lineProjects.length > 1 && (
            <div className="mt-3">
              <Controller control={control} name="split_charges" render={({ field }) => (
                <Checkbox label="Split header charges by project myself" hint="Otherwise discount, transport and VAT are shared by line amount."
                  checked={field.value} onChange={(e) => {
                    field.onChange(e.target.checked)
                    if (e.target.checked && !getValues('overrides').length) {
                      overrides.replace((['transport', 'discount', 'vat'] as const)
                        .filter((c) => parseNPR(getValues(c)))
                        .flatMap((c) => lineProjects.map((p) => ({ charge: c, project_id: p, amount: '' }))))
                    }
                    if (!e.target.checked) overrides.replace([])
                  }} />
              )} />
              {values.split_charges && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {overrides.fields.map((o, k) => (
                    <Field key={o.key} label={`${o.charge[0].toUpperCase()}${o.charge.slice(1)} for ${projectName(o.project_id)}`} htmlFor={`ov-${k}`}>
                      <Controller control={control} name={`overrides.${k}.amount`} render={({ field }) => (
                        <MoneyInput id={`ov-${k}`} value={field.value} onChange={field.onChange} />
                      )} />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Field label="Notes" htmlFor="b-notes" hint="Optional"><Input id="b-notes" {...register('notes')} /></Field>
        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          {accounts ? (
            <Button type="button" busy={save.isPending && save.variables?.then === 'post'} onClick={() => run('post')}>Save and post</Button>
          ) : (
            <Button type="button" busy={save.isPending && save.variables?.then === 'submit'} onClick={() => run('submit')}>Send to Accounts</Button>
          )}
          <Button type="submit" variant="secondary" busy={save.isPending && save.variables?.then === 'draft'}>Save draft</Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        </FormActions>
      </form>
      </div>
    </>
  )
}

function toPayload(v: BillValues) {
  const lines = v.lines.map((l) => ({
    id: l.id, line_type: l.line_type, project_id: l.project_id, heading_id: l.heading_id || null,
    material_id: l.line_type === 'material' && l.material_id ? l.material_id : null,
    description: l.description || null, qty: l.line_type === 'material' ? Number(l.qty) : null,
    unit_id: l.line_type === 'material' ? l.unit_id || null : null, unit_note: l.unit_note || null,
    rate_paisa: l.rate ? parseNPR(l.rate) : null, amount_paisa: parseNPR(l.amount),
    unmatched_reason: l.unmatched_reason || null, rate_variance_reason: l.rate_variance_reason || null,
    matches: l.matches.filter((m) => Number(m.billed_qty) > 0).map((m) => ({ delivery_line_id: m.delivery_line_id, billed_qty: Number(m.billed_qty) })),
  }))
  return {
    id: v.id, supplier_id: v.supplier_id, bill_no: v.bill_no.trim() || null, bill_date: v.bill_date, cost_date: v.cost_date || v.bill_date,
    paper_total_paisa: parseNPR(v.paper_total),
    due_date: v.due_date || null, notes: v.notes || null,
    discount_paisa: parseNPR(v.discount) ?? 0, transport_paisa: parseNPR(v.transport) ?? 0, vat_paisa: parseNPR(v.vat) ?? 0,
    vat_rate_pct: Number(v.vat_rate) || 13, lines,
    overrides: v.split_charges ? v.overrides.map((o) => ({ charge: o.charge, project_id: o.project_id, amount_paisa: parseNPR(o.amount) ?? 0 })) : [],
  }
}

/** Delivery line details (challan, date, material, unit) for matching. */
function useDeliveriesById(deliveryIds: string[]) {
  const ids = useMemo(() => [...new Set(deliveryIds)].sort(), [deliveryIds])
  return useQuery({
    queryKey: ['delivery-lines', 'detail', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_lines').select('id, material_id, unit_id, unit_note, deliveries(challan_no, receipt_date)')
        .in('delivery_id', ids)
      if (error) throw error
      return new Map(data.map((d) => [d.id, {
        material_id: d.material_id, unit_id: d.unit_id, unit_note: d.unit_note,
        challan_no: d.deliveries?.challan_no ?? null, receipt_date: d.deliveries?.receipt_date ?? '',
      }]))
    },
  })
}
