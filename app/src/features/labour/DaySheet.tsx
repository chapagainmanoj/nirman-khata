// One worker's day, opened with a tap on its box: the quick choices (full day, half day, absent, an
// extra hour), then exact times or hours. Each choice saves at once and the sheet stays open for the
// next; times and hours save when the field is left. Absent is kept as its own mark; Clear takes the
// day back to not marked.
import { useState, type ReactNode } from 'react'
import { Button, Field, Input } from '../../components/ui'
import { ABSENT, clock, fullDayOf, halfDayOf, hhmm, type Mark, minutesBetween, toMin } from './api'

export type { Mark } from './api'

export function DaySheet({ id, label, row, company, busy, onMark, half = halfDayOf(company), footer }: {
  /** Makes the field ids unique on the page. */
  id: string
  /** Who and which day, for screen readers: "Ram, Today". */
  label: string
  row: Mark | undefined
  company: { day_start: string; day_end: string; standard_day_minutes: number }
  busy: boolean
  onMark: (m: Mark | null) => void
  /** What Half day marks: the morning, unless it is taken elsewhere. */
  half?: Mark
  footer?: ReactNode
}) {
  const std = company.standard_day_minutes
  const worked = row && !row.absent ? row : undefined
  const [tIn, setIn] = useState(hhmm(worked?.time_in))
  const [tOut, setOut] = useState(hhmm(worked?.time_out))
  const [hours, setHours] = useState(worked ? String(worked.minutes / 60) : '')
  const pick = onMark
  const plusHour = () => {
    const out = toMin(worked?.time_out ? hhmm(worked.time_out) : hhmm(company.day_end))
    onMark({ time_in: worked?.time_in ? hhmm(worked.time_in) : hhmm(company.day_start), time_out: clock(Math.min(out + 60, 23 * 60 + 59)), minutes: (worked?.minutes ?? std) + 60 })
  }
  const saveTimes = () => {
    if (!tIn || !tOut || (tIn === hhmm(worked?.time_in) && tOut === hhmm(worked?.time_out))) return
    const m = minutesBetween(tIn, tOut, company)
    if (m > 0) onMark({ time_in: tIn, time_out: tOut, minutes: m })
  }
  const saveHours = () => {
    const m = Math.round(Number(hours) * 60)
    if (m > 0 && m !== worked?.minutes) onMark({ time_in: tIn || null, time_out: tOut || null, minutes: m })
  }
  return (
    <div className="flex flex-col gap-3" role="group" aria-label={label}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant={worked?.minutes === std ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(fullDayOf(company))}>Full day</Button>
        <Button variant={worked?.minutes === std / 2 ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(half)}>Half day</Button>
        <Button variant={row?.absent ? 'tonal' : 'secondary'} aria-pressed={!!row?.absent} disabled={busy} onClick={() => pick(ABSENT)}>Absent</Button>
        <Button variant="secondary" disabled={busy} onClick={plusHour}>+1 hour</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="In" htmlFor={`ds-in-${id}`}>
          <Input id={`ds-in-${id}`} type="time" value={tIn} disabled={busy} onChange={(e) => setIn(e.target.value)} onBlur={saveTimes} />
        </Field>
        <Field label="Out" htmlFor={`ds-out-${id}`}>
          <Input id={`ds-out-${id}`} type="time" value={tOut} disabled={busy} onChange={(e) => setOut(e.target.value)} onBlur={saveTimes} />
        </Field>
        <Field label="Hours" htmlFor={`ds-h-${id}`}>
          <Input id={`ds-h-${id}`} inputMode="decimal" value={hours} disabled={busy} onChange={(e) => setHours(e.target.value)} onBlur={saveHours} />
        </Field>
      </div>
      {(footer || row) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span className="min-w-0">{footer}</span>
          {row && <Button variant="ghost" disabled={busy} onClick={() => pick(null)}>Clear: not marked</Button>}
        </div>
      )}
    </div>
  )
}
