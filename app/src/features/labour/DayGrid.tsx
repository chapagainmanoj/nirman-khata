// A month of one worker's days as a calendar, Sunday first (Saturday is the day off in Nepal). Each
// box shows the hours and the times on wider screens. An unmarked day is a soft grey box with no edge,
// so the marked ones stand out. A Draft is plain, marked "Draft"; a Verified
// day is green with a tick (GLOSSARY: Attendance). A tap opens the day's editor at the box: a card
// beside it on a tablet or desktop, a sheet from the bottom on a phone, with the editor's own buttons
// at the bottom (Save draft, Verified). Used by the crew page, the one place attendance is marked.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon } from '../../components/icons'
import { adToBs, formatDate, type IsoDate } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { hhmm, hoursText } from './api'

const WEEKDAYS = ['date.weekday.sun', 'date.weekday.mon', 'date.weekday.tue', 'date.weekday.wed', 'date.weekday.thu', 'date.weekday.fri', 'date.weekday.sat'] as const
const weekday = (iso: IsoDate) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** Hours in a box: 8, 4½, 9.25. */
const boxHours = (minutes: number) => {
  const h = minutes / 60
  if (Number.isInteger(h)) return String(h)
  if (Number.isInteger(h * 2)) return `${Math.floor(h) || ''}½`
  return h.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export type GridEntry = { minutes: number; time_in: string | null; time_out: string | null; verified: boolean; absent?: boolean }

export function DayGrid({ name, days, today, display, entries, selected, onPick, title, editor, actions }: {
  /** Whose days, for screen readers. */
  name: string
  days: IsoDate[]
  today: IsoDate
  display: 'bs' | 'ad'
  entries: (d: IsoDate) => GridEntry[]
  selected: IsoDate | null
  onPick: (d: IsoDate | null) => void
  /** The editor's heading for the chosen day. */
  title: string
  editor: ReactNode
  /** The editor's buttons, at the bottom; they close it themselves. */
  actions: ReactNode
}) {
  const wrapper = useRef<HTMLDivElement>(null)
  const boxes = useRef(new Map<IsoDate, HTMLButtonElement>())
  const lead = weekday(days[0])
  return (
    <div ref={wrapper} className="relative">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium text-subtle" aria-hidden>
        {WEEKDAYS.map((d, i) => <span key={d} className={i === 6 ? 'text-brand' : ''}>{t(d)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={t('dayGrid.nameSDays', { name })}>
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} aria-hidden />)}
        {days.map((d) => {
          const all = entries(d)
          const absent = all.length > 0 && all.every((r) => r.absent)
          const rows = all.filter((r) => !r.absent)
          const minutes = rows.reduce((s, r) => s + r.minutes, 0)
          const verified = all.length > 0 && all.every((r) => r.verified)
          const draft = all.length > 0 && !verified
          const one = rows.length === 1 ? rows[0] : null
          const times = one?.time_in && one.time_out ? `${hhmm(one.time_in)}–${hhmm(one.time_out)}` : rows.length > 1 ? t('dayGrid.lengthProjects', { length: rows.length }) : ''
          const future = d > today
          const dayNo = display === 'bs' ? adToBs(d).day : Number(d.slice(8))
          const label = `${formatDate(d, display)}, ${rows.length ? hoursText(minutes) : absent ? t('dayGrid.state.absent') : t('dayGrid.state.notMarked')}${verified ? t('dayGrid.state.verified') : draft ? t('dayGrid.state.draft') : ''}`
          return (
            <button key={d} type="button" disabled={future} aria-label={label} aria-expanded={selected === d} aria-haspopup="dialog"
              ref={(el) => { if (el) boxes.current.set(d, el); else boxes.current.delete(d) }}
              aria-current={d === today ? 'date' : undefined} onClick={() => onPick(selected === d ? null : d)}
              className={`relative flex min-h-14 flex-col items-center justify-center rounded-lg border px-0.5 pt-3 pb-1 text-center tabular-nums transition-colors disabled:opacity-40 sm:min-h-18
                ${selected === d ? 'border-brand ring-2 ring-brand' : verified ? 'border-good-ink/40' : draft ? 'border-slate/60' : absent ? 'border-line' : 'border-transparent'}
                ${verified && rows.length ? 'bg-good-soft' : all.length ? 'bg-surface' : 'bg-muted'} ${absent || draft ? 'border-dashed' : ''}
                enabled:hover:border-slate`}>
              <span className={`absolute top-1 left-1.5 text-[11px] leading-none ${d === today ? 'rounded bg-brand px-1 py-0.5 font-bold text-white' : 'text-subtle'}`}>{dayNo}</span>
              {rows.length > 0 && (
                <>
                  <span className={`text-base leading-tight font-semibold sm:text-lg ${verified ? 'text-good-ink' : 'text-ink'}`}>
                    {boxHours(minutes)}<span className="text-xs font-medium"> h</span>
                  </span>
                  {times && <span className="hidden truncate text-[10px] leading-tight text-subtle sm:block">{times}</span>}
                  {draft && <span className="text-[10px] leading-tight font-medium text-subtle uppercase">{t('day.draft')}</span>}
                </>
              )}
              {absent && <span className="text-xs font-medium text-subtle"><span aria-hidden>✕</span> {t('dayGrid.absent')}</span>}
              {verified && <span className="absolute top-1 right-1.5 text-good-ink"><CheckIcon size={12} /></span>}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-subtle">
        {t('dayGrid.tapADayTo')}{' '}<CheckIcon size={11} className="inline text-good-ink" /> {t('dayGrid.verifiedIsLabourCost')}</p>
      {selected && (
        <DayPopover key={selected} anchor={() => boxes.current.get(selected)} wrapper={wrapper} title={title} onClose={() => onPick(null)} actions={actions}>
          {editor}
        </DayPopover>
      )}
    </div>
  )
}

const WIDE = '(min-width: 640px)'
const isWide = () => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches

/** The day's editor: a card under the box on wider screens, a bottom sheet on a phone. */
function DayPopover({ anchor, wrapper, title, onClose, actions, children }: {
  anchor: () => HTMLElement | undefined
  wrapper: React.RefObject<HTMLDivElement | null>
  title: string
  onClose: () => void
  actions: ReactNode
  children: ReactNode
}) {
  const [wide] = useState(isWide)
  const card = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDialogElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!wide) { sheet.current?.showModal(); return }
    const place = () => {
      const box = anchor(), w = wrapper.current, c = card.current
      if (!box || !w || !c) return
      const b = box.getBoundingClientRect(), r = w.getBoundingClientRect()
      const left = Math.min(Math.max(b.left - r.left + b.width / 2 - c.offsetWidth / 2, 0), Math.max(r.width - c.offsetWidth, 0))
      setPos({ top: b.bottom - r.top + 6, left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [wide, anchor, wrapper])

  // Into the editor once it opens, so the keyboard goes from the day to its choices.
  useEffect(() => { if (wide) card.current?.querySelector<HTMLElement>('[data-day-body] button:not(:disabled)')?.focus() }, [wide])

  // Wide: Escape or a tap outside closes it (a tap on another day is handled by that day's box).
  useEffect(() => {
    if (!wide) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); anchor()?.focus() } }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (card.current?.contains(t) || wrapper.current?.querySelector('[role=group]')?.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [wide, onClose, anchor, wrapper])

  const head = <h3 className="mb-3 text-base font-semibold text-ink">{title}</h3>
  // At the bottom, under the last change: the sheet stays open for several, so these close it.
  const done = <div className="mt-4">{actions}</div>
  if (!wide) {
    return (
      <dialog ref={sheet} aria-label={title} onClose={onClose}
        onClick={(e) => { if (e.target === sheet.current) sheet.current.close() }}
        className="mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink backdrop:bg-ink/40">
        {head}
        <div data-day-body>{children}</div>
        {done}
      </dialog>
    )
  }
  return (
    <div ref={card} role="dialog" aria-label={title}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, opacity: 0 }}
      className="absolute z-30 w-[28rem] max-w-full rounded-xl border border-line bg-surface p-4 shadow-lg">
      {head}
      <div data-day-body>{children}</div>
      {done}
    </div>
  )
}
