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
// Every subcontractor payment names its work (a work package; one can be added here). One paid
// directly (GLOSSARY: Direct Payment) with nothing unpaid on that work: the amount is the work done,
// and pay_work_done records it and pays it in one step, what they hold first. Ticking "advance"
// makes it peski instead.
// The payment id and operation key stay with the device draft until the server confirms,
// so a retry after a lost connection never records it twice (acceptance #13).
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, Checkbox, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select, Spinner, type Crumb } from '../../components/ui'
import { formatDate, todayKathmandu, type IsoDate } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { billTitle, PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, paisaToInput, parseNPR } from '../../lib/money'
import { useParties, usePartyHeld, usePartyOpenItems } from '../parties/api'
import { DOC_WORD, PARTY, PARTY_KINDS, partyFromParams, type PartyKind } from '../parties/kinds'
import { useProjects } from '../projects/api'
import { projectChoices, useCurrentProject } from '../projects/current'
import { useCharges, useUsableHeld, useWorkPackage, useWorkPackages } from '../subcontract/api'
import { useWorkerAdvance } from '../labour/api'
import { useRefreshMoney } from '../../data/refresh'
import { rpc } from '../../data/rpc'
import { canManageSuppliers, canPost } from '../../data/permissions'
import { TrashIcon } from '../../components/icons'
import { t } from '../../lib/i18n'
import { refresh as refreshData } from '../../data/refresh'
import {
  docKey, fillOldestFirst, hasUnpaid, heldAndCash, payableDocs, projectSplit, tickedEntries, untickedOldestFirst, workerDays,
  type DayRow,
} from './paymentMath'

type Values = {
  id: string
  op_key: string
  party_kind: PartyKind
  party_id: string
  package_id: string
  is_peski: boolean // only when nothing is unpaid
  advance: boolean // a subcontractor paid directly: peski for work not done yet, not work done
  charge_id: string // a direct payment: the work charge it records, and the keys of its two steps
  approve_op_key: string
  pay_op_key: string
  cash_sent: number | null // a direct payment: the cash sent, sent again on a retry until the server answers
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
      is_peski: true, advance: false, charge_id: newId(), approve_op_key: newId(), pay_op_key: newId(), cash_sent: null, payment_date: todayKathmandu(), amount: '', method: 'cash', reference: '', notes: '',
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
  const openDocs = payableDocs(openItems.data, v.package_id, pkgChargeIds)
  const held = usePartyHeld(v.party_id, !!v.party_id)
  const isWorker = v.party_kind === 'worker'
  const workerAdvance = useWorkerAdvance(v.party_id, isWorker && !!v.party_id)
  // Peski only while nothing at all is unpaid to the party (any package or project).
  const anyUnpaid = hasUnpaid(openItems.data)
  const owed = openDocs.reduce((s, d) => s + d.amount_paisa, 0)
  const docLabel = (d: (typeof openDocs)[number]) => (d.kind === 'bill' ? t('paymentNew.billLabel', { label: d.label }) : `${DOC_WORD[d.kind]}: ${d.label}`)
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
  const { less, due, allDays } = workerDays(dayRows, v.days, advance)
  const setDays = (keys: string[]) => {
    setValue('days', keys)
    setValue('amount', paisaToInput(workerDays(dayRows, keys, advance).due))
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
  const ticked = (vals: Values) => tickedEntries(vals.settle, shown)
  const amountPaisa = parseNPR(v.amount)
  const tickedSum = ticked(v).reduce((s, [, a]) => s + (parseNPR(a) ?? 0), 0)
  const extra = (amountPaisa ?? 0) - tickedSum
  const billsMode = openDocs.length > 0 && !isWorker
  // A subcontractor's ticked work: what they hold comes off first, the cash pays the rest.
  const subMode = billsMode && v.party_kind === 'subcontractor'
  const tickedDocs = openDocs.filter((d) => shown.has(docKey(d)) && docKey(d) in v.settle)
  const tickedOwed = tickedDocs.reduce((s, d) => s + d.amount_paisa, 0)
  // A subcontractor with nothing to tick: the payment is for a work, chosen below.
  const isSub = v.party_kind === 'subcontractor'
  const forWork = isSub && !!v.party_id && !billsMode
  // Paid directly, and nothing unpaid on the chosen work: the amount is the work done.
  const direct = forWork && party?.pays_by === 'direct' && !!v.package_id && !(v.advance && !anyUnpaid)
  const usable = useUsableHeld(subMode || direct ? v.party_id : '',
    direct ? (pkgProject ? [pkgProject] : []) : [...new Set(tickedDocs.map((d) => d.project_id!))], v.package_id || null)
  // A direct payment already sent shows (and sends again) the cash it was sent with: if it was saved
  // and the reply lost, what they hold is now less, and a new figure would not match its op_key.
  const { heldLess, cashDue, directCash, directHeld } = heldAndCash({ subMode, direct, usable: usable.paisa, tickedOwed, amountPaisa, cashSent: v.cash_sent })
  useEffect(() => {
    if (subMode && usable.ready) setValue('amount', paisaToInput(cashDue))
  }, [subMode, usable.ready, cashDue]) // eslint-disable-line react-hooks/exhaustive-deps
  const allocated = v.allocations.reduce((s, a) => s + (parseNPR(a.amount) ?? 0), 0)
  const unallocated = (amountPaisa ?? 0) - allocated
  const extraProject = pkgProject || v.extra_project || (visible.length === 1 ? visible[0].id : '')
  // Money beyond the ticked bills while other bills are unpaid: offer to pay those, oldest first,
  // before any of it counts as overpaid.
  const untickedOpen = billsMode && !subMode && !v.package_id ? untickedOldestFirst(openDocs, v.settle) : []
  function extraToBills() {
    setValue('settle', fillOldestFirst(getValues('settle'), untickedOpen, extra))
  }

  /** The project split the server gets: from the ticked bills, the package, or typed in. */
  function splitOf(vals: Values) {
    return projectSplit({ amount: parseNPR(vals.amount) ?? 0, packageId: vals.package_id, pkgProject, billsMode,
      allocations: vals.allocations, ticked: ticked(vals), tickedSum, extraProject })
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

  // Work done and paid in one step: what they hold first, then the cash (pay_work_done).
  const queryClient = useQueryClient()
  const payDirect = useMutation({
    mutationFn: async (vals: Values) => {
      const cash = vals.cash_sent ?? cashDue
      setValue('sent', true)
      setValue('cash_sent', cash)
      await draft.save()
      const r = (await rpc('pay_work_done', { p_op_key: vals.op_key, p_pay: {
        id: vals.id, charge_id: vals.charge_id, approve_op_key: vals.approve_op_key, pay_op_key: vals.pay_op_key,
        subcontractor_id: vals.party_id, work_package_id: vals.package_id,
        work_paisa: parseNPR(vals.amount) ?? 0, amount_paisa: cash,
        payment_date: vals.payment_date, method: vals.method,
        reference: (WITH_REFERENCE.has(vals.method) && vals.reference.trim()) || null, notes: vals.notes || null,
      } })) as { payment_id: string | null; held_used_paisa: number }
      const failed = r.payment_id ? await uploadPending({ userId: auth.userId, companyId: auth.companyId }, { payment_id: r.payment_id }, vals.photos) : 0
      return { paymentId: r.payment_id, held: r.held_used_paisa, failed }
    },
    onSuccess: async ({ paymentId, held, failed }, vals) => {
      await draft.clear()
      await refresh()
      await refreshData(queryClient, 'work')
      navigate(paymentId ? `/payments/${paymentId}` : `/work/${vals.package_id}`,
        { replace: true, state: paymentId ? (failed ? { photoFailed: failed } : undefined) : { paidFromHeld: held } })
    },
    // The server answered (an SQLSTATE code): nothing was saved, so the cash is worked out again from
    // what they hold, read afresh. No answer (offline, timeout): it may have been saved; keep the cash.
    onError: (e) => {
      if (!/^[0-9A-Z]{5}$/.test((e as { code?: string }).code ?? '')) return
      setValue('cash_sent', null)
      void draft.save()
      void queryClient.invalidateQueries({ queryKey: ['balances', 'usable-held'] })
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
      const problem = !vals.party_id ? t('paymentNew.chooseTheWorker')
        : amountPaisa === null || amountPaisa <= 0 ? t('paymentNew.enterTheAmountPaid')
        : !accounts && workerExtra > 0 && !workerExtraProject ? t('paymentNew.chooseTheProjectThe')
        : ''
      setError(problem)
      if (!problem) payWorker.mutate({ vals, confirm: false })
      return
    }
    if (subMode) {
      const problem = !tickedDocs.length ? t('paymentNew.tickTheWorkIt')
        : amountPaisa === null || amountPaisa < 0 ? t('paymentNew.enterTheAmountPaid')
        : amountPaisa === 0 && heldLess === 0 ? t('paymentNew.enterTheAmountPaid')
        : !usable.ready ? t('paymentNew.waitAMomentChecking')
        : ''
      setError(problem)
      if (!problem) paySub.mutate(vals)
      return
    }
    if (forWork) {
      const problem = !vals.package_id ? t('paymentNew.chooseTheWork')
        : amountPaisa === null || amountPaisa <= 0 ? t('paymentNew.enterTheAmountPaid')
        : direct && !usable.ready && vals.cash_sent == null ? t('paymentNew.waitAMomentChecking')
        : ''
      setError(problem)
      if (!problem) (direct ? payDirect : save).mutate(vals)
      return
    }
    const split = splitOf(vals)
    const splitSum = split.reduce((s, a) => s + a.amount_paisa, 0)
    const problem =
      !vals.party_id ? t('paymentNew.chooseTheValue', { value: kindLabel.toLowerCase() })
      : !amountPaisa || amountPaisa <= 0 ? (billsMode ? t('paymentNew.tickTheBillsIt') : t('paymentNew.enterTheAmountPaid'))
      : billsMode && extra < 0 ? t('paymentNew.theTickedBillsAdd', { tickedSum: formatNPR(tickedSum) })
      : !billsMode && !vals.package_id && vals.allocations.some((a) => !a.project_id || parseNPR(a.amount) === null) ? t('paymentNew.eachProjectSplitNeeds')
      : !billsMode && new Set(vals.allocations.map((a) => a.project_id)).size !== vals.allocations.length ? t('paymentNew.aProjectIsListed')
      : splitSum > amountPaisa ? t('paymentNew.theProjectSplitIs')
      : !accounts && splitSum !== amountPaisa ? (billsMode ? t('paymentNew.chooseTheProjectThe') : t('paymentNew.splitTheWholePayment'))
      : ''
    setError(problem)
    if (!problem) save.mutate(vals)
  }

  const fixedParty = !!start.id && v.party_id === start.id && !choosingParty
  const fromPackage = params.get('package')

  // Where the payment was started from: a bill, a work package, a party, or the Payments list.
  const fromBill = params.get('bill')
  const billDoc = fromBill ? openItems.data?.find((i) => i.kind === 'bill' && i.doc_id === fromBill) : undefined
  const startParty = parties.data?.find((p) => p.id === start.id)
  const crumbs: Crumb[] = fromBill
    ? [{ to: '/bills', label: t('paymentNew.bills') }, { to: `/bills/${fromBill}`, label: billDoc ? billTitle(billDoc.label) : t('paymentNew.bill') }]
    : fromPackage
      ? [{ to: '/parties', label: t('paymentNew.parties') }, { to: PARTY.subcontractor.path, label: PARTY.subcontractor.many }, { to: `/work/${fromPackage}`, label: pkg.data?.scope ?? t('paymentNew.workPackage') }]
      : start.id
        ? [{ to: '/parties', label: t('paymentNew.parties') }, { to: PARTY[start.kind].path, label: PARTY[start.kind].many }, { to: `${PARTY[start.kind].path}/${start.id}`, label: startParty?.name ?? PARTY[start.kind].one }]
        : [{ to: '/payments', label: t('paymentNew.payments') }]

  return (
    <>
      <PageHeader title={t('paymentNew.recordPayment')} crumbs={crumbs} subtitle={direct ? t('paymentNew.directSubtitle') : t('paymentNew.paymentsReduceWhatYou')} />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('paymentNew.restoredAPaymentYou')}</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          {fromPackage || fixedParty ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-subtle">{t('paymentNew.paidTo')}{' '}</span>
                <span className="font-semibold text-ink">{fromPackage ? pkg.data?.subcontractors?.name : party?.name}</span>
                <span className="text-subtle"> · {kindLabel}</span>
              </p>
              {!fromPackage && <Button type="button" variant="ghost" onClick={() => setChoosingParty(true)}>{t('paymentNew.change')}</Button>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('paymentNew.paidTo')} htmlFor="p-kind">
                <Select id="p-kind" value={v.party_kind}
                  onChange={(e) => { setValue('party_kind', e.target.value as PartyKind); setValue('party_id', ''); setValue('package_id', ''); setValue('days', null); setSettle({}) }}>
                  {PARTY_KINDS.filter((k) => k !== 'worker' || auth.company.labour_mode === 'attendance' || v.party_kind === 'worker')
                    .map((k) => <option key={k} value={k}>{PARTY[k].one}</option>)}
                </Select>
              </Field>
              <Field label={kindLabel} htmlFor="p-supplier">
                <Select id="p-supplier" value={v.party_id} onChange={(e) => { setValue('party_id', e.target.value); setValue('package_id', ''); setValue('days', null); setSettle({}) }}>
                  <option value="">{t('paymentNew.chooseValue', { value: kindLabel.toLowerCase() })}</option>
                  {parties.data?.filter((s) => s.active || s.id === v.party_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          {isWorker && v.party_id && workerReady && (
            <p className="mt-2 text-sm text-subtle">
              {allDays - advance > 0
                ? <>{t('paymentNew.owedTo')}{' '}{party?.name ?? 'them'}: <span className="font-semibold text-ink">{formatNPR(allDays - advance)}</span></>
                : allDays - advance < 0 ? <>{t('paymentNew.advanceWith')}{' '}{party?.name ?? 'them'}: <span className="font-semibold text-ink">{formatNPR(advance - allDays)}</span></>
                : t('paymentNew.nothingToPay')}
              {allDays > 0 && advance > 0 && <> {t('paymentNew.alldaysForDaysLess', { allDays: formatNPR(allDays), advance: formatNPR(advance) })}</>}
            </p>
          )}
          {!isWorker && v.party_id && openItems.data && (
            <p className="mt-2 text-sm text-subtle">
              {owed > 0 ? <>{t('paymentNew.unpaid')}{' '}<span className="font-semibold text-ink">{formatNPR(owed)}</span></> : t('paymentNew.nothingUnpaid')}
              {!!held.data?.peski_paisa && <> {t('paymentNew.peskiNotYetUsed', { peski: formatNPR(held.data.peski_paisa) })}</>}
              {!!held.data?.overpaid_paisa && <> · {v.party_kind === 'worker' ? t('paymentNew.paidAhead') : t('paymentNew.overpaid')}: {formatNPR(held.data.overpaid_paisa)}</>}
            </p>
          )}
        </Card>

        {isWorker && v.party_id && workerReady && (
          <Card title={t('paymentNew.whichDaysDoesIt')}>
            {dayRows.length === 0 ? <p className="text-sm text-subtle">{t('paymentNew.noDaysToPay')}</p> : (
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
                    <span className="text-subtle">{t('paymentNew.lessAdvanceTheyAlready')}</span>
                    <span className="tabular-nums text-ink">− {formatNPR(less)}</span>
                  </li>
                )}
                <li className="flex justify-between gap-3 pt-1 text-sm font-semibold text-ink">
                  <span>{t('paymentNew.toPay')}</span><span className="tabular-nums">{formatNPR(due)}</span>
                </li>
              </ul>
            )}
          </Card>
        )}

        {isSub && v.party_id && (forWork || !!v.package_id) && (
          <WorkCard subcontractorId={v.party_id} value={v.package_id} preferProject={projectParam}
            onChange={(id) => { setValue('package_id', id); setSettle({}) }}>
            {forWork && party?.pays_by === 'direct' && !anyUnpaid && (
              <Controller control={control} name="advance" render={({ field }) => (
                <Checkbox label={t('paymentNew.thisIsAnAdvance')} checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                  hint={field.value ? t('paymentNew.advanceHint') : t('paymentNew.workDoneHint')} />
              )} />
            )}
            {forWork && !direct && !!v.package_id && (
              <p className="text-sm text-subtle">{anyUnpaid ? t('paymentNew.theyHaveUnpaidWork') : t('paymentNew.nothingIsUnpaidSo')}</p>
            )}
            {direct && directHeld > 0 && (
              <ul className="flex flex-col border-t border-line pt-2">
                <li className="flex justify-between gap-3 text-sm">
                  <span className="text-subtle">{t('paymentNew.lessMoneyTheyHold')}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-ink">− {formatNPR(directHeld)}</span>
                </li>
                <li className="flex justify-between gap-3 text-sm font-semibold text-ink">
                  <span>{t('paymentNew.toPayInCash')}</span><span className="shrink-0 whitespace-nowrap tabular-nums">{usable.ready || v.cash_sent != null ? formatNPR(directCash) : '…'}</span>
                </li>
              </ul>
            )}
          </WorkCard>
        )}

        {billsMode && (
          <Card title={v.package_id ? t('paymentNew.whichApprovedWorkDoes') : v.party_kind === 'worker' ? t('paymentNew.whichDaysDoesIt') : t('paymentNew.whichBillsDoesIt')}>
            <ul className="flex flex-col gap-2">
              {openDocs.map((b) => {
                const key = docKey(b)
                const on = key in v.settle
                return (
                  <li key={key} className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <Checkbox label={`${docLabel(b)} · ${code(b.project_id)} · ${formatDate(b.doc_date, auth.dateDisplay)}`} hint={t('paymentNew.owesAmount', { amount: formatNPR(b.amount_paisa) })} checked={on}
                      onChange={(e) => {
                        const next = { ...getValues('settle') }
                        if (e.target.checked) next[key] = paisaToInput(b.amount_paisa)
                        else delete next[key]
                        setSettle(next)
                      }} />
                    {on && !subMode && (
                      <Field label={t('paymentNew.payingNow')} htmlFor={`ps-${key}`}>
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
                      <span className="text-subtle">{t('paymentNew.lessMoneyTheyHold')}</span>
                      <span className="tabular-nums text-ink">− {formatNPR(heldLess)}</span>
                    </li>
                  )}
                  <li className={`flex justify-between gap-3 text-sm font-semibold text-ink ${heldLess > 0 ? '' : 'border-t border-line pt-2'}`}>
                    <span>{t('paymentNew.toPayInCash')}</span><span className="tabular-nums">{usable.ready ? formatNPR(cashDue) : '…'}</span>
                  </li>
                </>
              )}
            </ul>
          </Card>
        )}

        {v.party_id && !billsMode && !isWorker && !isSub && !v.package_id && (
          <Card title={t('paymentNew.whichProjectIsIt')}>
            {!anyUnpaid && (
              <div className="mb-2">
                <Controller control={control} name="is_peski" render={({ field }) => (
                  <Checkbox label={t('paymentNew.thisIsPeski')} checked={field.value} onChange={(e) => field.onChange(e.target.checked)}
                    hint={field.value
                      ? t('paymentNew.agreedUpfrontBeforeAny')
                      : t('paymentNew.paidAheadOnThe')} />
                )} />
              </div>
            )}
            <p className="mb-3 text-sm text-subtle">
              {accounts
                ? t('paymentNew.splittingByProjectIs')
                : t('paymentNew.splitTheWholePayment')}
            </p>
            {allocations.fields.map((f, i) => (
              <div key={f.id} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field label={t('paymentNew.project')} htmlFor={`pa${i}-p`}>
                  <Select id={`pa${i}-p`} {...register(`allocations.${i}.project_id`)}>
                    <option value="">{t('paymentNew.choose')}</option>
                    {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                  </Select>
                </Field>
                <Field label={t('paymentNew.amount')} htmlFor={`pa${i}-a`}>
                  <Controller control={control} name={`allocations.${i}.amount`} render={({ field }) => (
                    <MoneyInput id={`pa${i}-a`} value={field.value} onChange={field.onChange} />
                  )} />
                </Field>
                <Button type="button" variant="ghost" aria-label={t('paymentNew.removeProject')} onClick={() => allocations.remove(i)}><TrashIcon size={16} />{t('common.remove')}</Button>
              </div>
            ))}
            <Button type="button" variant="secondary"
              onClick={() => allocations.append({ project_id: firstFree(), amount: unallocated > 0 ? paisaToInput(unallocated) : '' })}>
              {t('paymentNew.addProject')}</Button>
            {amountPaisa !== null && amountPaisa > 0 && (
              <p className={`mt-2 text-sm ${unallocated < 0 ? 'text-danger' : 'text-subtle'}`}>
                {unallocated === 0 ? t('paymentNew.fullySplitToProjects') : unallocated > 0 ? t('paymentNew.unallocatedNotAssignedTo', { unallocated: formatNPR(unallocated) }) : t('paymentNew.splitIsAmountMore', { amount: formatNPR(-unallocated) })}
              </p>
            )}
          </Card>
        )}

        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={direct ? t('paymentNew.amountForTheWork') : t('paymentNew.amountPaid')} htmlFor="p-amount" hint={isWorker
                ? t('paymentNew.setFromTheTicked')
                : subMode ? t('paymentNew.whatIsLeftAfter')
                : direct ? t('paymentNew.amountForTheWorkHint')
                : billsMode ? t('paymentNew.setFromTheTicked2') : undefined}>
              <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="p-amount" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label={t('paymentNew.paidOn')} htmlFor="p-date">
              <Controller control={control} name="payment_date" render={({ field }) => (
                <DateInput id="p-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            {isWorker && workerExtra > 0 && (
              <Field label={t('paymentNew.advanceOfWorkerextraIs', { workerExtra: formatNPR(workerExtra) })} htmlFor="p-wextra">
                <Select id="p-wextra" value={workerExtraProject} onChange={(e) => setValue('extra_project', e.target.value)}>
                  <option value="">{accounts ? t('paymentNew.notAssignedYet') : t('common.project.choose')}</option>
                  {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            {extra > 0 && untickedOpen.length > 0 && (
              <div className="sm:col-span-2">
                <Notice>
                  {t('paymentNew.extraIsMoreThan', { extra: formatNPR(extra) })}{' '}{untickedOpen.length === 1 ? t('paymentNew.valueProjectidIs', { value: docLabel(untickedOpen[0]), projectId: code(untickedOpen[0].project_id) }) : t('paymentNew.lengthOtherBillsAre', { length: untickedOpen.length })} {t('paymentNew.stillUnpaidValue', { value: ' ' })}<button type="button" className="min-h-11 font-semibold text-slate underline" onClick={extraToBills}>
                    {untickedOpen.length === 1 ? t('paymentNew.payValueWithIt', { value: docLabel(untickedOpen[0]) }) : t('paymentNew.payTheOldestBills')}
                  </button>
                </Notice>
              </div>
            )}
            {billsMode && !subMode && !v.package_id && extra > 0 && (
              <Field label={t(v.party_kind === 'worker' ? 'paymentNew.extraPaidAheadOn' : 'paymentNew.extraOverpaidOn', { amount: formatNPR(extra) })} htmlFor="p-extra">
                <Select id="p-extra" value={extraProject} onChange={(e) => setValue('extra_project', e.target.value)}>
                  <option value="">{accounts ? t('paymentNew.notAssignedYet') : t('common.project.choose')}</option>
                  {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t('paymentNew.how')} htmlFor="p-method">
              <Select id="p-method" {...register('method')}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            {WITH_REFERENCE.has(v.method) && (
              <Field label={t('paymentNew.reference')} htmlFor="p-ref" hint={t('paymentNew.chequeNumberTransactionId')}><Input id="p-ref" {...register('reference')} /></Field>
            )}
            <Field label={t('paymentNew.notes')} htmlFor="p-notes" hint={t('common.optional')}><Input id="p-notes" {...register('notes')} /></Field>
          </div>
          <div className="mt-3">
            <Controller control={control} name="photos" render={({ field }) => (
              <PhotoPicker value={field.value} onChange={field.onChange} label={t('paymentNew.addReceiptOrCheque')} what={t('paymentNew.receiptPhoto')} />
            )} />
          </div>
        </Card>

        {confirmDup && (
          <Notice>
            <span className="block">{t('paymentNew.errorIsThisA', { error: friendlyError(payWorker.error) })}</span>
            <span className="mt-2 flex flex-wrap gap-2">
              <Button type="button" busy={payWorker.isPending} onClick={() => { setConfirmDup(false); payWorker.mutate({ vals: getValues(), confirm: true }) }}>{t('paymentNew.yesAddTheDays')}</Button>
              <Button type="button" variant="secondary" onClick={() => setConfirmDup(false)}>{t('paymentNew.noCheckFirst')}</Button>
            </span>
          </Notice>
        )}
        <ErrorBanner>{error || (!confirmDup && payWorker.error && friendlyError(payWorker.error)) || (save.error && friendlyError(save.error))
          || (paySub.error && friendlyError(paySub.error)) || (payDirect.error && friendlyError(payDirect.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending || payWorker.isPending || paySub.isPending || payDirect.isPending}>
            {direct && amountPaisa ? (directCash > 0 ? t('paymentNew.recordPaymentOf', { amount: formatNPR(directCash) }) : t('paymentNew.payFromMoneyThey'))
              : subMode && !amountPaisa && heldLess > 0 ? t('paymentNew.payFromMoneyThey')
              : amountPaisa ? t('paymentNew.recordPaymentOf', { amount: formatNPR(amountPaisa) }) : t('paymentNew.recordPayment')}
          </Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>{t('common.cancel')}</Button>
          {v.party_id && !v.package_id && (
            <Link className="text-sm text-subtle underline underline-offset-4" to={`${PARTY[v.party_kind].path}/${v.party_id}`}>{t('paymentNew.openKhata')}</Link>
          )}
        </FormActions>
      </form>
    </>
  )
}

/**
 * "Which work is it for?": the subcontractor's active work, the current project's first; one
 * work is chosen for them. A work not set up yet is added here (name and project; the default
 * subcontract heading), so paying never waits on the work package form.
 */
function WorkCard({ subcontractorId, value, preferProject, onChange, children }: {
  subcontractorId: string; value: string; preferProject: string; onChange: (id: string) => void; children?: ReactNode
}) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const current = useCurrentProject()
  const projects = useProjects(auth.companyId)
  const packages = useWorkPackages({ subcontractorId })
  const prefer = preferProject || current.project?.id || ''
  const list = (packages.data ?? [])
    .filter((w) => w.status === 'active' || w.id === value)
    .sort((a, b) => Number(b.project_id === prefer) - Number(a.project_id === prefer))
  const [adding, setAdding] = useState(false)
  const [scope, setScope] = useState('')
  const [project, setProject] = useState(prefer)
  const [newWorkId] = useState(newId)
  const canAdd = canManageSuppliers(auth)
  const sites = projectChoices(projects.data, 'site')

  // One active work: it is the one.
  useEffect(() => {
    if (!value && packages.data && list.length === 1) onChange(list[0].id)
  }, [packages.data, value]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = useMutation({
    mutationFn: () => rpc('save_work_package', { p_package: {
      id: newWorkId, project_id: project, subcontractor_id: subcontractorId, scope: scope.trim(),
    } }),
    onSuccess: async (id) => {
      // A new package has no money on it yet: only the list changes. Choose it straight after, so
      // an amount typed meanwhile is not reset by a slower, wider refresh.
      await queryClient.invalidateQueries({ queryKey: ['work-packages'] })
      setAdding(false)
      onChange(id as string)
    },
  })

  return (
    <Card title={t('paymentNew.whichWorkIsIt')}>
      {packages.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void packages.refetch()}>{packages.error && friendlyError(packages.error)}</ErrorBanner>
      {packages.data && list.length === 0 && !adding && <p className="mb-2 text-sm text-subtle">{t('paymentNew.noWorkYet')}</p>}
      {list.length > 0 && (
        <ul className="mb-2 flex flex-col">
          {list.map((w) => (
            <li key={w.id} className="border-b border-line last:border-0">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="radio" name="work" className="size-5 accent-brand" checked={value === w.id} onChange={() => onChange(w.id)} />
                <span className="min-w-0 break-words">
                  <span className="font-medium text-ink">{w.scope}</span>
                  <span className="text-subtle"> · {w.projects?.code}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="mb-2 grid gap-3 sm:grid-cols-2">
          <Field label={t('paymentNew.newWorkName')} htmlFor="wk-scope" hint={t('paymentNew.newWorkNameHint')}>
            <Input id="wk-scope" value={scope} onChange={(e) => setScope(e.target.value)} />
          </Field>
          <Field label={t('paymentNew.project')} htmlFor="wk-project">
            <Select id="wk-project" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">{t('paymentNew.choose')}</option>
              {sites.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
          <ErrorBanner>{add.error && friendlyError(add.error)}</ErrorBanner>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="button" busy={add.isPending} disabled={!scope.trim() || !project} onClick={() => add.mutate()}>{t('paymentNew.addWork')}</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      ) : canAdd ? (
        <Button type="button" variant="secondary" onClick={() => { setProject((p) => p || prefer); setAdding(true) }}>{t('paymentNew.newWork')}</Button>
      ) : packages.data && list.length === 0 && <p className="text-sm text-subtle">{t('paymentNew.askAdminToAddWork')}</p>}
      {children && <div className="mt-3 flex flex-col gap-2">{children}</div>}
    </Card>
  )
}
