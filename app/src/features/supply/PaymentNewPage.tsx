// Record a payment to a supplier, subcontractor, crew or payee (req §12.1, §13, §14, §15).
// Most payments pay particular bills, so the form starts from what is owed: tick the bills,
// the amount and the project split follow from them. Anything paid beyond the ticked bills is
// Overpayment for one project, deducted from the next bill. With nothing unpaid, the payment is
// Peski by default (GLOSSARY.md), with a free project split; untick it to pay a regular supplier
// ahead on the khata. Peski is never offered while anything is unpaid.
// A payment for a work package (peski or part payment) goes wholly to the package's project.
// A worker is paid differently (req §14): every "Pay" for a worker comes here. Their verified days
// not yet paid are listed (drafts carry no money until verified). The advance they already hold
// comes off, and saving runs pay_worker, which uses the advance and pays the rest, oldest day first.
// Paying more leaves an advance.
// No peski choice for a worker: any money beyond their days is simply an advance.
// A subcontractor's approved work is paid the same way (pay_subcontractor): what they hold (peski,
// money paid ahead, an opening balance) pays the ticked work first, and only the rest is cash.
// The payment id and operation key stay with the device draft until the server confirms,
// so a retry after a lost connection never records it twice (acceptance #13).
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, Checkbox, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select, type Crumb } from '../../components/ui'
import { formatDate, todayKathmandu, type IsoDate } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { billTitle, PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, paisaToInput, parseNPR } from '../../lib/money'
import { useParties, usePartyHeld, usePartyOpenItems } from '../parties/api'
import { DOC_WORD, PARTY, PARTY_KINDS, partyFromParams, type PartyKind } from '../parties/kinds'
import { useProjects } from '../projects/api'
import { projectChoices } from '../projects/current'
import { useCharges, useUsableHeld, useWorkPackage } from '../subcontract/api'
import { useWorkerAdvance } from '../labour/api'
import { rpc, useRefreshMoney } from './api'
import { canPost } from './permissions'
import { TrashIcon } from '../../components/icons'

type Values = {
  id: string
  op_key: string
  party_kind: PartyKind
  party_id: string
  package_id: string
  is_peski: boolean // only when nothing is unpaid
  payment_date: string
  amount: string
  method: keyof typeof PAYMENT_METHODS
  reference: string
  notes: string
  allocations: Array<{ project_id: string; amount: string }> // when nothing is unpaid
  settle: Record<string, string> // "docId:projectId" -> amount (bills mode)
  extra_project: string // where money beyond the ticked bills goes (bills mode)
  photos: PendingPhoto[]
  days: string[] | null // a worker's ticked days ("doc:<id>"); null until first set
  sent: boolean // a save was tried: the draft is then always restored (its id and op_key)
}

/** One of a worker's verified days not yet paid. */
type DayRow = { key: string; project_id: string; date: IsoDate; amount: number; doc_id: string }

const OWED = new Set(['bill', 'charge', 'labour', 'expense'])
const WITH_REFERENCE = new Set(['bank_transfer', 'cheque', 'wallet'])

export function PaymentNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [error, setError] = useState('')
  const [choosingParty, setChoosingParty] = useState(false)
  const accounts = canPost(auth)
  const start = partyFromParams(params)
  // The current project (from "+ Record" or a list page): where money not for a bill goes unless changed.
  const projectParam = params.get('project') ?? ''

  const form = useForm<Values>({
    defaultValues: {
      id: newId(), op_key: newId(), party_kind: start.kind, party_id: start.id, package_id: params.get('package') ?? '',
      is_peski: true, payment_date: todayKathmandu(), amount: '', method: 'cash', reference: '', notes: '',
      allocations: [], settle: {}, extra_project: projectParam, photos: [], days: null, sent: false,
    },
  })
  // A payment started for a named party ("Pay Ram", a bill's "Record payment") keeps its own draft, so
  // an unsaved payment to someone else is not restored over it; a retry from the same link still is.
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId,
    formKey: start.id ? `payment-new-${start.kind}-${start.id}` : 'payment-new' },
    // Only a payment that was sent, or has something typed beyond the amount, is worth bringing back.
    { worthKeeping: (d) => d.sent || !!d.notes?.trim() || !!d.reference?.trim() || (d.photos?.length ?? 0) > 0 })
  const allocations = useFieldArray({ control: form.control, name: 'allocations' })
  const { register, control, watch, setValue, getValues } = form
  const v = watch()
  const parties = useParties(auth.companyId, v.party_kind)
  const pkg = useWorkPackage(v.package_id)
  const pkgCharges = useCharges(v.package_id, !!v.package_id)
  const openItems = usePartyOpenItems(v.party_id, !!v.party_id)
  const pkgChargeIds = new Set(pkgCharges.data?.map((c) => c.id))
  // A package payment can only clear that package's charges.
  const openDocs = openItems.data?.filter((i) => OWED.has(i.kind) && (!v.package_id || pkgChargeIds.has(i.doc_id!))) ?? []
  const held = usePartyHeld(v.party_id, !!v.party_id)
  const isWorker = v.party_kind === 'worker'
  const workerAdvance = useWorkerAdvance(v.party_id, isWorker && !!v.party_id)
  // Peski only while nothing at all is unpaid to the party (any package or project).
  const anyUnpaid = openItems.data?.some((i) => OWED.has(i.kind)) ?? true
  const owed = openDocs.reduce((s, d) => s + d.amount_paisa, 0)
  const docLabel = (d: (typeof openDocs)[number]) => (d.kind === 'bill' ? `Bill ${d.label}` : `${DOC_WORD[d.kind]}: ${d.label}`)
  const docKey = (d: (typeof openDocs)[number]) => `${d.doc_id}:${d.project_id}`
  const party = parties.data?.find((p) => p.id === v.party_id)
  const kindLabel = PARTY[v.party_kind].one
  const pkgProject = pkg.data?.project_id ?? ''
  // Money: Active, On hold and Completed. No Working on default here: a payment with no project
  // is normal (split later), so a guess could put it on the wrong one.
  const visible = projectChoices(projects.data, 'money')
  // A new split row starts on the current project, unless it is already listed.
  const firstFree = () => {
    const used = new Set(getValues('allocations').map((a) => a.project_id))
    if (projectParam && !used.has(projectParam)) return projectParam
    return visible.length === 1 && !used.has(visible[0].id) ? visible[0].id : ''
  }
  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code ?? ''

  // Ticking bills sets the amount; the amount can still be raised to pay extra (Overpayment).
  const setSettle = (next: Record<string, string>) => {
    setValue('settle', next)
    setValue('amount', paisaToInput(Object.values(next).reduce((s, a) => s + (parseNPR(a) ?? 0), 0)))
  }

  // Coming from a bill (or other document): tick it. The supplier page names the project and what
  // is still to pay on it there, after unmatched payments, so the form does not suggest more.
  const fromDoc = params.get('bill') ?? params.get('doc')
  const upTo = Number(params.get('amount')) || null
  useEffect(() => {
    if (!fromDoc || !openItems.data || Object.keys(getValues('settle')).length) return
    const rows = openDocs.filter((b) => b.doc_id === fromDoc && (!projectParam || b.project_id === projectParam))
    if (rows.length) setSettle(Object.fromEntries(rows.map((r) => [docKey(r), paisaToInput(upTo ? Math.min(upTo, r.amount_paisa) : r.amount_paisa)])))
  }, [fromDoc, openItems.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // A worker: their days to pay, oldest first, and the advance they hold (peski or paid ahead).
  const dayRows: DayRow[] = !isWorker ? [] : [
    ...openDocs.filter((d) => d.kind === 'labour').map((d) => ({
      key: `doc:${d.doc_id}`, project_id: d.project_id!, date: d.doc_date as IsoDate, amount: d.amount_paisa, doc_id: d.doc_id! })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
  // What pay_worker takes off: held on any project they see (not netted against other projects).
  const advance = workerAdvance.data ?? 0
  const tickedDays = dayRows.filter((r) => v.days?.includes(r.key))
  const tickedTotal = tickedDays.reduce((s, r) => s + r.amount, 0)
  const less = Math.min(advance, tickedTotal)
  const due = tickedTotal - less
  const allDays = dayRows.reduce((s, r) => s + r.amount, 0)
  const setDays = (keys: string[]) => {
    const total = dayRows.filter((r) => keys.includes(r.key)).reduce((s, r) => s + r.amount, 0)
    setValue('days', keys)
    setValue('amount', paisaToInput(total - Math.min(advance, total)))
  }
  // First ticks: every day, or from a crew page ("Pay Ram" on a project) that project's days only.
  const workerReady = isWorker && !!v.party_id && !!openItems.data && workerAdvance.data != null
  // Not from cached lists still being refreshed (a day marked since the last visit): wait for them.
  const tickReady = workerReady && !openItems.isFetching && !workerAdvance.isFetching
  useEffect(() => {
    if (!tickReady || getValues('days') !== null) return
    setDays(dayRows.filter((r) => !projectParam || r.project_id === projectParam).map((r) => r.key))
  }, [tickReady, v.party_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only documents shown now count: ticks left behind by a party change are ignored.
  const shown = new Set(openDocs.map(docKey))
  const ticked = (vals: Values) => Object.entries(vals.settle).filter(([k, a]) => shown.has(k) && (parseNPR(a) ?? 0) > 0)
  const amountPaisa = parseNPR(v.amount)
  const tickedSum = ticked(v).reduce((s, [, a]) => s + (parseNPR(a) ?? 0), 0)
  const extra = (amountPaisa ?? 0) - tickedSum
  const billsMode = openDocs.length > 0 && !isWorker
  // A subcontractor's ticked work: what they hold comes off first, the cash pays the rest.
  const subMode = billsMode && v.party_kind === 'subcontractor'
  const tickedDocs = openDocs.filter((d) => shown.has(docKey(d)) && docKey(d) in v.settle)
  const tickedOwed = tickedDocs.reduce((s, d) => s + d.amount_paisa, 0)
  const usable = useUsableHeld(subMode ? v.party_id : '', [...new Set(tickedDocs.map((d) => d.project_id!))], v.package_id || null)
  const heldLess = subMode ? Math.min(usable.paisa, tickedOwed) : 0
  const cashDue = tickedOwed - heldLess
  useEffect(() => {
    if (subMode && usable.ready) setValue('amount', paisaToInput(cashDue))
  }, [subMode, usable.ready, cashDue]) // eslint-disable-line react-hooks/exhaustive-deps
  const allocated = v.allocations.reduce((s, a) => s + (parseNPR(a.amount) ?? 0), 0)
  const unallocated = (amountPaisa ?? 0) - allocated
  const extraProject = pkgProject || v.extra_project || (visible.length === 1 ? visible[0].id : '')

  /** The project split the server gets: from the ticked bills, the package, or typed in. */
  function splitOf(vals: Values) {
    const amount = parseNPR(vals.amount) ?? 0
    if (vals.package_id) return pkgProject ? [{ project_id: pkgProject, amount_paisa: amount }] : []
    if (!billsMode) return vals.allocations.filter((a) => (parseNPR(a.amount) ?? 0) > 0).map((a) => ({ project_id: a.project_id, amount_paisa: parseNPR(a.amount)! }))
    const byProject = new Map<string, number>()
    for (const [k, a] of ticked(vals)) byProject.set(k.split(':')[1], (byProject.get(k.split(':')[1]) ?? 0) + (parseNPR(a) ?? 0))
    if (amount > tickedSum && extraProject) byProject.set(extraProject, (byProject.get(extraProject) ?? 0) + amount - tickedSum)
    return [...byProject].map(([project_id, amount_paisa]) => ({ project_id, amount_paisa }))
  }

  // A worker: money beyond the ticked days is an advance, on the project chosen (or the latest day's).
  const workerExtra = (amountPaisa ?? 0) - due
  const workerExtraProject = v.extra_project || tickedDays.at(-1)?.project_id || (visible.length === 1 ? visible[0].id : '')
  const [confirmDup, setConfirmDup] = useState(false)
  const payWorker = useMutation({
    mutationFn: async (a: { vals: Values; confirm: boolean }) => {
      const { vals } = a
      setValue('sent', true)
      await draft.save()
      const days = dayRows.filter((r) => vals.days?.includes(r.key))
      const r = (await rpc('pay_worker', { p_op_key: vals.op_key, p_pay: {
        id: vals.id, worker_id: vals.party_id, payment_date: vals.payment_date, amount_paisa: parseNPR(vals.amount) ?? 0,
        method: vals.method, reference: (WITH_REFERENCE.has(vals.method) && vals.reference.trim()) || null, notes: vals.notes || null,
        docs: days.map((d) => ({ doc_id: d.doc_id })),
        extra_project: workerExtra > 0 ? workerExtraProject || null : null, confirm_duplicate: a.confirm,
      } })) as { payment_id: string | null }
      const failed = r.payment_id ? await uploadPending({ userId: auth.userId, companyId: auth.companyId }, { payment_id: r.payment_id }, vals.photos) : 0
      return { paymentId: r.payment_id, failed }
    },
    onSuccess: async ({ paymentId, failed }, { vals }) => {
      await draft.clear()
      await refresh()
      // No payment when the advance covered the days: back to the worker.
      navigate(paymentId ? `/payments/${paymentId}` : `/workers/${vals.party_id}`, { replace: true, state: failed ? { photoFailed: failed } : undefined })
    },
    onError: (e) => setConfirmDup(((e as { message?: string }).message ?? '').startsWith('near_duplicate')),
  })

  const paySub = useMutation({
    mutationFn: async (vals: Values) => {
      setValue('sent', true)
      await draft.save()
      const r = (await rpc('pay_subcontractor', { p_op_key: vals.op_key, p_pay: {
        id: vals.id, subcontractor_id: vals.party_id, work_package_id: vals.package_id || null,
        payment_date: vals.payment_date, amount_paisa: parseNPR(vals.amount) ?? 0, method: vals.method,
        reference: (WITH_REFERENCE.has(vals.method) && vals.reference.trim()) || null, notes: vals.notes || null,
        docs: [...new Set(tickedDocs.map((d) => d.doc_id!))].map((doc_id) => ({ doc_id })),
      } })) as { payment_id: string | null; held_used_paisa: number }
      const failed = r.payment_id ? await uploadPending({ userId: auth.userId, companyId: auth.companyId }, { payment_id: r.payment_id }, vals.photos) : 0
      return { paymentId: r.payment_id, held: r.held_used_paisa, failed }
    },
    onSuccess: async ({ paymentId, held, failed }, vals) => {
      await draft.clear()
      await refresh()
      // No payment when what they hold paid it all: back to the work (package, or the subcontractor).
      const back = vals.package_id ? `/work/${vals.package_id}` : `${PARTY.subcontractor.path}/${vals.party_id}`
      navigate(paymentId ? `/payments/${paymentId}` : back,
        { replace: true, state: paymentId ? (failed ? { photoFailed: failed } : undefined) : { paidFromHeld: held } })
    },
  })

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      const settlements = billsMode || vals.package_id
        ? ticked(vals).map(([key, a]) => { const [doc_id, project_id] = key.split(':'); return { doc_id, project_id, amount_paisa: parseNPR(a) } })
        : []
      setValue('sent', true)
      await draft.save()
      await rpc('record_payment', { p_op_key: vals.op_key, p_payment: {
        id: vals.id, [PARTY[vals.party_kind].column]: vals.party_id, work_package_id: vals.package_id || null,
        payment_date: vals.payment_date, amount_paisa: parseNPR(vals.amount),
        method: vals.method, reference: (WITH_REFERENCE.has(vals.method) && vals.reference.trim()) || null, notes: vals.notes || null,
        allocations: splitOf(vals), settlements, is_peski: !anyUnpaid && (!!vals.package_id || vals.is_peski),
      } })
      // The payment is saved; a photo that fails to upload can be added again on the payment page.
      return uploadPending({ userId: auth.userId, companyId: auth.companyId }, { payment_id: vals.id }, vals.photos)
    },
    onSuccess: async (failedPhotos, vals) => {
      await draft.clear()
      await refresh()
      navigate(`/payments/${vals.id}`, { replace: true, state: failedPhotos ? { photoFailed: failedPhotos } : undefined })
    },
  })

  function submit() {
    const vals = getValues()
    if (isWorker) {
      const problem = !vals.party_id ? 'Choose the worker.'
        : amountPaisa === null || amountPaisa <= 0 ? 'Enter the amount paid.'
        : !accounts && workerExtra > 0 && !workerExtraProject ? 'Choose the project the extra money is for.'
        : ''
      setError(problem)
      if (!problem) payWorker.mutate({ vals, confirm: false })
      return
    }
    if (subMode) {
      const problem = !tickedDocs.length ? 'Tick the work it pays.'
        : amountPaisa === null || amountPaisa < 0 ? 'Enter the amount paid.'
        : amountPaisa === 0 && heldLess === 0 ? 'Enter the amount paid.'
        : !usable.ready ? 'Wait a moment: checking what they hold.'
        : ''
      setError(problem)
      if (!problem) paySub.mutate(vals)
      return
    }
    const split = splitOf(vals)
    const splitSum = split.reduce((s, a) => s + a.amount_paisa, 0)
    const problem =
      !vals.party_id ? `Choose the ${kindLabel.toLowerCase()}.`
      : !amountPaisa || amountPaisa <= 0 ? (billsMode ? 'Tick the bills it pays, or enter the amount.' : 'Enter the amount paid.')
      : billsMode && extra < 0 ? `The ticked bills add up to ${formatNPR(tickedSum)}, more than the payment. Untick one or lower an amount.`
      : !billsMode && !vals.package_id && vals.allocations.some((a) => !a.project_id || parseNPR(a.amount) === null) ? 'Each project split needs a project and an amount.'
      : !billsMode && new Set(vals.allocations.map((a) => a.project_id)).size !== vals.allocations.length ? 'A project is listed twice.'
      : splitSum > amountPaisa ? 'The project split is more than the payment.'
      : !accounts && splitSum !== amountPaisa ? (billsMode ? 'Choose the project the extra money is for.' : 'Split the whole payment across your projects.')
      : ''
    setError(problem)
    if (!problem) save.mutate(vals)
  }

  const fixedParty = !!start.id && v.party_id === start.id && !choosingParty

  // Where the payment was started from: a bill, a work package, a party, or the Payments list.
  const fromPackage = params.get('package')
  const fromBill = params.get('bill')
  const billDoc = fromBill ? openItems.data?.find((i) => i.kind === 'bill' && i.doc_id === fromBill) : undefined
  const startParty = parties.data?.find((p) => p.id === start.id)
  const crumbs: Crumb[] = fromBill
    ? [{ to: '/bills', label: 'Bills' }, { to: `/bills/${fromBill}`, label: billDoc ? billTitle(billDoc.label) : 'Bill' }]
    : fromPackage
      ? [{ to: '/parties', label: 'Parties' }, { to: PARTY.subcontractor.path, label: PARTY.subcontractor.many }, { to: `/work/${fromPackage}`, label: pkg.data?.scope ?? 'Work package' }]
      : start.id
        ? [{ to: '/parties', label: 'Parties' }, { to: PARTY[start.kind].path, label: PARTY[start.kind].many }, { to: `${PARTY[start.kind].path}/${start.id}`, label: startParty?.name ?? PARTY[start.kind].one }]
        : [{ to: '/payments', label: 'Payments' }]

  return (
    <>
      <PageHeader title="Record payment" crumbs={crumbs} subtitle="Payments reduce what you owe. They are never project cost." />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored a payment you had not saved. Check it was not already recorded.</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          {pkg.data && (
            <p className="mb-3 text-sm text-subtle">
              For work package <span className="font-medium text-ink">{pkg.data.scope}</span> on {pkg.data.projects?.code}.
              {anyUnpaid ? 'They have unpaid work, so this is a payment, not peski. It is never cost.' : 'Nothing is unpaid, so this is peski, not cost.'}
            </p>
          )}
          {v.package_id || fixedParty ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-subtle">Paid to </span>
                <span className="font-semibold text-ink">{v.package_id ? pkg.data?.subcontractors?.name : party?.name}</span>
                <span className="text-subtle"> · {kindLabel}</span>
              </p>
              {!v.package_id && <Button type="button" variant="ghost" onClick={() => setChoosingParty(true)}>Change</Button>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Paid to" htmlFor="p-kind">
                <Select id="p-kind" value={v.party_kind}
                  onChange={(e) => { setValue('party_kind', e.target.value as PartyKind); setValue('party_id', ''); setValue('days', null); setSettle({}) }}>
                  {PARTY_KINDS.filter((k) => k !== 'worker' || auth.company.labour_mode === 'attendance' || v.party_kind === 'worker')
                    .map((k) => <option key={k} value={k}>{PARTY[k].one}</option>)}
                </Select>
              </Field>
              <Field label={kindLabel} htmlFor="p-supplier">
                <Select id="p-supplier" value={v.party_id} onChange={(e) => { setValue('party_id', e.target.value); setValue('days', null); setSettle({}) }}>
                  <option value="">Choose {kindLabel.toLowerCase()}</option>
                  {parties.data?.filter((s) => s.active || s.id === v.party_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          {isWorker && v.party_id && workerReady && (
            <p className="mt-2 text-sm text-subtle">
              {allDays - advance > 0
                ? <>Owed to {party?.name ?? 'them'}: <span className="font-semibold text-ink">{formatNPR(allDays - advance)}</span></>
                : allDays - advance < 0 ? <>Advance with {party?.name ?? 'them'}: <span className="font-semibold text-ink">{formatNPR(advance - allDays)}</span></>
                : 'Nothing to pay.'}
              {allDays > 0 && advance > 0 && <> · {formatNPR(allDays)} for days, less {formatNPR(advance)} advance</>}
            </p>
          )}
          {!isWorker && v.party_id && openItems.data && (
            <p className="mt-2 text-sm text-subtle">
              {owed > 0 ? <>Unpaid: <span className="font-semibold text-ink">{formatNPR(owed)}</span></> : 'Nothing unpaid.'}
              {!!held.data?.peski_paisa && <> · Peski not yet used: {formatNPR(held.data.peski_paisa)}</>}
              {!!held.data?.overpaid_paisa && <> · {v.party_kind === 'worker' ? 'Paid ahead' : 'Overpaid'}: {formatNPR(held.data.overpaid_paisa)}</>}
            </p>
          )}
        </Card>

        {isWorker && v.party_id && workerReady && (
          <Card title="Which days does it pay?">
            {dayRows.length === 0 ? <p className="text-sm text-subtle">No days to pay. Money paid now is an advance; it comes off their next days.</p> : (
              <ul className="flex flex-col">
                {dayRows.map((r) => (
                  <li key={r.key} className="flex items-start justify-between gap-3 border-b border-line py-1 last:border-0">
                    <Checkbox label={`${code(r.project_id)} · ${formatDate(r.date, auth.dateDisplay)}`}
                      checked={!!v.days?.includes(r.key)}
                      onChange={(e) => setDays(e.target.checked ? [...(v.days ?? []), r.key] : (v.days ?? []).filter((k) => k !== r.key))} />
                    <span className="pt-2.5 text-sm tabular-nums text-ink">{formatNPR(r.amount)}</span>
                  </li>
                ))}
                {less > 0 && (
                  <li className="flex justify-between gap-3 pt-2 text-sm">
                    <span className="text-subtle">Less advance they already have</span>
                    <span className="tabular-nums text-ink">− {formatNPR(less)}</span>
                  </li>
                )}
                <li className="flex justify-between gap-3 pt-1 text-sm font-semibold text-ink">
                  <span>To pay</span><span className="tabular-nums">{formatNPR(due)}</span>
                </li>
              </ul>
            )}
          </Card>
        )}

        {billsMode && (
          <Card title={v.package_id ? 'Which approved work does it pay?' : v.party_kind === 'worker' ? 'Which days does it pay?' : 'Which bills does it pay?'}>
            <ul className="flex flex-col gap-2">
              {openDocs.map((b) => {
                const key = docKey(b)
                const on = key in v.settle
                return (
                  <li key={key} className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <Checkbox label={`${docLabel(b)} · ${code(b.project_id)} · ${formatDate(b.doc_date, auth.dateDisplay)}`} hint={`Owes ${formatNPR(b.amount_paisa)}`} checked={on}
                      onChange={(e) => {
                        const next = { ...getValues('settle') }
                        if (e.target.checked) next[key] = paisaToInput(b.amount_paisa)
                        else delete next[key]
                        setSettle(next)
                      }} />
                    {on && !subMode && (
                      <Field label="Paying now" htmlFor={`ps-${key}`}>
                        <MoneyInput id={`ps-${key}`} value={v.settle[key]} onChange={(e) => setSettle({ ...getValues('settle'), [key]: e.target.value })} />
                      </Field>
                    )}
                  </li>
                )
              })}
              {subMode && tickedDocs.length > 0 && (
                <>
                  {heldLess > 0 && (
                    <li className="flex justify-between gap-3 border-t border-line pt-2 text-sm">
                      <span className="text-subtle">Less money they hold (peski, paid ahead, opening balance)</span>
                      <span className="tabular-nums text-ink">− {formatNPR(heldLess)}</span>
                    </li>
                  )}
                  <li className={`flex justify-between gap-3 text-sm font-semibold text-ink ${heldLess > 0 ? '' : 'border-t border-line pt-2'}`}>
                    <span>To pay in cash</span><span className="tabular-nums">{usable.ready ? formatNPR(cashDue) : '…'}</span>
                  </li>
                </>
              )}
            </ul>
          </Card>
        )}

        {v.party_id && !billsMode && !isWorker && !v.package_id && (
          <Card title="Which project is it for?">
            {!anyUnpaid && (
              <div className="mb-2">
                <Controller control={control} name="is_peski" render={({ field }) => (
                  <Checkbox label="This is peski" checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                    hint={field.value
                      ? 'Agreed upfront before any bill. It is deducted from their bills as they come.'
                      : 'Paid ahead on the khata. It counts as overpaid and is deducted from their next bill.'} />
                )} />
              </div>
            )}
            <p className="mb-3 text-sm text-subtle">
              {accounts
                ? 'Splitting by project is optional. Anything not split stays "not assigned" until you assign it.'
                : 'Split the whole payment across your projects.'}
            </p>
            {allocations.fields.map((f, i) => (
              <div key={f.id} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field label="Project" htmlFor={`pa${i}-p`}>
                  <Select id={`pa${i}-p`} {...register(`allocations.${i}.project_id`)}>
                    <option value="">Choose</option>
                    {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Amount" htmlFor={`pa${i}-a`}>
                  <Controller control={control} name={`allocations.${i}.amount`} render={({ field }) => (
                    <MoneyInput id={`pa${i}-a`} value={field.value} onChange={field.onChange} />
                  )} />
                </Field>
                <Button type="button" variant="ghost" aria-label="Remove project" onClick={() => allocations.remove(i)}><TrashIcon size={16} />Remove</Button>
              </div>
            ))}
            <Button type="button" variant="secondary"
              onClick={() => allocations.append({ project_id: firstFree(), amount: unallocated > 0 ? paisaToInput(unallocated) : '' })}>
              Add project
            </Button>
            {amountPaisa !== null && amountPaisa > 0 && (
              <p className={`mt-2 text-sm ${unallocated < 0 ? 'text-danger' : 'text-subtle'}`}>
                {unallocated === 0 ? 'Fully split to projects.' : unallocated > 0 ? `${formatNPR(unallocated)} not assigned to a project.` : `Split is ${formatNPR(-unallocated)} more than the payment.`}
              </p>
            )}
          </Card>
        )}

        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount paid" htmlFor="p-amount" hint={isWorker
                ? 'Set from the ticked days. Less pays the oldest days first; more is an advance that comes off their next days.'
                : subMode ? 'What is left after the money they hold. Less pays the oldest work first; more stays with them for their next bill.'
                : billsMode ? 'Set from the ticked bills. Anything extra is overpaid and deducted from their next bill.' : undefined}>
              <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="p-amount" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Paid on" htmlFor="p-date">
              <Controller control={control} name="payment_date" render={({ field }) => (
                <DateInput id="p-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            {isWorker && workerExtra > 0 && (
              <Field label={`Advance of ${formatNPR(workerExtra)} is on`} htmlFor="p-wextra">
                <Select id="p-wextra" value={workerExtraProject} onChange={(e) => setValue('extra_project', e.target.value)}>
                  <option value="">{accounts ? 'Not assigned yet' : 'Choose project'}</option>
                  {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            {billsMode && !subMode && !v.package_id && extra > 0 && (
              <Field label={`Extra ${formatNPR(extra)} is ${v.party_kind === 'worker' ? 'paid ahead' : 'overpaid'} on`} htmlFor="p-extra">
                <Select id="p-extra" value={extraProject} onChange={(e) => setValue('extra_project', e.target.value)}>
                  <option value="">{accounts ? 'Not assigned yet' : 'Choose project'}</option>
                  {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="How" htmlFor="p-method">
              <Select id="p-method" {...register('method')}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            {WITH_REFERENCE.has(v.method) && (
              <Field label="Reference" htmlFor="p-ref" hint="Cheque number, transaction id"><Input id="p-ref" {...register('reference')} /></Field>
            )}
            <Field label="Notes" htmlFor="p-notes" hint="Optional"><Input id="p-notes" {...register('notes')} /></Field>
          </div>
          <div className="mt-3">
            <Controller control={control} name="photos" render={({ field }) => (
              <PhotoPicker value={field.value} onChange={field.onChange} label="Add receipt or cheque photo" what="Receipt photo" />
            )} />
          </div>
        </Card>

        {confirmDup && (
          <Notice>
            <span className="block">{friendlyError(payWorker.error)} Is this a second entry for the same day?</span>
            <span className="mt-2 flex flex-wrap gap-2">
              <Button type="button" busy={payWorker.isPending} onClick={() => { setConfirmDup(false); payWorker.mutate({ vals: getValues(), confirm: true }) }}>Yes, add the days</Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmDup(false)}>No, check first</Button>
            </span>
          </Notice>
        )}
        <ErrorBanner>{error || (!confirmDup && payWorker.error && friendlyError(payWorker.error)) || (save.error && friendlyError(save.error))
          || (paySub.error && friendlyError(paySub.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending || payWorker.isPending || paySub.isPending}>
            {subMode && !amountPaisa && heldLess > 0 ? 'Pay from money they hold'
              : `Record payment${amountPaisa ? ` of ${formatNPR(amountPaisa)}` : ''}`}
          </Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
          {v.party_id && !v.package_id && (
            <Link className="text-sm text-subtle underline underline-offset-4" to={`${PARTY[v.party_kind].path}/${v.party_id}`}>Open khata</Link>
          )}
        </FormActions>
      </form>
    </>
  )
}
