// A worker's time card (req §14, attendance): one worker, the whole month, every project. One line
// per day with in, out, hours and a tick; the tick marks a full day on the worker's usual project
// (their crew's). A tap on the day opens its times, where a day can be split with another project.
// "Close open days" closes each open day for the crew paid on that project (GLOSSARY: Close day).
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon } from '../../components/icons'
import { Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { adToBs, formatDate, todayKathmandu, type IsoDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { monthDays, monthLabel, monthOf, shiftMonth, type MonthRef } from '../../lib/months'
import { useCrews } from '../costs/api'
import { useCurrentProject } from '../projects/current'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canEnter, canRecordPayments } from '../supply/permissions'
import { type CardMember, type CardRow, clock, hhmm, hoursText, minutesBetween, payFor, rateText, toMin, useWorkerMonth } from './api'

type Mark = { time_in: string | null; time_out: string | null; minutes: number }
type Closed = { total_paisa: number; days: number; crews: number; payments: { number: string }[] }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekday = (iso: IsoDate) => new Date(`${iso}T00:00:00Z`).getUTCDay()

export function TimeCardPage() {
  const auth = useCompany()
  const company = auth.company
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const current = useCurrentProject()
  const queryClient = useQueryClient()
  const refreshMoney = useRefreshMoney()
  const today = todayKathmandu()
  const thisMonth = monthOf(today, auth.dateDisplay)
  const month = parseMonth(params.get('month'), thisMonth)
  const days = monthDays(month)
  const to = days.at(-1)! < today ? days.at(-1)! : today
  const card = useWorkerMonth(id, days[0], days.at(-1)!)
  const crews = useCrews(auth.companyId)
  const [open, setOpen] = useState<IsoDate | null>(null)
  const [saving, setSaving] = useState<IsoDate | null>(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const [payNow, setPayNow] = useState(canRecordPayments(auth))
  const [method, setMethod] = useState<keyof typeof PAYMENT_METHODS>('cash')
  const [duplicate, setDuplicate] = useState('')
  const [closed, setClosed] = useState<Closed | null>(null)

  const goMonth = (m: MonthRef) => {
    const next = new URLSearchParams(params)
    if (m.year === thisMonth.year && m.month === thisMonth.month) next.delete('month')
    else next.set('month', `${m.year}-${String(m.month).padStart(2, '0')}`)
    setParams(next, { replace: true })
    setOpen(null); setClosing(false); setDuplicate(''); setClosed(null); setError('')
  }

  const std = company.standard_day_minutes
  const dayStart = hhmm(company.day_start), dayEnd = hhmm(company.day_end)
  const member = card.data?.member
  const rows = card.data?.rows ?? []
  const choices = current.choices
  const usual = member?.crew_project_id ?? params.get('project') ?? current.projectId ?? ''
  const usualOk = !!usual && choices.some((p) => p.id === usual)
  const projectName = (pid: string | null) => {
    const p = pid && choices.find((x) => x.id === pid)
    return p ? `${p.code} · ${p.name}` : pid ? 'Another project' : 'Another project (not yours)'
  }

  /** The crew owed on a project: the one already on that day, the worker's own crew when it may work
   *  there, else the project's default crew (GLOSSARY: Crew Member). */
  const crewFor = (projectId: string, existing?: CardRow) => {
    if (existing?.crew_id) return existing.crew_id
    if (member && (!member.crew_project_id || member.crew_project_id === projectId)) return member.crew_id
    const list = crews.data?.filter((c) => c.active && c.project_id === projectId) ?? []
    return (list.find((c) => c.is_default) ?? list[0])?.id ?? ''
  }

  async function save(date: IsoDate, write: () => Promise<unknown>) {
    setSaving(date)
    setError('')
    try {
      await write()
    } catch (e) {
      setError(`${formatDate(date, auth.dateDisplay)}: ${friendlyError(e)}`)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setSaving(null)
    }
  }
  async function mark(date: IsoDate, projectId: string, m: Mark | null, existing?: CardRow) {
    if (!member) return
    await save(date, () => rpc('set_attendance', { p_row: { project_id: projectId, crew_id: crewFor(projectId, existing), member_id: member.id,
      work_date: date, time_in: m?.time_in ?? null, time_out: m?.time_out ?? null, minutes: m?.minutes ?? 0 } }))
  }
  const fullDay: Mark = { time_in: dayStart, time_out: dayEnd, minutes: std }

  /** Split one project's day in two: the first keeps the first half of its hours, the other project
   *  the rest. The server saves both or neither. */
  async function split(date: IsoDate, first: CardRow, otherProject: string) {
    if (!member) return
    await save(date, () => rpc('split_attendance', { p_split: { member_id: member.id, work_date: date,
      from_project: first.project_id, to_project: otherProject, to_crew: crewFor(otherProject) } }))
  }

  const close = usePosting((key, confirm: boolean) => rpc('close_worker_days', { p_op_key: key, p_close: {
    member_id: id, from_date: days[0], to_date: to, confirm_duplicate: confirm,
    pay_now: payNow && canRecordPayments(auth) ? { method, reference: null } : null } }) as Promise<unknown> as Promise<Closed>, {
    onSuccess: async (r) => {
      setClosed(r)
      setClosing(false)
      setDuplicate('')
      setOpen(null)
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      await refreshMoney()
    },
  })
  const closeDays = (confirm: boolean) => close.mutate(confirm, {
    onError: (e) => {
      const msg = (e as { message?: string }).message ?? ''
      if (msg.startsWith('near_duplicate')) setDuplicate(msg.replace(/^near_duplicate:\s*/, ''))
    },
  })

  if (!company.labour_module_enabled || company.labour_mode !== 'attendance') {
    return (
      <EmptyState title="Attendance is not turned on">
        Your company enters labour as a day total. {auth.isAdmin ? <Link className="text-slate" to="/settings">Change it in Settings</Link> : 'An admin can change it in Settings.'}
      </EmptyState>
    )
  }
  if (!canEnter(auth)) return <EmptyState title="Time card">Viewers cannot open time cards.</EmptyState>
  if (card.isPending || crews.isPending) return <Spinner />
  if (card.error || !member) {
    return <ErrorBanner onRetry={() => void card.refetch()}>{card.error ? friendlyError(card.error) : 'This worker was not found.'}</ErrorBanner>
  }

  const byDay = new Map<IsoDate, CardRow[]>()
  for (const r of rows) byDay.set(r.work_date, [...(byDay.get(r.work_date) ?? []), r])
  const seen = rows.filter((r) => r.project_id)
  const worked = new Set(seen.map((r) => r.work_date)).size
  const minutes = seen.reduce((s, r) => s + r.minutes, 0)
  const pay = seen.reduce((s, r) => s + (r.closed && r.amount_paisa != null ? r.amount_paisa : payFor(member, r.minutes, std)), 0)
  const openDays = new Set(rows.filter((r) => r.editable && !r.closed).map((r) => r.work_date)).size
  const isThisMonth = month.year === thisMonth.year && month.month === thisMonth.month
  const dayProps: DayProps = { member, std, dayStart, dayEnd, today, saving, usual, usualOk, fullDay, choices, projectName, mark, split, company,
    display: auth.dateDisplay, setOpen }

  return (
    <>
      <PageHeader title={member.name} crumbs={[{ to: `/crews/${member.crew_id}`, label: member.crew_name }]}
        subtitle={[member.work_type, rateText(member, formatNPR), usualOk ? `usually ${projectName(usual)}` : null].filter(Boolean).join(' · ')} />
      <div className="flex flex-col gap-4 pb-24">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button variant="secondary" aria-label="Previous month" className="px-3" onClick={() => goMonth(shiftMonth(month, -1))}><ChevronLeftIcon size={20} /></Button>
          <h2 className="text-center text-lg font-semibold text-ink" aria-live="polite">{monthLabel(month)}</h2>
          <Button variant="secondary" aria-label="Next month" className="px-3" disabled={isThisMonth || days[0] > today} onClick={() => goMonth(shiftMonth(month, 1))}><ChevronRightIcon size={20} /></Button>
        </div>

        {!member.active && <Notice>{member.name} is no longer on a crew. Past days show here; new days cannot be marked.</Notice>}
        {closed && (
          <Notice>
            Closed {closed.days} {closed.days === 1 ? 'day' : 'days'}: {formatNPR(closed.total_paisa)} labour cost{closed.crews > 1 ? ` for ${closed.crews} crews` : ' for the crew'}.{' '}
            {closed.payments.length ? `Paid now (${closed.payments.map((p) => p.number).join(', ')}).` : 'Not paid yet; it shows as owed to the crew.'}
          </Notice>
        )}

        <Card title="Days">
          <div className="-mx-1 grid grid-cols-[3.25rem_1fr_1fr_3rem_2.75rem] items-center gap-x-1 border-b border-line px-1 pb-2 text-xs font-medium text-subtle" aria-hidden>
            <span>Day</span><span>In</span><span>Out</span><span className="text-right">Hours</span><span className="sr-only">Here</span>
          </div>
          <ul>
            {days.map((d) => (
              <DayLine key={d} date={d} entries={byDay.get(d) ?? []} isOpen={open === d} {...dayProps} />
            ))}
          </ul>
        </Card>

        <ErrorBanner>{error}</ErrorBanner>

        {closing && openDays > 0 && (
          <Card title="Close open days">
            <p className="text-sm">
              {openDays} open {openDays === 1 ? 'day' : 'days'} in {monthLabel(month)}. Each day closes for the crew paid on that project,
              with everyone marked on it, and becomes its labour cost. After closing, a day changes only by reversing that cost.
            </p>
            {canRecordPayments(auth) && (
              <div className="mt-3">
                <Checkbox label="Paid now" hint="Records the payment too, one for each crew. The cost is counted once." checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                {payNow && (
                  <Field label="How" htmlFor="tc-method">
                    <Select id="tc-method" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof PAYMENT_METHODS)}>
                      {Object.entries(PAYMENT_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            )}
            {duplicate ? (
              <Notice>
                <span className="block">{duplicate.charAt(0).toUpperCase() + duplicate.slice(1)}. Is this a second entry for the same day?</span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <Button busy={close.isPending} onClick={() => closeDays(true)}>Yes, close them too</Button>
                  <Button variant="secondary" onClick={() => setDuplicate('')}>No, check first</Button>
                </span>
              </Notice>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button busy={close.isPending} onClick={() => closeDays(false)}>Close {openDays} {openDays === 1 ? 'day' : 'days'}</Button>
                <Button variant="secondary" onClick={() => setClosing(false)}>Not yet</Button>
              </div>
            )}
            <ErrorBanner>{!duplicate && close.error && friendlyError(close.error)}</ErrorBanner>
          </Card>
        )}
      </div>

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[5] -mx-4 flex items-center justify-between gap-3 border-t border-line bg-page/95 px-4 py-3 backdrop-blur md:bottom-0">
        <span className="text-sm text-subtle tabular-nums">
          <span className="font-semibold text-ink">{worked}</span> {worked === 1 ? 'day' : 'days'} · <span className="font-semibold text-ink">{hoursText(minutes)}</span> · <span className="font-semibold text-ink">{formatNPR(pay)}</span>
        </span>
        <Button disabled={!openDays || closing} onClick={() => setClosing(true)}>{openDays ? 'Close open days' : 'All closed'}</Button>
      </div>
    </>
  )
}

function parseMonth(value: string | null, fallback: MonthRef): MonthRef {
  const m = value && /^(\d{4})-(\d{2})$/.exec(value)
  if (!m) return fallback
  const ref = { display: fallback.display, year: Number(m[1]), month: Number(m[2]) }
  return ref.month >= 1 && ref.month <= 12 ? ref : fallback
}

type DayProps = {
  member: CardMember
  std: number
  dayStart: string
  dayEnd: string
  today: IsoDate
  saving: IsoDate | null
  usual: string
  usualOk: boolean
  fullDay: Mark
  choices: { id: string; code: string; name: string }[]
  projectName: (id: string | null) => string
  mark: (date: IsoDate, projectId: string, m: Mark | null, existing?: CardRow) => Promise<void>
  split: (date: IsoDate, first: CardRow, otherProject: string) => Promise<void>
  company: { day_start: string; day_end: string; standard_day_minutes: number }
  display: 'bs' | 'ad'
  setOpen: (d: IsoDate | null) => void
}

/** One day: the line (day, in, out, hours, tick) and, when open, its times per project. */
function DayLine({ date, entries, isOpen, ...p }: DayProps & { date: IsoDate; entries: CardRow[]; isOpen: boolean }) {
  const future = date > p.today
  const busy = p.saving === date
  const wd = weekday(date)
  const dayNo = p.display === 'bs' ? adToBs(date).day : Number(date.slice(8))
  const label = formatDate(date, p.display)
  const anyClosed = entries.some((e) => e.closed)
  const only = entries.length === 1 ? entries[0] : null
  // The tick: mark a full day on the usual project, or clear a single open day.
  const tickable = !future && p.member.active && (entries.length === 0 ? p.usualOk : !!only && only.editable && !only.closed && !!only.project_id)
  const tick = () => {
    if (entries.length === 0) void p.mark(date, p.usual, p.fullDay)
    else if (only?.project_id) void p.mark(date, only.project_id, null, only)
  }
  const minutes = entries.reduce((s, e) => s + e.minutes, 0)

  return (
    <li className={`border-b border-line last:border-0 ${wd === 6 ? 'bg-muted/60' : ''} ${date === p.today ? 'shadow-[inset_3px_0_0_var(--color-brand)]' : ''}`}>
      <div className="-mx-1 grid grid-cols-[3.25rem_1fr_1fr_3rem_2.75rem] items-center gap-x-1 px-1">
        <button type="button" disabled={future} aria-expanded={isOpen} aria-label={`${label}, ${entries.length ? hoursText(minutes) : 'not here'}${anyClosed ? ', closed' : ''}`}
          onClick={() => p.setOpen(isOpen ? null : date)}
          className="col-span-4 grid min-h-12 grid-cols-[3.25rem_1fr_1fr_3rem] items-center gap-x-1 py-1.5 text-left tabular-nums enabled:hover:bg-muted/70 disabled:opacity-45">
          <span className="leading-tight">
            <span className="block text-base font-semibold text-ink">{dayNo}</span>
            <span className={`block text-xs ${wd === 6 ? 'font-medium text-brand' : 'text-subtle'}`}>{WEEKDAYS[wd]}</span>
          </span>
          {entries.length === 0 ? (
            <span className="col-span-3 text-sm text-subtle">{future ? '' : '—'}</span>
          ) : (
            <span className="col-span-3 flex flex-col gap-1">
              {entries.map((e, i) => (
                <span key={i} className="grid grid-cols-[1fr_1fr_3rem] items-baseline gap-x-1">
                  <span className="text-sm text-ink">{hhmm(e.time_in) || '·'}</span>
                  <span className="text-sm text-ink">{hhmm(e.time_out) || '·'}</span>
                  <span className="text-right text-sm font-semibold text-ink">{(e.minutes / 60).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  {(entries.length > 1 || e.project_id !== p.usual) && (
                    <span className="col-span-3 truncate text-xs text-subtle">{p.projectName(e.project_id)}</span>
                  )}
                </span>
              ))}
            </span>
          )}
        </button>
        <span className="flex justify-end">
          {anyClosed ? (
            <span className="grid size-10 place-items-center text-subtle" title="Closed"><LockIcon size={18} /><span className="sr-only">Closed</span></span>
          ) : (
            <button type="button" role="checkbox" aria-checked={entries.length > 0} aria-label={`Here on ${label}`} disabled={!tickable || busy}
              onClick={tick}
              className={`grid size-10 place-items-center rounded-full border-2 transition-colors disabled:opacity-40 ${entries.length ? 'border-good-ink bg-good-ink text-surface' : 'border-field text-transparent enabled:hover:border-brand'}`}>
              <CheckIcon size={20} strokeWidth={2.5} />
            </button>
          )}
        </span>
      </div>
      {isOpen && !future && <DayEditor key={entries.map((e) => `${e.project_id}:${e.minutes}:${e.time_in}:${e.time_out}:${e.closed}`).join('|')} date={date} entries={entries} label={label} {...p} />}
    </li>
  )
}

/** The open day: each project's in, out and hours, Full day, Split with another project. */
function DayEditor({ date, entries, label, ...p }: DayProps & { date: IsoDate; entries: CardRow[]; label: string }) {
  const busy = p.saving === date
  const [splitting, setSplitting] = useState(false)
  const used = new Set(entries.map((e) => e.project_id))
  const others = p.choices.filter((c) => !used.has(c.id))
  const first = entries.find((e) => e.editable && !e.closed && e.project_id)
  const canSplit = p.member.active && entries.length === 1 && !!first && others.length > 0

  return (
    <div className="flex flex-col gap-3 pb-3 pt-1" role="group" aria-label={label}>
      {entries.length === 0 && (
        p.usualOk && p.member.active ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void p.mark(date, p.usual, p.fullDay)}>Full day</Button>
            <Button variant="secondary" disabled={busy}
              onClick={() => void p.mark(date, p.usual, { time_in: p.dayStart, time_out: clock(toMin(p.dayStart) + p.std / 2), minutes: p.std / 2 })}>Half day</Button>
          </div>
        ) : <p className="text-sm text-subtle">Not marked.</p>
      )}
      {entries.map((e, i) => (
        <Entry key={`${e.project_id ?? 'hidden'}-${i}`} date={date} row={e} {...p} />
      ))}
      {canSplit && (splitting ? (
        <Field label="Other project for the rest of the day" htmlFor={`tc-split-${date}`}
          hint={`${p.projectName(first.project_id)} keeps the first half of the hours; change the times after.`}>
          <Select id={`tc-split-${date}`} value="" disabled={busy}
            onChange={(ev) => { if (ev.target.value) { void p.split(date, first, ev.target.value); setSplitting(false) } }}>
            <option value="">Choose a project</option>
            {others.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </Select>
        </Field>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => setSplitting(true)}>Split with another project</Button>
      ))}
    </div>
  )
}

/** One project's time on the day. Saves when a field is left, like the roster. */
function Entry({ date, row, ...p }: DayProps & { date: IsoDate; row: CardRow }) {
  const busy = p.saving === date
  const [tIn, setIn] = useState(hhmm(row.time_in))
  const [tOut, setOut] = useState(hhmm(row.time_out))
  const [hours, setHours] = useState(String(row.minutes / 60))
  const id = `${date}-${row.project_id ?? 'x'}`
  const heading = <span className="text-sm font-medium text-ink">{p.projectName(row.project_id)}</span>

  if (!row.project_id || !row.editable || row.closed || !p.member.active) {
    return (
      <div className="rounded-lg bg-muted px-3 py-2 text-sm">
        {heading}
        <span className="block text-xs text-subtle tabular-nums">
          {[row.time_in && row.time_out ? `${hhmm(row.time_in)}–${hhmm(row.time_out)}` : null, hoursText(row.minutes),
            row.closed ? 'closed; reverse its labour cost to change it' : !row.editable ? 'marked by that project\'s staff' : null].filter(Boolean).join(' · ')}
        </span>
      </div>
    )
  }
  const pid = row.project_id
  const saveTimes = () => {
    if (!tIn || !tOut || (tIn === hhmm(row.time_in) && tOut === hhmm(row.time_out))) return
    const m = minutesBetween(tIn, tOut, p.company)
    if (m > 0) void p.mark(date, pid, { time_in: tIn, time_out: tOut, minutes: m }, row)
  }
  const saveHours = () => {
    const m = Math.round(Number(hours) * 60)
    if (m > 0 && m !== row.minutes) void p.mark(date, pid, { time_in: tIn || null, time_out: tOut || null, minutes: m }, row)
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        {heading}
        <Button variant="ghost" disabled={busy} onClick={() => void p.mark(date, pid, null, row)}>Not here</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="In" htmlFor={`tc-in-${id}`}>
          <Input id={`tc-in-${id}`} type="time" value={tIn} disabled={busy} onChange={(e) => setIn(e.target.value)} onBlur={saveTimes} />
        </Field>
        <Field label="Out" htmlFor={`tc-out-${id}`}>
          <Input id={`tc-out-${id}`} type="time" value={tOut} disabled={busy} onChange={(e) => setOut(e.target.value)} onBlur={saveTimes} />
        </Field>
        <Field label="Hours worked" htmlFor={`tc-h-${id}`}>
          <Input id={`tc-h-${id}`} inputMode="decimal" value={hours} disabled={busy} onChange={(e) => setHours(e.target.value)} onBlur={saveHours} />
        </Field>
        <p className="self-end pb-3 text-xs text-subtle tabular-nums">{formatNPR(payFor(p.member, row.minutes, p.std))}</p>
      </div>
    </div>
  )
}
