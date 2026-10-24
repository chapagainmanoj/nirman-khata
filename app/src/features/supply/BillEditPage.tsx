// Enter a supplier bill (req §11.2). Paper first: the photo comes before any typing, and site
// staff can send just the photo to Accounts, who type the lines while looking at it (photo on
// the left on wide screens). Lines per project and heading, matched deliveries, header charges.
// Saved as a draft on the server (and on the device while typing); Accounts can save and post.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments, PhotoPicker, uploadPending } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, Checkbox, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select, Spinner, type Crumb } from '../../components/ui'
import { More } from '../../components/More'
import { revealField } from '../../lib/forms'
import { addDays, formatDate, todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { formatNPR, lineAmount, paisaToInput, parseNPR } from '../../lib/money'
import { useMaterials, useUnits } from '../catalog/api'
import { MaterialOptions } from '../catalog/MaterialOptions'
import { useHeadings, useProjects } from '../projects/api'
import { projectChoices, useWorkingOnId } from '../projects/current'
import { billTitle } from '../../lib/labels'
import { hasDuplicateBill, useBill, useDeliveriesById, useDeliveryLineStatus, useSuppliers } from './api'
import { useRefreshMoney } from '../../data/refresh'
import { rpc, saveUnlessSent } from '../../data/rpc'
import { canEnter, canPost } from '../../data/permissions'
import { TrashIcon } from '../../components/icons'
import { t } from '../../lib/i18n'
import { refresh } from '../../data/refresh'
import { autoLineAmount, billTotals, linesFromDeliveries, matchedQty, toPayload, vatOn, type BillLine, type BillValues } from './billForm'

const rupees = (paisa: number | null | undefined) => paisaToInput(paisa ?? null)

export function BillEditPage() {
  const { billId } = useParams()
  const existing = useBill(billId ?? '', !!billId)
  if (billId && existing.isPending) return <Spinner />
  if (billId && existing.error) return <ErrorBanner onRetry={() => void existing.refetch()}>{friendlyError(existing.error)}</ErrorBanner>
  const d = billId ? existing.data : null
  if (billId && (!d?.bill || !['draft', 'under_review'].includes(d.bill.status))) return <ErrorBanner>{t('billEdit.thisBillCannotBe')}</ErrorBanner>

  const initial: BillValues | undefined = d?.bill ? {
    id: d.bill.id, supplier_id: d.bill.supplier_id,
    project_id: new Set(d.lines.map((l) => l.project_id)).size === 1 ? d.lines[0].project_id : '',
    bill_no: d.bill.bill_no ?? '', bill_date: d.bill.bill_date,
    // Saved as the bill date when left empty; keep it empty so a corrected bill date carries it along.
    cost_date: d.bill.cost_date === d.bill.bill_date ? '' : d.bill.cost_date, due_date: d.bill.due_date ?? '', notes: d.bill.notes ?? '',
    discount: rupees(d.charges?.discount_paisa), transport: rupees(d.charges?.transport_paisa), vat: rupees(d.charges?.vat_paisa),
    vat_rate: String(d.charges?.vat_rate_pct ?? 13), split_charges: d.overrides.length > 0,
    paper_total: rupees(d.charges?.paper_total_paisa), photos: [], post_key: newId(), submit_key: newId(),
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
  const refreshMoney = useRefreshMoney()
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
      id: newId(), supplier_id: params.get('supplier') ?? '', project_id: params.get('project') ?? '', bill_no: '', bill_date: todayKathmandu(), cost_date: '',
      due_date: '', notes: '', discount: '', transport: '', vat: '', vat_rate: '13', split_charges: false, overrides: [], lines: [],
      paper_total: '', photos: [], post_key: newId(), submit_key: newId(),
    },
  })
  // Opened from a delivery ("Enter bill for this"): a draft of its own, so an unfinished bill
  // for another supplier is not brought back in its place.
  const fromDelivery = params.get('delivery')
  const draftKey = initial ? `bill-${initial.id}` : fromDelivery ? `bill-new-delivery-${fromDelivery}` : 'bill-new'
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: draftKey })
  const lines = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' })
  const overrides = useFieldArray({ control: form.control, name: 'overrides', keyName: 'key' })
  const { register, control, watch, setValue, getValues } = form
  const supplierId = watch('supplier_id')
  const values = watch()

  // Money: Active, On hold and Completed (final bills), plus any project already on the bill.
  const workable = projectChoices(projects.data, 'money', initial?.lines.map((l) => l.project_id))
  // A new line with no project in the link starts on the Working on project.
  const workingOn = useWorkingOnId()
  const leafHeadings = headings.data?.filter((h) => h.active && (h.parent_id || !headings.data?.some((c) => c.parent_id === h.id))) ?? []
  const transportHeading = headings.data?.find((h) => h.kind === 'transport' && !h.parent_id)
  // One bill is for one project (revised 2026-10-18). An older bill with lines for several
  // projects keeps a project per line until one is chosen for the whole bill.
  const lineProjects = [...new Set(values.lines.map((l) => l.project_id).filter(Boolean))]
  const projectId = values.project_id || (lineProjects.length === 1 ? lineProjects[0] : '')
  const mixed = !values.project_id && lineProjects.length > 1
  useEffect(() => {
    if (initial || getValues('project_id') || fromDelivery) return
    const start = workingOn || (workable.length === 1 ? workable[0].id : '')
    if (start && !getValues('lines').length) setValue('project_id', start)
  }, [workingOn, workable.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const unbilled = useDeliveryLineStatus({ supplierId, billableOnly: true }, !!supplierId)
  const deliveries = useDeliveriesById(unbilled.data?.map((u) => u.delivery_id!) ?? [])

  // Start with the supplier's unbilled deliveries as lines, so only rates are added (req §21).
  // Only the bill's project: the first delivery added chooses it when none is chosen yet.
  function addFromDeliveries(onlyDelivery?: string, forProject?: string) {
    const { lines: added, project } = linesFromDeliveries({
      lines: getValues('lines'), project: forProject || getValues('project_id'), onlyDelivery,
      unbilled: unbilled.data, deliveries: deliveries.data, materials: materials.data, newId,
    })
    if (added.length) lines.append(added)
    if (project && !getValues('project_id')) setValue('project_id', project)
  }

  // The bill's project goes on every line; links to deliveries of another project are dropped.
  function chooseProject(id: string) {
    setValue('project_id', id)
    const deliveryProject = new Map((unbilled.data ?? []).map((u) => [u.id!, u.project_id]))
    getValues('lines').forEach((l, i) => {
      setValue(`lines.${i}.project_id`, id)
      setValue(`lines.${i}.matches`, l.matches.filter((m) => deliveryProject.get(m.delivery_line_id) === id))
    })
    setValue('split_charges', false)
    overrides.replace([])
  }

  // Opened from a delivery: its items become the first lines.
  const prefilled = useRef(false)
  useEffect(() => {
    if (initial || !fromDelivery || prefilled.current || !deliveries.data || !materials.data || getValues('lines').length) return
    prefilled.current = true
    addFromDeliveries(fromDelivery)
  }, [fromDelivery, deliveries.data, materials.data]) // eslint-disable-line react-hooks/exhaustive-deps

  function blankLine(type: 'material' | 'charge'): BillLine {
    const last = getValues('lines').at(-1)
    return {
      id: newId(), line_type: type, project_id: getValues('project_id') || (last?.project_id ?? ''),
      heading_id: type === 'charge' ? transportHeading?.id ?? '' : '', material_id: '', description: type === 'charge' ? t('billEdit.transport') : '',
      qty: '', unit_id: '', unit_note: '', rate: '', amount: '', amount_edited: false, unmatched_reason: '', rate_variance_reason: '', matches: [],
    }
  }

  // Amount follows qty x rate until the user types an amount from the paper bill.
  function recalc(i: number) {
    const amount = autoLineAmount(getValues(`lines.${i}`))
    if (amount !== null) setValue(`lines.${i}.amount`, amount)
  }

  const { subtotal, total } = billTotals(values)
  const chargesSummary = ([[t('billEdit.discount'), values.discount], [t('billEdit.transport'), values.transport], ['VAT', values.vat]] as const)
    .filter(([, a]) => parseNPR(a)).map(([k, a]) => `${k} ${formatNPR(parseNPR(a))}`).join(', ') || 'none'
  const paper = parseNPR(values.paper_total)
  const [showCostDate, setShowCostDate] = useState(!!initial?.cost_date)
  const [showDue, setShowDue] = useState(!!initial?.due_date)

  type Then = 'draft' | 'submit' | 'post'
  const save = useMutation({
    mutationFn: async ({ v, then }: { v: BillValues; then: Then }) => {
      const key = v.submit_key ?? newId()
      // Kept on the device first, so a reload after a lost answer retries with the same id and key.
      if (then === 'submit') await draft.save()
      const saveDraft = () => rpc('save_bill_draft', { p_bill: toPayload(v) })
      // A retry after a lost answer finds the bill already sent instead of failing on the save.
      let alreadySent = false
      if (then === 'submit') alreadySent = (await saveUnlessSent(key, saveDraft)).alreadySent
      else await saveDraft()
      // The bill exists now; photos taken before saving go up before it is sent on.
      const failedPhotos = await uploadPending({ userId: auth.userId, companyId: auth.companyId }, { bill_id: v.id }, v.photos)
      if (failedPhotos && then === 'submit' && !v.lines.length) throw new Error(t('billEdit.theBillPhotoDid'))
      setValue('photos', [])
      if (!initial) setValue('saved', true)
      if (then === 'submit') await draft.save()
      if (then === 'submit' && !alreadySent) await rpc('submit_bill', { p_bill: v.id, p_op_key: key })
      // Posting can still be refused by a check; the saved draft then shows what to fix.
      let postError = ''
      if (then === 'post') {
        try {
          await rpc('post_bill', { p_op_key: v.post_key, p_bill: v.id })
        } catch (e) {
          postError = friendlyError(e)
        }
      }
      return { failedPhotos, postError, alreadySent }
    },
    onSuccess: async ({ failedPhotos, postError, alreadySent }, { v, then }) => {
      await draft.clear()
      await refresh(queryClient, 'bills')
      await queryClient.invalidateQueries({ queryKey: ['attachments', 'bill_id', v.id] })
      // A posted bill changes cost and balances everywhere: dashboards, khata, reports, calendar.
      if (then === 'post' && !postError) await refreshMoney()
      navigate(`/bills/${v.id}`, { replace: true, state: { postError, failedPhotos, alreadySent, sent: then === 'submit' } })
    },
  })

  async function checkDuplicate() {
    const v = getValues()
    if (!v.supplier_id || !v.bill_no.trim()) return setDupWarning('')
    const dup = await hasDuplicateBill(v.supplier_id, v.bill_no.trim(), v.id)
    setDupWarning(dup ? t('billEdit.youCanSeeAnother', { value: v.bill_no.trim() }) : '')
  }

  function validate(v: BillValues, then: Then): string {
    if (!v.supplier_id) return t('billEdit.chooseTheSupplier')
    // Paper first: a draft needs only the supplier, and the photo alone can go to Accounts.
    if (then === 'draft' && !v.lines.length) return ''
    if (then === 'submit' && !v.lines.length && (v.photos.length || initial || v.saved)) return ''
    if (!v.bill_no.trim()) return then === 'submit' ? t('billEdit.takeTheBillPhoto') : t('billEdit.enterTheBillNumber')
    if (!v.lines.length) return t('billEdit.addAtLeastOne')
    if (!mixed && !projectId) return t('billEdit.chooseTheProject')
    for (const [i, l] of v.lines.entries()) {
      const n = t('billEdit.lineValue', { value: i + 1 })
      if (mixed && !l.project_id) return t('billEdit.nChooseTheProject', { n })
      if (!l.heading_id && !(l.material_id && materials.data?.find((m) => m.id === l.material_id)?.default_heading_id)) return t('billEdit.nChooseACost', { n })
      if (parseNPR(l.amount) === null) return t('billEdit.nEnterTheAmount', { n })
      if (l.line_type === 'material') {
        if (!l.material_id && !l.description.trim()) return t('billEdit.nChooseOrType', { n })
        if (!(Number(l.qty) > 0) || !l.unit_id) return t('billEdit.nEnterQuantityAnd', { n })
        if (lineAmount(0, l.qty) === null) return t('billEdit.nUseAtMost', { n })
      }
    }
    for (const c of ['discount', 'transport', 'vat'] as const) {
      if (v[c] && parseNPR(v[c]) === null) {
        revealField({ discount: 'b-disc', transport: 'b-trans', vat: 'b-vat' }[c])
        return t('billEdit.theCIsNot', { c })
      }
    }
    if (then === 'post' && paper !== null && paper !== total) return t('billEdit.theLinesAndCharges', { total: formatNPR(total), paper: formatNPR(paper) })
    return ''
  }

  function run(then: Then) {
    if (save.isPending) return // one save at a time, also from Enter in a field
    const v = getValues()
    const problem = validate(v, then)
    setError(problem)
    if (!problem) save.mutate({ v, then })
  }

  const onBill = new Set(values.lines.flatMap((l) => l.matches.map((m) => m.delivery_line_id)))
  const notOnBill = supplierId ? (unbilled.data ?? []).filter((u) => !onBill.has(u.id!) && (!projectId || u.project_id === projectId)) : []
  // With no project chosen yet, the supplier's unbilled deliveries are offered project by project.
  const notOnBillProjects = [...new Set(notOnBill.map((u) => u.project_id!))]
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.code ?? ''
  // Which delivery this bill was started from: its date, project and challan.
  const startedFrom = fromDelivery && !initial ? unbilled.data?.find((u) => u.delivery_id === fromDelivery) : undefined
  const startedFromLine = startedFrom ? deliveries.data?.get(startedFrom.id!) : undefined

  const crumbs: Crumb[] = initial
    ? [{ to: '/bills', label: t('billEdit.bills') }, { to: `/bills/${initial.id}`, label: billTitle(initial.bill_no) }]
    : [{ to: '/bills', label: t('billEdit.bills') }]

  return (
    <>
      <PageHeader title={initial ? t('billEdit.editBill') : t('billEdit.enterSupplierBill')} crumbs={crumbs} subtitle={accounts ? t('billEdit.checkTheLinesAgainst') : t('billEdit.nothingCountsAsCost')} />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('billEdit.restoredYourUnsavedBill')}</Notice></div>}
      {startedFrom && startedFromLine && (
        <div className="mb-4"><Notice>
          {t('billEdit.forTheDeliveryOf', { receiptDate: formatDate(startedFromLine.receipt_date, auth.dateDisplay), value: projectName(startedFrom.project_id!) })}{startedFromLine.challan_no && t('billEdit.challanChallanno', { challanNo: startedFromLine.challan_no })}{t('billEdit.itsItemsAreOn')}</Notice></div>
      )}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <Card title={t('billEdit.billPhoto')} className="lg:sticky lg:top-4">
        {initial || values.saved ? (
          <Attachments owner={{ bill_id: values.id }} canAdd={canEnter(auth)} canRemove label={t('billEdit.takeBillPhoto')} large />
        ) : (
          <Controller control={control} name="photos" render={({ field }) => (
            <PhotoPicker value={field.value} onChange={field.onChange} label={t('billEdit.takeBillPhoto')} what={t('billEdit.billPhoto')} large />
          )} />
        )}
        {!initial && !values.lines.length && (
          <p className="mt-2 text-sm text-subtle">
            {accounts ? t('billEdit.typeTheLinesWhile') : t('billEdit.inAHurryChoose')}
          </p>
        )}
      </Card>
      <form onSubmit={(e) => { e.preventDefault(); run('draft') }} className="flex min-w-0 flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.supplier')} htmlFor="b-supplier">
              {/* Controlled: the options arrive after the form, so a registered select would show "Choose". */}
              <Select id="b-supplier" value={supplierId} onChange={(e) => setValue('supplier_id', e.target.value)} onBlur={() => void checkDuplicate()}>
                <option value="">{t('common.supplier.choose')}</option>
                {suppliers.data?.filter((s) => s.active || s.id === supplierId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t('billEdit.billNumber')} htmlFor="b-no" hint={accounts ? undefined : t('billEdit.optionalWhenYouSend')}>
              <Input id="b-no" {...register('bill_no', { onBlur: () => void checkDuplicate() })} />
            </Field>
            <div className="sm:col-span-2"><Field label={t('billEdit.project')} htmlFor="b-project"
              hint={mixed ? t('billEdit.thisBillHasLines') : t('billEdit.oneBillIsFor')}>
              <Select id="b-project" value={projectId} onChange={(e) => chooseProject(e.target.value)}>
                <option value="">{mixed ? t('billEdit.severalProjects') : t('common.project.choose')}</option>
                {workable.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field></div>
            <div className="sm:col-span-2"><Field label={t('billEdit.billDate')} htmlFor="b-date">
              <Controller control={control} name="bill_date" render={({ field }) => (
                <DateInput id="b-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field></div>
            {showDue && (
              <div className="sm:col-span-2"><Field label={t('billEdit.dueDate')} htmlFor="b-due" hint={
                <span className="flex gap-3">
                  {[15, 30].map((n) => (
                    <button key={n} type="button" className="underline underline-offset-4"
                      onClick={() => setValue('due_date', addDays(getValues('bill_date'), n))}>{t('billEdit.nDays', { n })}</button>
                  ))}
                </span>
              }>
                <Controller control={control} name="due_date" render={({ field }) => (
                  <DateInput id="b-due" value={field.value} onChange={field.onChange} display={auth.dateDisplay} allowEmpty />
                )} />
              </Field></div>
            )}
            {showCostDate && (
              <div className="sm:col-span-2"><Field label={t('billEdit.countsAsCostOn')} htmlFor="b-cost" hint={t('billEdit.leaveEmptyToUse')}>
                <Controller control={control} name="cost_date" render={({ field }) => (
                  <DateInput id="b-cost" value={field.value} onChange={field.onChange} display={auth.dateDisplay} allowEmpty />
                )} />
              </Field></div>
            )}
          </div>
          {(!showDue || !showCostDate) && (
            // -ml-2: the ghost buttons' padding is for the hover fill; their labels line up with the fields.
            <div className="mt-2 -ml-2 flex flex-wrap gap-x-2">
              {!showDue && <Button type="button" variant="ghost" onClick={() => setShowDue(true)}>{t('billEdit.addDueDate')}</Button>}
              {!showCostDate && <Button type="button" variant="ghost" onClick={() => setShowCostDate(true)}>{t('billEdit.countsAsCostOn2')}</Button>}
            </div>
          )}
          {dupWarning && <div className="mt-3"><Notice>{dupWarning}</Notice></div>}
        </Card>

        {notOnBill.length > 0 && (projectId || mixed ? (
          <Notice>
            {t('billEdit.lengthDeliveredItemS', { length: notOnBill.length })}{projectId && ` to ${projectName(projectId)}`} {t('billEdit.areNotBilledYet', { value: ' ' })}<button type="button" className="font-semibold text-slate underline" onClick={() => addFromDeliveries()}>{t('billEdit.addThemAsLines')}</button>
          </Notice>
        ) : (
          <Notice>
            {t('billEdit.deliveredItemsFromThis')}<span className="mt-1 flex flex-wrap gap-x-4">
              {notOnBillProjects.map((pid) => (
                <button key={pid} type="button" className="min-h-11 font-semibold text-slate underline" onClick={() => addFromDeliveries(undefined, pid)}>
                  {projectName(pid)}: {notOnBill.filter((u) => u.project_id === pid).length} {t('billEdit.itemS')}</button>
              ))}
            </span>
          </Notice>
        ))}

        {lines.fields.map((field, i) => {
          const l = values.lines[i]
          if (!l) return null
          const unit = units.data?.find((u) => u.id === l.unit_id)
          // Same material (a typed delivery item, with none, goes on a line with none) and unit (M2).
          const available = (unbilled.data ?? []).filter((u) =>
            u.project_id === l.project_id && (deliveries.data?.get(u.id!)?.material_id ?? '') === l.material_id &&
            deliveries.data?.get(u.id!)?.unit_id === l.unit_id && !l.matches.some((m) => m.delivery_line_id === u.id))
          const matched = matchedQty(l.matches)
          return (
            <Card key={field.key} title={l.line_type === 'charge' ? t('billEdit.lineValueCharge', { value: i + 1 }) : t('billEdit.lineValue', { value: i + 1 })}
              actions={<Button type="button" variant="ghost" onClick={() => lines.remove(i)}><TrashIcon size={16} />{t('common.remove')}</Button>}>
              <div className="grid gap-3 sm:grid-cols-2">
                {mixed && (
                  <Field label={t('billEdit.project')} htmlFor={`bl${i}-p`}>
                    <Select id={`bl${i}-p`} {...register(`lines.${i}.project_id`)}>
                      <option value="">{t('common.project.choose')}</option>
                      {workable.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                    </Select>
                  </Field>
                )}
                {l.line_type === 'material' ? (
                  <Field label={t('common.material')} htmlFor={`bl${i}-m`}>
                    <Select id={`bl${i}-m`} value={l.material_id} onChange={(e) => {
                      const m = materials.data?.find((x) => x.id === e.target.value)
                      setValue(`lines.${i}.material_id`, e.target.value)
                      if (m) {
                        setValue(`lines.${i}.unit_id`, m.default_unit_id)
                        if (m.default_heading_id) setValue(`lines.${i}.heading_id`, m.default_heading_id)
                      }
                    }}>
                      <MaterialOptions companyId={auth.companyId} userId={auth.userId} />
                      <option value="">{t('common.material.other')}</option>
                    </Select>
                  </Field>
                ) : null}
                {(l.line_type === 'charge' || !l.material_id) && (
                  <Field label={t('billEdit.description')} htmlFor={`bl${i}-d`}><Input id={`bl${i}-d`} {...register(`lines.${i}.description`)} /></Field>
                )}
                <Field label={t('billEdit.costHeading')} htmlFor={`bl${i}-h`}>
                  <Select id={`bl${i}-h`} {...register(`lines.${i}.heading_id`)}>
                    <option value="">{t('billEdit.chooseHeading')}</option>
                    {leafHeadings.map((h) => {
                      const parent = headings.data?.find((p) => p.id === h.parent_id)
                      return <option key={h.id} value={h.id}>{parent ? `${parent.name} › ` : ''}{h.name}</option>
                    })}
                  </Select>
                </Field>
                {l.line_type === 'material' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('billEdit.quantity')} htmlFor={`bl${i}-q`}><Input id={`bl${i}-q`} inputMode="decimal" {...register(`lines.${i}.qty`, { onChange: () => recalc(i) })} /></Field>
                    <Field label={t('common.unit')} htmlFor={`bl${i}-u`}>
                      <Select id={`bl${i}-u`} {...register(`lines.${i}.unit_id`)}>
                        <option value="">{t('common.unit')}</option>
                        {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                )}
                {unit?.needs_note && (
                  <Field label={t('billEdit.whichVehicleSize')} htmlFor={`bl${i}-un`}><Input id={`bl${i}-un`} {...register(`lines.${i}.unit_note`)} /></Field>
                )}
                {l.line_type === 'material' && (
                  <Field label={t('billEdit.ratePerUnit')} htmlFor={`bl${i}-r`}>
                    <Controller control={control} name={`lines.${i}.rate`} render={({ field: f }) => (
                      <MoneyInput id={`bl${i}-r`} value={f.value} onChange={(e) => { f.onChange(e); setValue(`lines.${i}.amount_edited`, false); recalc(i) }} />
                    )} />
                    {auth.canSeeFinance && (
                      <LastRate supplierId={supplierId} materialId={l.material_id} current={parseNPR(l.rate)}
                        onUse={(paisa) => { setValue(`lines.${i}.rate`, paisaToInput(paisa)); setValue(`lines.${i}.amount_edited`, false); recalc(i) }} />
                    )}
                  </Field>
                )}
                <Field label={t('billEdit.amount')} htmlFor={`bl${i}-a`} hint={l.line_type === 'material' ? t('billEdit.quantityRateChangeIt') : undefined}>
                  <Controller control={control} name={`lines.${i}.amount`} render={({ field: f }) => (
                    <MoneyInput id={`bl${i}-a`} value={f.value} onChange={(e) => { f.onChange(e); setValue(`lines.${i}.amount_edited`, true) }} />
                  )} />
                </Field>
              </div>

              {l.line_type === 'material' && (
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  <div className="font-medium text-ink">{t('billEdit.deliveredAgainst')}</div>
                  {l.matches.length === 0 && <p className="text-subtle">{t('billEdit.notMatchedToA')}</p>}
                  {l.matches.map((m, j) => {
                    const dl = deliveries.data?.get(m.delivery_line_id)
                    return (
                      <div key={m.delivery_line_id} className="mt-2">
                        <div className="flex items-end gap-2">
                          <Field label={dl ? t('billEdit.challanValueReceiptdate', { value: dl.challan_no ?? '—', receiptDate: formatDate(dl.receipt_date, auth.dateDisplay) }) : t('billEdit.delivery')} htmlFor={`bl${i}-m${j}`}>
                            <Input id={`bl${i}-m${j}`} inputMode="decimal" {...register(`lines.${i}.matches.${j}.billed_qty`)} />
                          </Field>
                          <Button type="button" variant="ghost" onClick={() => setValue(`lines.${i}.matches`, l.matches.filter((_, k) => k !== j))}>{t('billEdit.unlink')}</Button>
                        </div>
                        {dl?.slip && (
                          <SlipDetails slip={dl.slip} unit={units.data?.find((u) => u.id === dl.unit_id)?.name} current={parseNPR(l.rate)}
                            onUse={(paisa) => { setValue(`lines.${i}.rate`, paisaToInput(paisa)); setValue(`lines.${i}.amount_edited`, false); recalc(i) }} />
                        )}
                      </div>
                    )
                  })}
                  {available.length > 0 && (
                    <Select aria-label={t('billEdit.linkADelivery')} className="mt-2" value="" onChange={(e) => {
                      const u = available.find((x) => x.id === e.target.value)
                      if (u) setValue(`lines.${i}.matches`, [...l.matches, { delivery_line_id: u.id!, billed_qty: String(u.billable_qty) }])
                    }}>
                      <option value="">{t('billEdit.linkADeliveryLength', { length: available.length })}</option>
                      {available.map((u) => {
                        const dl = deliveries.data?.get(u.id!)
                        return <option key={u.id} value={u.id!}>{t('billEdit.receiptdateChallanValueBillableqty', { receiptDate: formatDate(dl?.receipt_date, auth.dateDisplay), value: dl?.challan_no ?? '—', billableQty: u.billable_qty })}</option>
                      })}
                    </Select>
                  )}
                  {Number(l.qty) > 0 && matched < Number(l.qty) && (
                    <Field label={matched ? t('billEdit.onlyMatchedOfQty', { matched, qty: l.qty }) : t('billEdit.noDeliveryRecordedWhy')} htmlFor={`bl${i}-ur`}
                      hint={t('billEdit.accountsNeedsThisTo')}>
                      <Input id={`bl${i}-ur`} {...register(`lines.${i}.unmatched_reason`)} />
                    </Field>
                  )}
                  {auth.canSeeFinance && (
                    <Field label={t('billEdit.rateDifferenceReasonIf')} htmlFor={`bl${i}-rv`}>
                      <Input id={`bl${i}-rv`} {...register(`lines.${i}.rate_variance_reason`)} />
                    </Field>
                  )}
                </div>
              )}
            </Card>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => lines.append(blankLine('material'))}>{t('billEdit.addMaterialLine')}</Button>
          <Button type="button" variant="secondary" onClick={() => lines.append(blankLine('charge'))}>{t('billEdit.addChargeLineTransport')}</Button>
        </div>

        <Card title={t('billEdit.billTotals')}>
          {/* Simple forms fold the charges; the total and the paper-bill check stay in view. */}
          <More label={t('billEdit.discountTransportVat')} summary={chargesSummary}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('billEdit.discount')} htmlFor="b-disc">
                <Controller control={control} name="discount" render={({ field }) => <MoneyInput id="b-disc" value={field.value} onChange={field.onChange} />} />
              </Field>
              <Field label={t('billEdit.transportOnTheBill')} htmlFor="b-trans">
                <Controller control={control} name="transport" render={({ field }) => <MoneyInput id="b-trans" value={field.value} onChange={field.onChange} />} />
              </Field>
              <Field label={t('billEdit.vat')} htmlFor="b-vat" hint={
                <button type="button" className="inline-flex min-h-11 items-center text-slate underline" onClick={() => {
                  setValue('vat', vatOn(subtotal, values.discount, values.transport, values.vat_rate))
                }}>{t('billEdit.workOutValueVat', { value: values.vat_rate || 13 })}</button>
              }>
                <Controller control={control} name="vat" render={({ field }) => <MoneyInput id="b-vat" value={field.value} onChange={field.onChange} />} />
              </Field>
            </div>
          </More>
          <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
            <span className="text-subtle">{t('billEdit.linesSubtotal', { subtotal: formatNPR(subtotal) })}</span>
            <span className="font-semibold text-ink tabular-nums">{t('billEdit.totalTotal', { total: formatNPR(total) })}</span>
          </div>
          {auth.canSeeFinance && (
            <div className="mt-3">
              <Field label={t('billEdit.totalOnThePaper')} htmlFor="b-paper" hint={t('billEdit.optionalPostingWaitsUntil')}>
                <Controller control={control} name="paper_total" render={({ field }) => <MoneyInput id="b-paper" value={field.value} onChange={field.onChange} />} />
              </Field>
              {paper !== null && (
                <p role="status" className={`mt-1 text-sm font-medium ${paper === total ? 'text-good-ink' : 'text-danger'}`}>
                  {paper === total ? t('billEdit.matchesThePaperBill')
                    : paper > total ? t('billEdit.amountMissingThePaper', { amount: formatNPR(paper - total), paper: formatNPR(paper) })
                    : t('billEdit.amountTooMuchThe', { amount: formatNPR(total - paper), paper: formatNPR(paper) })}
                </p>
              )}
            </div>
          )}

          {lineProjects.length > 1 && (
            <div className="mt-3">
              <Controller control={control} name="split_charges" render={({ field }) => (
                <Checkbox label={t('billEdit.splitHeaderChargesBy')} hint={t('billEdit.otherwiseDiscountTransportAnd')}
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
                    <Field key={o.key} label={t('billEdit.valueValue2ForProjectid', { value: o.charge[0].toUpperCase(), value2: o.charge.slice(1), projectId: projectName(o.project_id) })} htmlFor={`ov-${k}`}>
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

        <Field label={t('billEdit.notes')} htmlFor="b-notes" hint={t('common.optional')}><Input id="b-notes" {...register('notes')} /></Field>
        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          {accounts ? (
            <Button type="button" disabled={save.isPending} busy={save.isPending && save.variables?.then === 'post'} onClick={() => run('post')}>{t('billEdit.saveAndPost')}</Button>
          ) : (
            <Button type="button" disabled={save.isPending} busy={save.isPending && save.variables?.then === 'submit'} onClick={() => run('submit')}>{t('billEdit.sendToAccounts')}</Button>
          )}
          <Button type="submit" variant="secondary" disabled={save.isPending} busy={save.isPending && save.variables?.then === 'draft'}>{t('common.saveDraft')}</Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
        </FormActions>
      </form>
      </div>
    </>
  )
}

/**
 * The rate on this supplier's last posted bill for the material (req §11.2, a hint only: v1
 * has no rate lists). "Use" copies it into the line.
 */
/** What the order slip asked for, beside the delivery it came on: to check the paper bill against. */
function SlipDetails({ slip, unit, current, onUse }: {
  slip: { number: string; spec: string | null; note: string | null; est_rate_paisa: number | null }
  unit: string | undefined; current: number | null; onUse: (paisa: number) => void
}) {
  const rate = slip.est_rate_paisa
  return (
    <div className="mt-1 text-xs text-subtle">
      <div>{t('billEdit.slipNumber', { number: slip.number })}</div>
      {slip.spec && <div>{t('billEdit.slipSpec', { spec: slip.spec })}</div>}
      {rate !== null && (
        <div className="flex flex-wrap items-center gap-x-2">
          <span>{t('billEdit.slipRate')}{' '}<span className="font-semibold text-ink tabular-nums">{formatNPR(rate)}</span>{unit && ` / ${unit}`}</span>
          {current !== rate && (
            <button type="button" className="min-h-11 font-semibold text-brand hover:underline" onClick={() => onUse(rate)}>{t('billEdit.use')}</button>
          )}
        </div>
      )}
      {slip.note && <div>{t('billEdit.slipNote', { note: slip.note })}</div>}
    </div>
  )
}

function LastRate({ supplierId, materialId, current, onUse }: {
  supplierId: string; materialId: string; current: number | null; onUse: (paisa: number) => void
}) {
  const auth = useCompany()
  const last = useQuery({
    queryKey: ['bill-preview', 'last-rate', supplierId, materialId],
    enabled: !!supplierId && !!materialId,
    queryFn: async () => (await rpc('last_billed_rate', { p_supplier: supplierId, p_material: materialId }))[0] ?? null,
  })
  const r = last.data
  if (!r || r.rate_paisa === null) return null
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
      <span>
        {t('billEdit.lastBilled')}{' '}<span className="font-semibold text-ink tabular-nums">{formatNPR(r.rate_paisa)}</span> {t('billEdit.onBilldateValue', { billDate: formatDate(r.bill_date, auth.dateDisplay), value: r.bill_no ? ` (${billTitle(r.bill_no)})` : '' })}</span>
      {current !== r.rate_paisa && (
        <button type="button" className="min-h-11 font-semibold text-brand hover:underline" onClick={() => onUse(r.rate_paisa)}>{t('billEdit.use')}</button>
      )}
    </span>
  )
}
