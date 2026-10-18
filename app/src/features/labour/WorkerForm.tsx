// Add or edit a worker: a name and a rate, by the day or by the hour (GLOSSARY: Worker). With a
// crew, a new worker is put on it too; without one, they are added to the company only.
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, ErrorBanner, Field, Input, Select } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { WORK_TYPES } from '../../lib/labels'
import { newId } from '../../lib/ids'
import { paisaToInput, parseNPR } from '../../lib/money'
import { useAddCrewWorker, useSaveWorker } from './api'

type Editable = { id: string; name: string; work_type: string | null; rate_kind: string; rate_paisa: number; phone: string | null; notes?: string | null; active?: boolean }

export function WorkerForm({ crewId, member, onDone, onAdded }: {
  crewId?: string; member?: Editable; onDone: () => void; onAdded?: (id: string) => void
}) {
  const auth = useCompany()
  const update = useSaveWorker()
  const add = useAddCrewWorker()
  const save = member || !crewId ? update : add
  // One id per new worker, kept across retries.
  const [newWorkerId] = useState(newId)
  const [name, setName] = useState(member?.name ?? '')
  const [workType, setWorkType] = useState(member?.work_type ?? 'Jyami')
  const [kind, setKind] = useState<'daily' | 'hourly'>((member?.rate_kind as 'daily' | 'hourly') ?? 'daily')
  const [rate, setRate] = useState(member ? paisaToInput(member.rate_paisa) : '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const [active, setActive] = useState(member?.active ?? true)
  const [problem, setProblem] = useState('')
  const id = member?.id ?? 'new'

  function submit() {
    const paisa = parseNPR(rate)
    const p = !name.trim() ? 'Enter the worker\'s name.' : !paisa || paisa <= 0 ? 'Enter the rate.' : ''
    setProblem(p)
    if (p) return
    const values = { name: name.trim(), work_type: workType || null, rate_kind: kind, rate_paisa: paisa!, phone: phone.trim() || null }
    if (!member && crewId) {
      // Awaited rather than a mutate callback: refreshed lists can unmount this form before it fires.
      add.mutateAsync({ crewId, worker: { ...values, id: newWorkerId } }).then((id) => { onAdded?.(id); onDone() }, () => {})
    } else {
      update.mutate(
        { id: member?.id, companyId: auth.companyId, values: member ? { ...values, notes: notes.trim() || null, active } : values },
        { onSuccess: onDone },
      )
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`mf-name-${id}`}><Input id={`mf-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Field>
        <Field label="Work" htmlFor={`mf-type-${id}`}>
          <Select id={`mf-type-${id}`} value={workType} onChange={(e) => setWorkType(e.target.value)}>
            {[...WORK_TYPES.filter((w) => w !== 'Mixed'), 'Helper'].map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">Paid by the</span>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Paid by the">
          {([['daily', 'Day'], ['hourly', 'Hour']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${kind === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === 'daily' ? 'Rate for a full day' : 'Rate for an hour'} htmlFor={`mf-rate-${id}`}
          hint={member ? 'A new rate applies to days verified from now on.' : undefined}>
          <MoneyInput id={`mf-rate-${id}`} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor={`mf-phone-${id}`} hint="Optional"><Input id={`mf-phone-${id}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      {member && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notes" htmlFor={`mf-notes-${id}`}><Input id={`mf-notes-${id}`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Field label="Status" htmlFor={`mf-active-${id}`}>
            <Select id={`mf-active-${id}`} value={active ? 'yes' : 'no'} onChange={(e) => setActive(e.target.value === 'yes')}>
              <option value="yes">Working</option>
              <option value="no">Left (kept in history)</option>
            </Select>
          </Field>
        </div>
      )}
      <ErrorBanner>{problem || (save.error && friendlyError(save.error))}</ErrorBanner>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={save.isPending}>{member ? 'Save worker' : 'Add worker'}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
