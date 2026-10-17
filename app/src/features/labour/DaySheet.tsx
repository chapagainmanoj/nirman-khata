// One worker's day, opened with a tap: the quick choices (full day, half day, not here, an extra
// hour), then exact times or hours. Shared by the day roster and the crew's calendar. Each choice
// saves at once; times and hours save when the field is left.
import { useState, type ReactNode } from 'react'
import { Button, Field, Input } from '../../components/ui'
import { clock, fullDayOf, halfDayOf, hhmm, type Mark, minutesBetween, toMin } from './api'

export type { Mark } from './api'

export function DaySheet({ id, label, row, company, busy, onMark, onPicked, footer }: {
  /** Makes the field ids unique on the page. */
  id: string
  /** Who and which day, for screen readers: "Ram, Today". */
  label: string
  row: Mark | undefined
  company: { day_start: string; day_end: string; standard_day_minutes: number }
  busy: boolean
  onMark: (m: Mark | null) => void
  /** After a quick choice, e.g. to close the sheet. */
  onPicked?: () => void
  footer?: ReactNode
}) {
  const std = company.standard_day_minutes
  const [tIn, setIn] = useState(hhmm(row?.time_in))
  const [tOut, setOut] = useState(hhmm(row?.time_out))
  const [hours, setHours] = useState(row ? String(row.minutes / 60) : '')
  const pick = (m: Mark | null) => { onMark(m); onPicked?.() }
  const plusHour = () => {
    const out = toMin(row?.time_out ? hhmm(row.time_out) : hhmm(company.day_end))
    onMark({ time_in: row?.time_in ? hhmm(row.time_in) : hhmm(company.day_start), time_out: clock(Math.min(out + 60, 23 * 60 + 59)), minutes: (row?.minutes ?? std) + 60 })
  }
  const saveTimes = () => {
    if (!tIn || !tOut || (tIn === hhmm(row?.time_in) && tOut === hhmm(row?.time_out))) return
    const m = minutesBetween(tIn, tOut, company)
    if (m > 0) onMark({ time_in: tIn, time_out: tOut, minutes: m })
  }
  const saveHours = () => {
    const m = Math.round(Number(hours) * 60)
    if (m > 0 && m !== row?.minutes) onMark({ time_in: tIn || null, time_out: tOut || null, minutes: m })
  }
  return (
    <div className="flex flex-col gap-3" role="group" aria-label={label}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant={row?.minutes === std ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(fullDayOf(company))}>Full day</Button>
        <Button variant={row?.minutes === std / 2 ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(halfDayOf(company))}>Half day</Button>
        <Button variant={!row ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(null)}>Not here</Button>
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
      {footer}
    </div>
  )
}
