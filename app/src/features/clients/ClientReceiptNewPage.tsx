// Record money the client paid on a project. One amount: what the client settled, including any
// TDS or retention they kept back, so "Contract balance" stays right without accounting knowledge.
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useForm, type Path, type PathValue } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, ErrorBanner, Field, Input, Notice, PageHeader, Select } from '../../components/ui'
import type { Database } from '../../lib/database.types'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { CLIENT_RECEIPT_KINDS, PAYMENT_METHODS } from '../../lib/labels'
import { parseNPR } from '../../lib/money'
import { useProjects } from '../projects/api'
import { projectChoices, useWorkingOnDefault, useWorkingOnId } from '../projects/current'
import { rpc } from '../../data/rpc'
import { useRefreshClientMoney } from './api'
import { t } from '../../lib/i18n'

type PaymentMethod = Database['public']['Enums']['payment_method']
type Kind = Database['public']['Enums']['client_receipt_kind']
// The receipt id and operation key stay with the device draft until the server confirms, so a
// reload after a lost response retries the same receipt instead of recording it twice.
type Values = {
  id: string; op_key: string; project_id: string; amount: string; receipt_date: string; kind: Kind; method: PaymentMethod
  reference: string; notes: string; photos: PendingPhoto[]
}

export function ClientReceiptNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const workingOn = useWorkingOnId()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshClientMoney()
  // Money: a final payment often comes after completion, so Completed is listed too.
  const choices = projectChoices(projects.data, 'money')
  const form = useForm<Values>({
    defaultValues: {
      id: newId(), op_key: newId(), project_id: params.get('project') ?? workingOn, amount: '',
      receipt_date: todayKathmandu(), kind: 'running_bill', method: 'bank_transfer', reference: '', notes: '', photos: [],
    },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'client-receipt-new' })
  const { watch, setValue } = form
  const v = watch()
  // A refresh straight onto the form: fill the Working on project once the list arrives.
  useWorkingOnDefault(v.project_id, (id) => setValue('project_id', id), params.has('project'))
  const set = <K extends Path<Values>>(k: K) => (value: PathValue<Values, K>) => setValue(k, value, { shouldDirty: true })
  const [problem, setProblem] = useState('')
  const paisa = parseNPR(v.amount) ?? 0
  const project = choices.find((p) => p.id === v.project_id)
  const closed = (projects.data ?? []).find((p) => p.id === v.project_id && p.status === 'closed')

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      await draft.save()
      await rpc('record_client_receipt', {
        p_op_key: vals.op_key,
        p_receipt: { id: vals.id, project_id: vals.project_id, receipt_date: vals.receipt_date, amount_paisa: parseNPR(vals.amount),
          kind: vals.kind, method: vals.method, reference: vals.reference, notes: vals.notes },
      })
      // The receipt is saved; a photo that fails to upload can be added again on its page.
      return uploadPending({ userId: auth.userId, companyId: auth.companyId }, { client_receipt_id: vals.id }, vals.photos)
    },
    onSuccess: async (failedPhotos, vals) => {
      await draft.clear()
      await refresh()
      navigate(`/receipts/${vals.id}`, { replace: true, state: failedPhotos ? { photoFailed: failedPhotos } : undefined })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const why = closed ? t('clientReceiptNew.nameIsClosedReopen', { name: closed.name })
      : !project ? t('clientReceiptNew.chooseTheProject') : paisa <= 0 ? t('clientReceiptNew.enterTheAmountThe') : ''
    setProblem(why)
    if (!why) save.mutate(form.getValues())
  }

  return (
    <>
      <PageHeader
        title={t('clientReceiptNew.clientPaymentReceived')}
        crumbs={project ? [{ to: `/projects/${project.id}?tab=client`, label: project.name }] : [{ to: '/projects', label: t('clientReceiptNew.projects') }]}
        subtitle={t('clientReceiptNew.moneyTheClientPaid')}
      />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('clientReceiptNew.restoredAClientPayment')}</Notice></div>}
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('clientReceiptNew.project')} htmlFor="cr-project">
              <Select id="cr-project" value={v.project_id} onChange={(e) => set('project_id')(e.target.value)}>
                <option value="">{t('common.project.choose')}</option>
                {choices.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label={t('clientReceiptNew.amount')} htmlFor="cr-amount"
              hint={t('clientReceiptNew.whatTheClientPaid')}>
              <MoneyInput id="cr-amount" value={v.amount} onChange={(e) => set('amount')(e.target.value)} />
            </Field>
            <Field label={t('clientReceiptNew.receivedOn')} htmlFor="cr-date">
              <DateInput id="cr-date" value={v.receipt_date} onChange={set('receipt_date')} display={auth.dateDisplay} quick="past" />
            </Field>
            <Field label={t('clientReceiptNew.for')} htmlFor="cr-kind">
              <Select id="cr-kind" value={v.kind} onChange={(e) => set('kind')(e.target.value as Kind)}>
                {Object.entries(CLIENT_RECEIPT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label={t('clientReceiptNew.how')} htmlFor="cr-method">
              <Select id="cr-method" value={v.method} onChange={(e) => set('method')(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label={t('clientReceiptNew.reference')} htmlFor="cr-ref" hint={t('clientReceiptNew.chequeOrTransactionNumber')}>
              <Input id="cr-ref" value={v.reference} onChange={(e) => set('reference')(e.target.value)} />
            </Field>
            <Field label={t('common.note')} htmlFor="cr-notes">
              <Input id="cr-notes" value={v.notes} onChange={(e) => set('notes')(e.target.value)} />
            </Field>
          </div>
          <PhotoPicker value={v.photos} onChange={set('photos')} label={t('clientReceiptNew.addChequeOrVoucher')} what={t('clientReceiptNew.chequePhoto')} />
          <ErrorBanner>{problem || (save.error && friendlyError(save.error))}</ErrorBanner>
          <div className="flex gap-2">
            <Button type="submit" busy={save.isPending}>{t('clientReceiptNew.savePayment')}</Button>
            <Button type="button" variant="secondary" onClick={async () => { await draft.clear(); navigate(-1) }}>{t('common.cancel')}</Button>
          </div>
        </form>
      </Card>
    </>
  )
}
