// Record money the client paid on a project. One amount: what the client settled, including any
// TDS or retention they kept back, so "To collect" stays right without accounting knowledge.
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
import { useCurrentProject } from '../projects/current'
import { rpc } from '../supply/api'
import { useRefreshClientMoney } from './api'

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
  const current = useCurrentProject()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshClientMoney()
  // A final payment often comes after completion, so only cancelled and closed projects are left out.
  const choices = (projects.data ?? []).filter((p) => p.status !== 'cancelled' && p.status !== 'closed')
  const form = useForm<Values>({
    defaultValues: {
      id: newId(), op_key: newId(), project_id: params.get('project') ?? current.projectId ?? '', amount: '',
      receipt_date: todayKathmandu(), kind: 'running_bill', method: 'bank_transfer', reference: '', notes: '', photos: [],
    },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'client-receipt-new' })
  const { watch, setValue } = form
  const v = watch()
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
    const why = closed ? `${closed.name} is closed. Reopen it before recording money on it.`
      : !project ? 'Choose the project.' : paisa <= 0 ? 'Enter the amount the client paid.' : ''
    setProblem(why)
    if (!why) save.mutate(form.getValues())
  }

  return (
    <>
      <PageHeader
        title="Client payment received"
        crumbs={project ? [{ to: `/projects/${project.id}?tab=client`, label: project.name }] : [{ to: '/projects', label: 'Projects' }]}
        subtitle="Money the client paid you for the work. It is not part of your costs."
      />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored a client payment you had not saved. Check it was not already recorded.</Notice></div>}
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" htmlFor="cr-project">
              <Select id="cr-project" value={v.project_id} onChange={(e) => set('project_id')(e.target.value)}>
                <option value="">Choose project</option>
                {choices.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" htmlFor="cr-amount"
              hint="What the client paid for this bill or stage, including anything they kept back as TDS or retention.">
              <MoneyInput id="cr-amount" value={v.amount} onChange={(e) => set('amount')(e.target.value)} />
            </Field>
            <Field label="Received on" htmlFor="cr-date">
              <DateInput id="cr-date" value={v.receipt_date} onChange={set('receipt_date')} display={auth.dateDisplay} quick="past" />
            </Field>
            <Field label="For" htmlFor="cr-kind">
              <Select id="cr-kind" value={v.kind} onChange={(e) => set('kind')(e.target.value as Kind)}>
                {Object.entries(CLIENT_RECEIPT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label="How" htmlFor="cr-method">
              <Select id="cr-method" value={v.method} onChange={(e) => set('method')(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Reference" htmlFor="cr-ref" hint="Cheque or transaction number">
              <Input id="cr-ref" value={v.reference} onChange={(e) => set('reference')(e.target.value)} />
            </Field>
            <Field label="Note" htmlFor="cr-notes">
              <Input id="cr-notes" value={v.notes} onChange={(e) => set('notes')(e.target.value)} />
            </Field>
          </div>
          <PhotoPicker value={v.photos} onChange={set('photos')} label="Add cheque or voucher photo" what="Cheque photo" />
          <ErrorBanner>{problem || (save.error && friendlyError(save.error))}</ErrorBanner>
          <div className="flex gap-2">
            <Button type="submit" busy={save.isPending}>Save payment</Button>
            <Button type="button" variant="secondary" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  )
}
