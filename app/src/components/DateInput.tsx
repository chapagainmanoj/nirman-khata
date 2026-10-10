// Date picker with a BS/AD switch (req v1.1 §3.3). Either way the value is an
// AD "YYYY-MM-DD" string, so the form never deals with BS.
import { useState } from 'react'
import { addDays, adToBs, bsMonthDays, bsToAd, BS_MONTHS, formatDate, formatDual, todayKathmandu, type DateDisplay } from '../lib/dates'
import { Input, Select } from './ui'

type Props = {
  value: string | null | undefined
  onChange: (iso: string) => void
  display: DateDisplay
  id?: string
  allowEmpty?: boolean
  /** One-tap dates: 'past' = Today, Yesterday (the default for required dates); 'future' = Tomorrow, In 3 days. */
  quick?: 'past' | 'future' | 'none'
}

const QUICK: Record<'past' | 'future', Array<[string, number]>> = {
  past: [['Today', 0], ['Yesterday', -1]],
  future: [['Tomorrow', 1], ['In 3 days', 3]],
}

const BS_YEARS = Array.from({ length: 21 }, (_, i) => 2075 + i)

export function DateInput({ value, onChange, display, id, allowEmpty, quick = allowEmpty ? 'none' : 'past' }: Props) {
  const [mode, setMode] = useState<DateDisplay>(display)
  const iso = value || ''

  return (
    <div>
      {/* Selects keep at least 13.5rem (room for "Mangsir"); below that the toggle wraps. */}
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-[13.5rem] flex-1">
          {mode === 'ad' ? (
            <Input id={id} type="date" value={iso} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <BsSelects id={id} iso={iso} onChange={onChange} allowEmpty={allowEmpty} />
          )}
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === 'bs' ? 'ad' : 'bs')}
          className="min-h-11 min-w-11 shrink-0 rounded-lg border border-field px-2.5 text-xs font-semibold text-brand active:bg-muted"
          // Name starts with the visible text so "tap BS" works for voice control users.
          aria-label={mode === 'bs' ? 'BS, switch to AD calendar' : 'AD, switch to BS calendar'}
        >
          {mode === 'bs' ? 'BS' : 'AD'}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {iso && <span className="text-subtle">{formatDual(iso, mode)}</span>}
        {quick !== 'none' && QUICK[quick].map(([label, days]) => {
          const target = addDays(todayKathmandu(), days)
          return (
            <button key={label} type="button" aria-pressed={iso === target} onClick={() => onChange(target)}
              className={`min-h-10 rounded-full border px-3 font-medium ${iso === target ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink hover:bg-muted'}`}>
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BsSelects({ iso, onChange, id, allowEmpty }: { iso: string; onChange: (iso: string) => void; id?: string; allowEmpty?: boolean }) {
  const bs = iso ? adToBs(iso) : null

  function update(part: 'year' | 'month' | 'day', n: number) {
    const base = bs ?? adToBs(todayKathmandu())
    const next = { ...base, [part]: n }
    next.day = Math.min(next.day, bsMonthDays(next.year, next.month))
    onChange(bsToAd(next))
  }

  const days = bs ? bsMonthDays(bs.year, bs.month) : 32
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[3.5rem_1fr_4.5rem] gap-1">
      <Select compact id={id} aria-label="Day" value={bs?.day ?? ''} onChange={(e) => update('day', Number(e.target.value))}>
        {!bs && <option value="">Day</option>}
        {Array.from({ length: days }, (_, i) => (
          <option key={i + 1} value={i + 1}>{i + 1}</option>
        ))}
      </Select>
      <Select compact aria-label="Month" value={bs?.month ?? ''} onChange={(e) => update('month', Number(e.target.value))}>
        {!bs && <option value="">Month</option>}
        {BS_MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </Select>
      <Select
        compact
        aria-label="Year"
        value={bs?.year ?? ''}
        onChange={(e) => (e.target.value ? update('year', Number(e.target.value)) : allowEmpty && onChange(''))}
      >
        {(!bs || allowEmpty) && <option value="">Year</option>}
        {BS_YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>
    </div>
  )
}

/** Read-only date: one calendar in lists, both on detail screens. */
export function DateText({ value, display, dual }: { value: string | null | undefined; display: DateDisplay; dual?: boolean }) {
  if (!value) return <span className="text-subtle">—</span>
  return <span>{dual ? formatDual(value, display) : formatDate(value, display)}</span>
}
