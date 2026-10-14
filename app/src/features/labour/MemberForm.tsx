// Add or edit a crew member: a name and a rate, by the day or by the hour. Members are only for
// attendance; the crew is still the one paid (GLOSSARY: Crew Member).
import { useState } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, ErrorBanner, Field, Input, Select } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { WORK_TYPES } from '../../lib/labels'
import { paisaToInput, parseNPR } from '../../lib/money'
import { useSaveMember } from './api'

type Member = { id: string; name: string; work_type: string | null; rate_kind: string; rate_paisa: number; phone: string | null }

export function MemberForm({ crewId, member, onDone }: { crewId: string; member?: Member; onDone: () => void }) {
  const auth = useCompany()
  const save = useSaveMember()
  const [name, setName] = useState(member?.name ?? '')
  const [workType, setWorkType] = useState(member?.work_type ?? 'Jyami')
  const [kind, setKind] = useState<'daily' | 'hourly'>((member?.rate_kind as 'daily' | 'hourly') ?? 'daily')
  const [rate, setRate] = useState(member ? paisaToInput(member.rate_paisa) : '')
  const [phone, setPhone] = useState(member?.phone ?? '')
  const [problem, setProblem] = useState('')
  const id = member?.id ?? 'new'

  function submit() {
    const paisa = parseNPR(rate)
    const p = !name.trim() ? 'Enter the worker\'s name.' : !paisa || paisa <= 0 ? 'Enter the rate.' : ''
    setProblem(p)
    if (p) return
    save.mutate(
      { id: member?.id, companyId: auth.companyId, values: { crew_id: crewId, name: name.trim(), work_type: workType || null, rate_kind: kind, rate_paisa: paisa!, phone: phone.trim() || null } },
      { onSuccess: onDone },
    )
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
        <Field label={kind === 'daily' ? 'Rate for a full day' : 'Rate for an hour'} htmlFor={`mf-rate-${id}`}>
          <MoneyInput id={`mf-rate-${id}`} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor={`mf-phone-${id}`} hint="Optional"><Input id={`mf-phone-${id}`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
      <ErrorBanner>{problem || (save.error && friendlyError(save.error))}</ErrorBanner>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={save.isPending}>{member ? 'Save worker' : 'Add worker'}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
