// Date field (req v1.1 §3.3): one field showing the date in both calendars that opens a month
// calendar, with a BS/AD switch and month and year jumps inside it. The value is an AD
// "YYYY-MM-DD" string either way, so the form never deals with BS.
import { useEffect, useId, useRef, useState } from 'react'
import {
  addDays, BS_LAST_YEAR, BS_MONTHS, BS_RANGE, formatAd, formatBs, formatDate, formatDual, inBsRange, todayKathmandu,
  type DateDisplay,
} from '../lib/dates'
import { t, type MessageKey } from '../lib/i18n'
import { AD_MONTHS, monthInRange, monthOf, type MonthRef } from '../lib/months'
import { CalendarIcon } from './icons'
import { MonthGrid } from './MonthGrid'
import { FieldButton, Select } from './ui'

type Props = {
  value: string | null | undefined
  onChange: (iso: string) => void
  display: DateDisplay
  id?: string
  allowEmpty?: boolean
  /** One-tap dates: 'past' = Today, Yesterday (the default for required dates); 'future' = Tomorrow, In 3 days. */
  quick?: 'past' | 'future' | 'none'
  /** Past-only dates (the default with quick 'past') cannot pick a future day; set for e.g. an effective date. */
  allowFuture?: boolean
}

const QUICK: Record<'past' | 'future', Array<[MessageKey, number]>> = {
  past: [['common.today', 0], ['common.yesterday', -1]],
  future: [['date.tomorrow', 1], ['date.in3Days', 3]],
}

// From 2075 BS (opening balances, older bills) to the last year the BS library knows.
const BS_YEARS = Array.from({ length: BS_LAST_YEAR - 2075 + 1 }, (_, i) => 2075 + i)
const AD_YEARS = Array.from({ length: Number(BS_RANGE.last.slice(0, 4)) - 2018 + 1 }, (_, i) => 2018 + i)

export function DateInput({ value, onChange, display, id, allowEmpty, quick = allowEmpty ? 'none' : 'past', allowFuture }: Props) {
  const iso = value || ''
  const today = todayKathmandu()
  const max = quick === 'past' && !allowFuture ? today : undefined
  const [picking, setPicking] = useState(false)
  const [month, setMonth] = useState<MonthRef>(() => monthOf(today, display))
  const wrapper = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLButtonElement>(null)
  const textId = useId()
  // A date the BS calendar cannot show stays in AD rather than failing.
  const shown: DateDisplay = iso && !inBsRange(iso) ? 'ad' : display
  const [main, other] = iso ? splitDual(iso, shown) : ['', '']

  function open() {
    setMonth(monthOf(iso && inBsRange(iso) ? iso : today, month.display))
    setPicking(true)
  }
  function close() {
    setPicking(false)
    field.current?.focus()
  }
  function choose(d: string) {
    onChange(d)
    close()
  }

  // The calendar closes on Escape (focus back to the field) or a tap outside it.
  useEffect(() => {
    if (!picking) return
    // Focus the chosen day (or today) in the grid, not the pressed BS/AD switch above it.
    const days = popup.current?.querySelector('[data-days]')
    ;(days?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? days?.querySelector<HTMLButtonElement>('button[aria-current="date"]'))?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPicking(false)
      field.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setPicking(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [picking])

  const monthNames = month.display === 'bs' ? BS_MONTHS : AD_MONTHS
  const years = month.display === 'bs' ? BS_YEARS : AD_YEARS
  const jump = (m: MonthRef) => monthInRange(m) && setMonth(m)

  return (
    <div ref={wrapper} className="relative max-w-md">
      <FieldButton ref={field} id={id} data-has-value={iso ? 'true' : 'false'} aria-haspopup="dialog" aria-expanded={picking} aria-describedby={textId}
        onClick={() => (picking ? setPicking(false) : open())}>
        <span id={textId} className="flex min-w-0 flex-1 items-baseline gap-2">
          {iso ? (
            <>
              <span className="shrink-0 text-ink">{main}</span>
              {other && <span className="truncate text-sm text-subtle">{other}</span>}
            </>
          ) : (
            <span className="text-subtle">{t('date.choose')}</span>
          )}
        </span>
        <CalendarIcon className="shrink-0 text-slate" />
      </FieldButton>

      {picking && (
        <div ref={popup} role="dialog" aria-label={t('date.choose')}
          className="absolute top-full left-0 z-30 mt-1 w-full max-w-[calc(100vw-2rem)] rounded-xl sm:w-[22rem] border border-line bg-surface p-2 shadow-lg">
          <div className="mb-2 grid grid-cols-[auto_1fr_5.5rem] items-center gap-1">
            <div role="group" aria-label={t('date.calendar')} className="flex shrink-0 rounded-lg border border-field p-0.5 text-xs font-semibold">
              {(['bs', 'ad'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={month.display === d}
                  onClick={() => setMonth(monthOf(iso && inBsRange(iso) ? iso : today, d))}
                  className={`min-h-11 min-w-11 [@media(pointer:fine)]:min-h-9 rounded-md px-2.5 ${month.display === d ? 'bg-brand text-white' : 'text-slate hover:bg-muted'}`}>
                  {d.toUpperCase()}
                </button>
              ))}
            </div>
            <Select compact aria-label={t('date.month')} className="[@media(pointer:fine)]:min-h-10" value={month.month}
              onChange={(e) => jump({ ...month, month: Number(e.target.value) })}>
              {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select compact aria-label={t('date.year')} className="[@media(pointer:fine)]:min-h-10" value={month.year}
              onChange={(e) => jump({ ...month, year: Number(e.target.value) })}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div data-days>
            <MonthGrid month={month} onMonth={setMonth} selected={iso || null} max={max}
              dayLabel={(d) => formatDual(d, month.display)} onSelect={choose} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            {allowEmpty && iso
              ? <button type="button" onClick={() => choose('')} className="min-h-11 [@media(pointer:fine)]:min-h-10 rounded-lg px-3 font-medium text-subtle hover:bg-muted">{t('date.clear')}</button>
              : <span />}
            <button type="button" onClick={() => choose(today)} className="min-h-11 [@media(pointer:fine)]:min-h-10 rounded-lg px-3 font-medium text-brand hover:bg-muted">{t('common.today')}</button>
          </div>
        </div>
      )}

      {quick !== 'none' && (
        <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
          {QUICK[quick].map(([label, days]) => {
            const target = addDays(today, days)
            return (
              <button key={label} type="button" aria-pressed={iso === target} onClick={() => onChange(target)}
                className={`min-h-11 [@media(pointer:fine)]:min-h-9 rounded-full border px-3 font-medium ${iso === target ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink hover:bg-muted'}`}>
                {t(label)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The date in the company's calendar first, the other one after it. */
function splitDual(iso: string, display: DateDisplay): [string, string] {
  if (!inBsRange(iso)) return [formatAd(iso), '']
  const bs = formatBs(iso, 'long')
  const ad = formatAd(iso)
  return display === 'bs' ? [bs, ad] : [ad, bs]
}

/** Read-only date: one calendar in lists, both on detail screens. */
export function DateText({ value, display, dual }: { value: string | null | undefined; display: DateDisplay; dual?: boolean }) {
  if (!value) return <span className="text-subtle">—</span>
  return <span>{dual ? formatDual(value, display) : formatDate(value, display)}</span>
}
