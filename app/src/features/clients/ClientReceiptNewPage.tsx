// Record money the client paid on a project. One amount: what the client settled, including any
// TDS or retention they kept back, so "To collect" stays right without accounting knowledge.
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select } from '../../components/ui'
import type { Database } from '../../lib/database.types'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { CLIENT_RECEIPT_KINDS, PAYMENT_METHODS } from '../../lib/labels'
import { parseNPR } from '../../lib/money'
import { useProjects } from '../projects/api'
import { useCurrentProject } from '../projects/current'
import { rpc, usePosting } from '../supply/api'
import { useRefreshClientMoney } from './api'

type PaymentMethod = Database['public']['Enums']['payment_method']
type Kind = Database['public']['Enums']['client_receipt_kind']

export function ClientReceiptNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const current = useCurrentProject()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshClientMoney()
  // A final payment often comes after completion, so only cancelled projects are left out.
  const choices = (projects.data ?? []).filter((p) => p.status !== 'cancelled')
  const [projectId, setProjectId] = useState(params.get('project') ?? current.projectId ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKathmandu())
  const [kind, setKind] = useState<Kind>('running_bill')
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [id] = useState(newId)
  const [problem, setProblem] = useState('')
  const paisa = parseNPR(amount) ?? 0
  const project = choices.find((p) => p.id === projectId)

  const save = usePosting(
    async (key) => {
      await rpc('record_client_receipt', {
        p_op_key: key,
        p_receipt: { id, project_id: projectId, receipt_date: date, amount_paisa: paisa, kind, method, reference, notes },
      })
      // The receipt is saved; a photo that fails to upload can be added again on its page.
      return uploadPending(auth.companyId, { client_receipt_id: id }, photos)
    },
    {
      onSuccess: async (failedPhotos) => {
        await refresh()
        navigate(`/receipts/${id}`, { replace: true, state: failedPhotos ? { photoFailed: failedPhotos } : undefined })
      },
    },
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    const why = !projectId ? 'Choose the project.' : paisa <= 0 ? 'Enter the amount the client paid.' : ''
    setProblem(why)
    if (!why) save.mutate()
  }

  return (
    <>
      <PageHeader
        title="Client payment received"
        crumbs={project ? [{ to: `/projects/${project.id}?tab=client`, label: project.name }] : [{ to: '/projects', label: 'Projects' }]}
        subtitle="Money the client paid you for the work. It is not part of your costs."
      />
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" htmlFor="cr-project">
              <Select id="cr-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose project</option>
                {choices.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" htmlFor="cr-amount"
              hint="What the client paid for this bill or stage, including anything they kept back as TDS or retention.">
              <MoneyInput id="cr-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Received on" htmlFor="cr-date">
              <DateInput id="cr-date" value={date} onChange={setDate} display={auth.dateDisplay} quick="past" />
            </Field>
            <Field label="For" htmlFor="cr-kind">
              <Select id="cr-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {Object.entries(CLIENT_RECEIPT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label="How" htmlFor="cr-method">
              <Select id="cr-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Reference" htmlFor="cr-ref" hint="Cheque or transaction number">
              <Input id="cr-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Note" htmlFor="cr-notes">
              <Input id="cr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <PhotoPicker value={photos} onChange={setPhotos} label="Add cheque or voucher photo" what="Cheque photo" />
          <ErrorBanner>{problem || (save.error && friendlyError(save.error))}</ErrorBanner>
          <div className="flex gap-2">
            <Button type="submit" busy={save.isPending}>Save payment</Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          </div>
        </form>
      </Card>
    </>
  )
}
