// A month of days in BS or AD (req §17, v1.1 §3.3). Weeks start on Sunday, as on a Nepali
// patro. Days are AD "YYYY-MM-DD" strings either way; the grid only changes how they are laid out.
// Keyboard: one day is in the tab order; arrows move by day and week, Home/End to the week's ends,
// Page Up/Down by month, crossing into the next or previous month as needed.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { addDays, adToBs, todayKathmandu, type DateDisplay, type IsoDate } from '../lib/dates'
import { monthDays, monthInRange, monthLabel, monthOf, shiftMonth, type MonthRef } from '../lib/months'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (iso: IsoDate) => new Date(`${iso}T00:00:00Z`).getUTCDay()
const dayNumber = (iso: IsoDate, display: DateDisplay) => (display === 'bs' ? adToBs(iso).day : Number(iso.slice(8, 10)))

export function MonthGrid({ month, onMonth, selected, onSelect, renderDay, dayLabel, max }: {
  month: MonthRef
  onMonth: (m: MonthRef) => void
  selected: IsoDate | null
  onSelect: (iso: IsoDate) => void
  /** Extra content under the day number (dots, totals). */
  renderDay?: (iso: IsoDate) => ReactNode
  /** Accessible name for a day button, e.g. "12 Baisakh, 3 events". */
  dayLabel?: (iso: IsoDate) => string
  /** Days after this cannot be chosen. */
  max?: IsoDate
}) {
  const days = monthDays(month)
  const lead = weekday(days[0])
  const today = todayKathmandu()
  const other: DateDisplay = month.display === 'bs' ? 'ad' : 'bs'
  const open = (iso: IsoDate) => !max || iso <= max

  // The day keyboard focus sits on; it follows arrow keys across months.
  const [focusDay, setFocusDay] = useState<IsoDate | null>(null)
  const moved = useRef(false)
  const grid = useRef<HTMLDivElement>(null)
  const tabDay = [focusDay, selected, today].find((d) => d && days.includes(d) && open(d))
    ?? days.findLast(open)
  useEffect(() => {
    if (!moved.current || !focusDay) return
    const day = grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${focusDay}"]`)
    if (day) { day.focus(); moved.current = false }
  }, [focusDay, month])

  function onKey(e: KeyboardEvent, iso: IsoDate) {
    const by: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      Home: -weekday(iso), End: 6 - weekday(iso) }
    let target: IsoDate | undefined
    if (e.key in by) target = addDays(iso, by[e.key])
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const next = monthDays(shiftMonth(month, e.key === 'PageUp' ? -1 : 1))
      target = next[Math.min(days.indexOf(iso), next.length - 1)]
    }
    if (!target) return
    e.preventDefault()
    if (max && target > max) target = max // stop on the last day that can be chosen
    const into = monthOf(target, month.display)
    if (target === iso || !monthInRange(into)) return
    if (!days.includes(target)) onMonth(into)
    moved.current = true
    setFocusDay(target)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}
          disabled={!monthInRange(shiftMonth(month, -1))}
          className="inline-flex size-11 items-center justify-center rounded-lg text-subtle hover:bg-muted hover:text-ink disabled:opacity-30"><ChevronLeftIcon size={20} /></button>
        <div className="text-center">
          <div className="font-semibold text-ink" aria-live="polite">{monthLabel(month)}</div>
          <div className="text-xs text-subtle">{monthLabel(monthOf(days[0], other))} – {monthLabel(monthOf(days[days.length - 1], other))}</div>
        </div>
        <button type="button" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}
          disabled={!monthInRange(shiftMonth(month, 1))}
          className="inline-flex size-11 items-center justify-center rounded-lg text-subtle hover:bg-muted hover:text-ink disabled:opacity-30"><ChevronRightIcon size={20} /></button>
      </div>
      <div ref={grid} role="group" aria-label={monthLabel(month)} className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
        <div aria-hidden className="contents">
          {WEEKDAYS.map((w) => (
            <div key={w} className={`bg-muted py-1 text-center text-xs font-medium ${w === 'Sat' ? 'text-danger' : 'text-subtle'}`}>{w}</div>
          ))}
        </div>
        <div className="contents">
          {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} className="bg-surface" />)}
          {days.map((iso) => {
            const isSelected = iso === selected
            const disabled = !open(iso)
            return (
              <div key={iso} className="bg-surface">
                <button type="button" disabled={disabled} onClick={() => onSelect(iso)} data-day={iso}
                  tabIndex={iso === tabDay ? 0 : -1} onKeyDown={(e) => onKey(e, iso)} onFocus={() => setFocusDay(iso)} aria-label={dayLabel?.(iso)} aria-pressed={isSelected}
                  aria-current={iso === today ? 'date' : undefined}
                  className={`flex min-h-14 w-full flex-col items-center gap-1 px-0.5 py-1 text-sm disabled:opacity-40 ${isSelected ? 'bg-brand text-white' : 'hover:bg-muted'}`}>
                  <span className={`flex size-6 items-center justify-center rounded-full tabular-nums ${iso === today && !isSelected ? 'ring-2 ring-brand' : ''} ${weekday(iso) === 6 && !isSelected ? 'text-danger' : ''}`}>
                    {dayNumber(iso, month.display)}
                  </span>
                  <span className={`text-xs leading-none ${isSelected ? 'text-brand-soft' : 'text-subtle'}`}>{dayNumber(iso, other)}</span>
                  {renderDay?.(iso)}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
