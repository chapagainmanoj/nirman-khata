// The crew page when the company works by attendance (GLOSSARY: Crew, Worker, Attendance): the one
// place attendance is marked.
//  * "The crew on a day" (today by default): each worker's mark for that day with one-tap Full,
//    Half and Absent, and "Mark everyone in" for those not marked yet (one call for the whole crew).
//  * The crew's workers on the left; the chosen worker's month as a calendar on the right with the
//    hours in each day's box. A tap on a box opens the day's editor right there (DayGrid); it stays
//    open for several changes until Done or a tap outside. The worker's time on other projects that
//    day shows under it ("Also that day"): a day on two projects is marked on each project's crew,
//    by times that do not overlap. Marks show at once and are saved behind; a mark the server
//    refuses reopens its day with the reason.
//  * A marked day is a Draft: no cost, no money anywhere. Verified (in the day's editor, or "Verify
//    the crew's day") makes it labour cost, owed to the worker. A verified day can still be changed:
//    the cost adjusts at the same rate, paid or not (change_attendance). Site staff work up to 7 days
//    back (mark_from).
//  * Under the calendar: the worker's month (worked, earned, paid) and what is owed to them on this
//    project, with Pay.
// All that is the Attendance tab. The second tab ("Crew in <month>", ?tab=crew) is the crew's month:
// each worker's hours, earned and owed now.
// Each worker is paid on their own, always on their payment form (Pay links there): it lists their
// open days, takes off any advance they hold and adds the ticked days to labour cost as it pays.
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { DateInput } from '../../components/DateInput'
import { Button, ButtonLink, Card, ConfirmButton, EmptyState, ErrorBanner, Notice, Spinner } from '../../components/ui'
import { formatDate, relativeDay, todayKathmandu, type IsoDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { monthDays, monthLabel, monthOf, monthParam, parseMonth, shiftMonth, type MonthRef } from '../../lib/months'
import { newId } from '../../lib/ids'
import { rpc, useRefreshMoney } from '../supply/api'
import { canRecordPayments } from '../supply/permissions'
import { Tabs } from '../parties/PartyParts'
import { useCurrentProject } from '../projects/current'
import {
  ABSENT, clock, type CrewMonth, type CrewWorker, fullDayOf, halfDayOf, hhmm, toMin, hoursText, markRow, type MonthRow, rateText,
  useAddCrewWorker, useCrewMonth, useProjectWorkers, useSetCrewMember, useWorkerMonth,
} from './api'
import { DayGrid } from './DayGrid'
import { DaySheet, type Mark } from './DaySheet'
import { WorkerForm } from './WorkerForm'

const money = (p: number | null | undefined) => (p == null ? 'Not available' : formatNPR(p))
type Company = { day_start: string; day_end: string; standard_day_minutes: number }
/** What is owed to a worker on this project now: their verified days not paid. Drafts carry no money. */
const owedNow = (w: CrewWorker) => w.balance_paisa
const worked = (rows: MonthRow[]) => rows.filter((r) => !r.absent)
/** Owed, or held by the worker (paid ahead, peski) when below zero: never a minus sign. */
const owedText = (p: number) => (p < 0 ? `${formatNPR(-p)} ahead` : formatNPR(p))

export function CrewBoard({ crewId, projectId }: { crewId: string; projectId: string | null }) {
  const auth = useCompany()
  const company = auth.company
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const refreshMoney = useRefreshMoney()
  const today = todayKathmandu()
  const thisMonth = monthOf(today, auth.dateDisplay)
  const month = parseMonth(params.get('month'), thisMonth)
  const days = monthDays(month)
  const monthKey = ['attendance', 'crew', crewId, days[0], days.at(-1)!]
  const data = useCrewMonth(crewId, days[0], days.at(-1)!)
  const [day, setDay] = useState<IsoDate | null>(null)
  const [dayError, setDayError] = useState<{ worker: string; date: IsoDate; message: string } | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const pays = canRecordPayments(auth)
  const membership = useSetCrewMember()
  const [rollDay, setRollDay] = useState<IsoDate>(() => params.get('date') ?? today)

  const go = (change: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
    setDay(null); setDayError(null); setError('')
  }
  const goMonth = (m: MonthRef) => go({ month: m.year === thisMonth.year && m.month === thisMonth.month ? '' : monthParam(m) })
  /** ◀ ▶: back on this month, the crew's day is today again. */
  const stepMonth = (m: MonthRef) => {
    if (m.year === thisMonth.year && m.month === thisMonth.month) setRollDay(today)
    goMonth(m)
  }

  const workers = data.data?.workers ?? []
  const chosen = workers.find((w) => w.id === params.get('worker')) ?? workers.find((w) => w.on_crew) ?? workers[0]
  const isThisMonth = month.year === thisMonth.year && month.month === thisMonth.month
  /** Show marks on this page at once; the server's answer replaces them when it comes. */
  function showMarks(marks: { w: CrewWorker; date: IsoDate; m: Mark | null }[]) {
    queryClient.setQueryData<CrewMonth>(monthKey, (old) => old && {
      ...old,
      workers: old.workers.map((x) => {
        const mine = marks.filter((k) => k.w.id === x.id)
        if (!mine.length) return x
        let rows = x.rows
        for (const { date, m } of mine) {
          const was = rows.find((r) => r.work_date === date && r.project_id === projectId)
          rows = rows.filter((r) => r !== was)
          // A change to a verified day stays verified (its cost adjusts); otherwise a draft, with no money.
          if (m) rows = [...rows, { work_date: date, project_id: projectId!, time_in: m.time_in, time_out: m.time_out, minutes: m.minutes,
            absent: !!m.absent, closed: !!was?.verified && !m.absent, verified: !!was?.verified,
            amount_paisa: was?.verified && old.can_see_money && !m.absent && was.amount_paisa != null && was.minutes
              ? Math.round((was.amount_paisa * m.minutes) / was.minutes) : null }]
        }
        rows = rows.sort((a, b) => a.work_date.localeCompare(b.work_date))
        return { ...x, rows, minutes: rows.reduce((s, r) => s + r.minutes, 0) }
      }),
    })
  }
  const row = (w: CrewWorker, date: IsoDate, m: Mark | null) => ({ project_id: projectId, crew_id: crewId, worker_id: w.id, work_date: date, ...markRow(m) })
  const reason = (e: unknown) => {
    const overlap = ((e as { message?: string }).message ?? '').startsWith('attendance_overlap')
    return `${friendlyError(e)}${overlap ? ' Change the day on their other project first.' : ''}`
  }

  // Marks still on their way: Verified waits for them, so it verifies what was marked.
  const inflight = useRef<Promise<unknown>>(Promise.resolve())
  const verifiedRow = (w: CrewWorker, date: IsoDate) => w.rows.find((r) => r.work_date === date && r.project_id === projectId)?.verified

  async function mark(w: CrewWorker, date: IsoDate, m: Mark | null) {
    if (!projectId) return
    setDayError(null)
    await queryClient.cancelQueries({ queryKey: monthKey })
    // A verified day changes with its labour cost (each change its own op key); a draft just saves.
    const send = verifiedRow(w, date)
      ? rpc('change_attendance', { p_op_key: newId(), p_row: row(w, date, m) })
      : rpc('set_attendance', { p_row: row(w, date, m) })
    showMarks([{ w, date, m }])
    inflight.current = send.catch(() => undefined)
    try {
      await send
      if (verifiedRow(w, date)) await refreshMoney()
    } catch (e) {
      // Back to the day that was not saved, with the reason in its editor.
      setDayError({ worker: w.id, date, message: reason(e) })
      if (chosen?.id === w.id) setDay(date)
      else setError(`${w.name}, ${formatDate(date, auth.dateDisplay)}: ${reason(e)}`)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
    }
  }

  /** Mark everyone in: a full day for each worker on the crew not marked that day, in one call.
   *  Absent workers are marked, so they are left alone. Refused rows are named. */
  async function everyoneIn(todo: CrewWorker[]) {
    if (!projectId || !todo.length) return
    setError('')
    await queryClient.cancelQueries({ queryKey: monthKey })
    showMarks(todo.map((w) => ({ w, date: rollDay, m: fullDayOf(company) })))
    try {
      const r = (await rpc('set_attendance_many', { p_rows: todo.map((w) => row(w, rollDay, fullDayOf(company))) })) as
        { saved: number; failed: { worker_id: string; message: string }[] }
      if (r.failed.length) {
        setError(r.failed.map((f) => `${todo.find((w) => w.id === f.worker_id)?.name ?? 'A worker'}: ${friendlyError({ message: f.message })}`).join(' '))
      }
    } catch (e) {
      setError(`Mark everyone in was not saved: ${friendlyError(e)}`)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
    }
  }

  /** Verified: the day's drafts (one worker's, or the whole crew's) become labour cost. A retry of
   *  the same tap keeps its op key until it succeeds. */
  const verifyKey = useRef(newId())
  async function verify(date: IsoDate, w?: CrewWorker) {
    if (!projectId) return false
    setVerifying(true); setError(''); setDayError(null)
    try {
      await inflight.current
      await rpc('verify_attendance', { p_op_key: verifyKey.current, p_verify: {
        project_id: projectId, crew_id: crewId, work_date: date, worker_id: w?.id ?? null, confirm_duplicate: true } })
      verifyKey.current = newId()
      return true
    } catch (e) {
      if (w && chosen?.id === w.id) setDayError({ worker: w.id, date, message: friendlyError(e) })
      else setError(`Verify was not saved: ${friendlyError(e)}`)
      return false
    } finally {
      setVerifying(false)
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      await refreshMoney()
    }
  }

  if (data.isPending) return <Spinner />
  if (data.error) return <ErrorBanner onRetry={() => void data.refetch()}>{friendlyError(data.error)}</ErrorBanner>
  const showMoney = data.data.can_see_money
  const crew = workers.filter((w) => w.on_crew && w.active)
  const rollInMonth = rollDay >= days[0] && rollDay <= days.at(-1)!
  const markFrom = data.data.mark_from
  const canMark = (d: IsoDate) => !markFrom || d >= markFrom
  const dayRow = day && chosen ? chosen.rows.find((r) => r.work_date === day && r.project_id === projectId) : undefined

  const tab = params.get('tab') === 'crew' ? 'crew' : 'attendance'
  const monthBar = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
      <Button variant="secondary" aria-label="Previous month" className="px-3" onClick={() => stepMonth(shiftMonth(month, -1))}><ChevronLeftIcon size={20} /></Button>
      <h2 className="text-center text-base font-semibold text-ink" aria-live="polite">{monthLabel(month)}</h2>
      <Button variant="secondary" aria-label="Next month" className="px-3" disabled={isThisMonth || days[0] > today} onClick={() => stepMonth(shiftMonth(month, 1))}><ChevronRightIcon size={20} /></Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {!projectId && <Notice>This crew is not tied to a project, so its days cannot be marked here. Mark them on a project's crew.</Notice>}

      <ErrorBanner>{error || (membership.error && friendlyError(membership.error))}</ErrorBanner>
      {/* Two tabs: marking days, and the crew's month with what each is owed (and adding days to cost). */}
      <Tabs tabs={[['attendance', 'Attendance'], ['crew', `Crew in ${monthLabel(month)}`]]} value={tab} label="Crew sections"
        onChange={(next) => go({ tab: next === 'crew' ? 'crew' : '' })}>
        {tab === 'attendance' && (
        <div className="flex flex-col gap-4">
          {projectId && crew.length > 0 && rollInMonth && (
            <CrewDay key={rollDay} crew={crew} date={rollDay} today={today} display={auth.dateDisplay} company={company} projectId={projectId}
              onDate={(d) => {
                setRollDay(d)
                // A day in another month: show that month, so its boxes can be checked after.
                if (d < days[0] || d > days.at(-1)!) goMonth(monthOf(d, auth.dateDisplay))
              }}
              onMark={(w, m) => void mark(w, rollDay, m)} onEveryone={(todo) => void everyoneIn(todo)}
              canMark={canMark(rollDay)} verifying={verifying} onVerify={() => void verify(rollDay)} />
          )}
          {projectId && crew.length > 0 && !rollInMonth && (
            <p className="text-sm text-subtle">
              <button type="button" className="min-h-11 font-medium text-slate underline" onClick={() => stepMonth(thisMonth)}>Back to today</button> to mark the whole crew.
            </p>
          )}
          {/* Workers: chips on a phone, a column on a desktop. On a desktop the worker, the month bar and the
              day names sit above the calendar only; the list starts level with the first row of boxes,
              with its "Workers" label level with the day names. The chosen worker's sheet (name, month,
              calendar) is one bordered block, in two grid rows for that alignment; the money is under it. */}
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-x-6 lg:gap-y-0">
            <nav aria-label="Workers" className="lg:sticky lg:top-4 lg:col-start-1 lg:row-start-2">
              {/* As tall as the day names beside it, so the first worker is level with the first row of days. */}
              <p aria-hidden className="hidden px-3 pb-1 text-xs leading-4 font-medium tracking-wide text-subtle uppercase lg:block">Workers</p>
              <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
                {workers.map((w) => {
                  const on = w.id === chosen?.id
                  const hours = worked(w.rows).reduce((s, r) => s + r.minutes, 0)
                  return (
                    <li key={w.id} className="shrink-0">
                      <button type="button" aria-current={on ? 'true' : undefined} onClick={() => go({ worker: w.id })}
                        className={`flex min-h-11 w-full items-center gap-2 rounded-full border px-3 text-left text-sm lg:rounded-lg lg:border-0 lg:py-1.5
                          ${on ? 'border-brand bg-brand-soft font-semibold text-brand-dark' : 'border-line bg-surface font-medium text-ink hover:bg-muted lg:bg-transparent'}`}>
                        <span className="min-w-0 flex-1 truncate">{w.name}</span>
                        <span className={`shrink-0 text-xs tabular-nums ${on ? 'text-brand-dark' : 'text-subtle'}`}>{hours ? hoursText(hours) : '—'}</span>
                      </button>
                    </li>
                  )
                })}
                {projectId && (
                  <li className="shrink-0 lg:mt-2">
                    <Button variant="ghost" className="w-full justify-start" onClick={() => setAdding(true)} disabled={adding}>Add worker</Button>
                  </li>
                )}
              </ul>
            </nav>

            <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
              {adding && projectId && <AddWorker crewId={crewId} projectId={projectId} onto={workers} onDone={(id) => { setAdding(false); if (id) go({ worker: id }) }} />}
              {!chosen ? (
                !adding && <EmptyState title="No workers on this crew yet">Add each worker with their daily or hourly rate, then mark their days here.</EmptyState>
              ) : (
                <div className="flex flex-col gap-4 rounded-t-xl border border-b-0 border-line px-3 pt-3 pb-4 sm:px-4 sm:pt-4">
                  <WorkerHeader w={chosen} crewId={crewId} membership={membership} month={params.get('month')} />
                  {/* The worker above, their month below: a line edge to edge. */}
                  <hr className="-mx-3 border-line sm:-mx-4" />
                  {monthBar}
                </div>
              )}
            </div>
            {chosen && (
              <div className="-mt-4 flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2 lg:mt-0">
                <div className="rounded-b-xl border border-t-0 border-line px-3 pb-3 sm:px-4 sm:pb-4">
                  <DayGrid name={chosen.name} days={days} today={today} display={auth.dateDisplay} selected={day}
                    onPick={(d) => { setDay(d); if (!d) setDayError(null) }}
                    entries={(d) => chosen.rows.filter((r) => r.work_date === d)}
                    title={day ? `${dayTitle(day, today, auth.dateDisplay)} · ${chosen.name}` : ''}
                    editor={day && (
                      <DayPanel key={`${chosen.id}:${day}`} w={chosen} date={day} today={today} display={auth.dateDisplay} company={company} busy={verifying}
                        editable={!!projectId && chosen.active && canMark(day)} onMark={(m) => void mark(chosen, day, m)} projectId={projectId}
                        error={dayError?.worker === chosen.id && dayError.date === day ? dayError.message : undefined} />
                    )}
                    actions={day && (dayRow && !dayRow.verified && canMark(day) ? (
                      // A draft: keep it as it is, or verify it (labour cost, owed to the worker).
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" disabled={verifying} onClick={() => setDay(null)}>Save draft</Button>
                        <Button busy={verifying} onClick={() => void verify(day, chosen).then((ok) => { if (ok) setDay(null) })}>Verified</Button>
                      </div>
                    ) : <Button className="w-full" onClick={() => setDay(null)}>Done</Button>)} />
                </div>
                <WorkerSummary w={chosen} month={month} showMoney={showMoney} canPay={pays && !!projectId} projectId={projectId} />
              </div>
            )}
          </div>
        </div>
        )}

        {tab === 'crew' && (
        <div className="flex flex-col gap-4">
          {monthBar}
          {workers.length === 0 && <EmptyState title="No workers on this crew yet">Add workers on the Attendance tab.</EmptyState>}
          {workers.length > 0 && (
            <Card title="Hours and what each is owed">
              <CrewTotals workers={workers} showMoney={showMoney} onPick={(id) => go({ worker: id, tab: '' })} />
              {workers.some((w) => w.draft_days > 0) && (
                <p className="mt-3 text-xs text-subtle">Draft days are not counted until they are verified on the Attendance tab.</p>
              )}
            </Card>
          )}
        </div>
        )}
      </Tabs>
    </div>
  )
}

/**
 * The whole crew on one day (today by default): each worker's mark with one tap for Full, Half or
 * Absent, "Mark everyone in" for those not marked, and "Verify the crew's day" for the drafts. Folds
 * to one line once everyone is marked, so the calendar comes up on a phone.
 */
function CrewDay({ crew, date, today, display, company, projectId, onDate, onMark, onEveryone, canMark, verifying, onVerify }: {
  crew: CrewWorker[]; date: IsoDate; today: IsoDate; display: 'bs' | 'ad'; company: Company; projectId: string
  onDate: (d: IsoDate) => void; onMark: (w: CrewWorker, m: Mark | null) => void; onEveryone: (todo: CrewWorker[]) => void
  /** False for a day too far back for this user (site staff: 7 days). */
  canMark: boolean; verifying: boolean; onVerify: () => void
}) {
  const [otherDay, setOtherDay] = useState(false)
  const std = company.standard_day_minutes
  const markOf = (w: CrewWorker) => w.rows.find((r) => r.work_date === date && r.project_id === projectId)
  const todo = crew.filter((w) => !markOf(w))
  const absent = crew.filter((w) => markOf(w)?.absent).length
  const drafts = crew.filter((w) => { const r = markOf(w); return r && !r.verified }).length
  // Open while there is marking to do; it stays open as the last ones are marked, for a change after.
  const [shown, setOpen] = useState(() => todo.length > 0)
  const yesterday = relativeDay(date, today) === 'yesterday'
  const label = date === today ? 'Today' : yesterday ? 'Yesterday' : formatDate(date, display)
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink hover:bg-muted'}`
  const prev = new Date(`${today}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1)
  const yesterdayIso = prev.toISOString().slice(0, 10) as IsoDate

  return (
    <section aria-label={`The crew on ${label}`} className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">The crew on</span>
        <button type="button" className={chip(date === today)} aria-pressed={date === today} onClick={() => { setOtherDay(false); onDate(today) }}>Today</button>
        <button type="button" className={chip(yesterday)} aria-pressed={yesterday} onClick={() => { setOtherDay(false); onDate(yesterdayIso) }}>Yesterday</button>
        {date !== today && !yesterday
          ? <button type="button" className={chip(true)} onClick={() => setOtherDay((x) => !x)}>{label}</button>
          : <button type="button" className="min-h-9 px-1 text-sm font-medium text-slate underline" onClick={() => setOtherDay((x) => !x)}>Other day</button>}
        <span className="ml-auto flex flex-wrap gap-2">
          {canMark && todo.length > 0 && <Button onClick={() => onEveryone(todo)}>Mark everyone in · {hhmm(company.day_start)}–{hhmm(company.day_end)}</Button>}
          {canMark && drafts > 0 && (
            <Button variant={todo.length ? 'secondary' : 'primary'} busy={verifying} onClick={onVerify}>Verify the crew's day ({drafts})</Button>
          )}
        </span>
      </div>
      {otherDay && (
        <div className="mt-2 max-w-xs">
          <DateInput id="cb-day" value={date} display={display} onChange={(d) => { if (d) { onDate(d); setOtherDay(false) } }} />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-subtle" aria-live="polite">
          {crew.length - todo.length - absent} in{absent ? ` · ${absent} absent` : ''}{todo.length ? ` · ${todo.length} not marked` : ' · everyone marked'}
          {drafts > 0 ? ` · ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}` : todo.length < crew.length ? ' · verified' : ''}
        </p>
        <button type="button" className="min-h-9 text-sm font-medium text-slate underline" aria-expanded={shown} onClick={() => setOpen((x) => !x)}>
          {shown ? 'Hide the crew' : 'Show the crew'}
        </button>
      </div>
      {shown && (
        <ul className="mt-1">
          {crew.map((w) => {
            const r = markOf(w)
            const status = !r ? 'Not marked' : `${r.absent ? 'Absent' : hoursText(r.minutes)}${r.verified ? ', verified' : ', draft'}`
            const pick = (m: Mark, on: boolean) => (
              <button type="button" aria-pressed={on} disabled={!canMark}
                onClick={() => onMark(w, m)}
                className={`min-h-11 min-w-14 rounded-lg border px-2 text-sm font-medium disabled:opacity-40 ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink hover:bg-muted'}`}>
                {m.absent ? 'Absent' : m.minutes === std ? 'Full' : 'Half'}
              </button>
            )
            return (
              <li key={w.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0" aria-label={`${w.name}: ${status}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{w.name}</span>
                  <span className={`flex items-center gap-1 text-xs ${!r ? 'text-warn-ink' : 'text-subtle'}`}>
                    {!r ? 'Not marked' : r.absent ? 'Absent' : hoursText(r.minutes)}
                    {r && (r.verified ? <CheckIcon size={12} className="text-good-ink" aria-label="verified" /> : <span className="uppercase">· Draft</span>)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1" role="group" aria-label={`${w.name} on ${label}`}>
                  {pick(fullDayOf(company), !!r && !r.absent && r.minutes === std)}
                  {pick(halfDayOf(company), !!r && !r.absent && r.minutes === std / 2)}
                  {pick(ABSENT, !!r?.absent)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function WorkerHeader({ w, crewId, membership, month }: { w: CrewWorker; crewId: string; membership: ReturnType<typeof useSetCrewMember>; month: string | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-ink">{w.name}</h3>
        <p className="text-sm text-subtle">
          {[w.work_type, rateText(w, formatNPR), !w.active ? 'left' : !w.on_crew ? 'not on this crew' : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="flex flex-wrap items-center gap-x-1 text-sm">
        <Link className="inline-flex min-h-11 items-center px-2 font-medium text-slate underline underline-offset-2" to={`/workers/${w.id}${month ? `?month=${month}` : ''}`}>Khata</Link>
        {w.on_crew ? (
          <ConfirmButton quiet confirmLabel={`Remove ${w.name.split(' ')[0]}`} disabled={membership.isPending}
            onConfirm={() => membership.mutate({ crewId, workerId: w.id, active: false })}>Remove from crew</ConfirmButton>
        ) : (
          <Button variant="ghost" disabled={membership.isPending} onClick={() => membership.mutate({ crewId, workerId: w.id, active: true })}>Put on crew</Button>
        )}
      </span>
    </div>
  )
}

const dayTitle = (date: IsoDate, today: IsoDate, display: 'bs' | 'ad') =>
  date === today ? 'Today' : relativeDay(date, today) === 'yesterday' ? 'Yesterday' : formatDate(date, display)

/** The chosen day, in the editor at its box: the quick choices and times, and the worker's time on
 *  other projects that day; or why it cannot change. */
function DayPanel({ w, date, today, display, company, busy, editable, onMark, projectId, error }: {
  w: CrewWorker; date: IsoDate; today: IsoDate; display: 'bs' | 'ad'; company: { day_start: string; day_end: string; standard_day_minutes: number }
  busy: boolean; editable: boolean; onMark: (m: Mark | null) => void; projectId: string | null
  /** Why the last change to this day was not saved: shown here, where the change was made. */
  error?: string
}) {
  const current = useCurrentProject()
  // The worker's whole day, on every project: to show the time taken elsewhere.
  const all = useWorkerMonth(w.id, date, date)
  const row = w.rows.find((r) => r.work_date === date && (!projectId || r.project_id === projectId))
  const elsewhere = (all.data?.rows ?? []).filter((r) => r.project_id !== projectId)
  const projectName = (pid: string | null) => {
    const p = pid && current.choices.find((x) => x.id === pid)
    return p ? `${p.code} · ${p.name}` : 'Another project'
  }
  const other = elsewhere.length > 0 && (
    <ul className="flex flex-col gap-1">
      {elsewhere.map((r, i) => (
        <li key={i} className="rounded-lg bg-muted px-3 py-2 text-xs text-subtle tabular-nums">
          <span className="font-medium text-ink">{projectName(r.project_id)}</span>{' · '}
          {[r.time_in && r.time_out ? `${hhmm(r.time_in)}–${hhmm(r.time_out)}` : null, hoursText(r.minutes)].filter(Boolean).join(' · ')}
        </li>
      ))}
    </ul>
  )

  if (!editable) {
    return (
      <p className="text-sm text-subtle">
        {row ? (row.absent ? 'Absent.' : hoursText(row.minutes)) : 'Not marked.'}{row && (row.verified ? ' Verified.' : ' Draft.')}{' '}
        {!w.active ? `${w.name} has left, so new days cannot be marked.` : 'Days more than 7 days back are changed by Accounts or Admin.'}
      </p>
    )
  }
  // Half a day when the morning is taken on another project: the afternoon.
  const half = halfDayOf(company)
  const start = toMin(hhmm(company.day_start))
  const morningTaken = elsewhere.some((r) => !r.absent && r.time_in && r.time_out && toMin(hhmm(r.time_in)) < start + half.minutes && toMin(hhmm(r.time_out)) > start)
  const afternoon: Mark = { ...half, time_in: clock(toMin(hhmm(company.day_end)) - half.minutes), time_out: hhmm(company.day_end) }
  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="rounded-lg border border-bad/40 bg-bad-soft px-3 py-2 text-sm text-bad-ink">{error}</p>}
      <DaySheet key={`${row?.minutes ?? 0}:${row?.time_in ?? ''}:${row?.time_out ?? ''}:${row?.absent ?? ''}`} id={`${w.id}-${date}`} label={`${w.name}, ${dayTitle(date, today, display)}`}
        row={row} company={company} busy={busy} onMark={onMark} half={morningTaken ? afternoon : undefined}
        footer={row?.verified
          ? <p className="text-xs text-subtle">Verified{!row.absent && row.amount_paisa != null && `: ${formatNPR(row.amount_paisa)}`}. A change adjusts what is owed.</p>
          : row && <p className="text-xs text-subtle">Draft: not counted until verified.</p>} />
      {other && (
        <div>
          <p className="mb-1 text-xs font-medium text-subtle">Also that day</p>
          {other}
          <p className="mt-1 text-xs text-subtle">Times here must not overlap these.</p>
        </div>
      )}
    </div>
  )
}

/** One worker: their month (worked, earned, paid), then what is owed to them on this project now,
 *  with Pay. */
function WorkerSummary({ w, month, showMoney, canPay, projectId }: {
  w: CrewWorker; month: MonthRef; showMoney: boolean; canPay: boolean; projectId: string | null
}) {
  const rows = worked(w.rows)
  const daysWorked = new Set(rows.map((r) => r.work_date)).size
  const absentDays = w.rows.filter((r) => r.absent).length
  const earned = showMoney ? rows.reduce((s, r) => s + (r.amount_paisa ?? 0), 0) : null
  const due = showMoney ? owedNow(w) : null
  const line = (label: string, value: string, strong?: boolean) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className={`text-sm tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value}</dd>
    </div>
  )
  return (
    // All paying happens on the worker's payment form (pay_worker): it ticks this project's days and
    // takes off any advance they hold (on any project).
    <Card title={`Summary for ${w.name}`} actions={canPay && projectId && due != null && due > 0 && (
      <ButtonLink to={`/payments/new?worker=${w.id}&project=${projectId}`}>Pay {w.name.split(' ')[0]}</ButtonLink>
    )}>
      <h4 className="mt-1 text-xs font-medium tracking-wide text-subtle uppercase">In {monthLabel(month)}</h4>
      <dl>
        {line('Days worked', String(daysWorked))}
        {absentDays > 0 && line('Absent', String(absentDays))}
        {line('Hours', hoursText(rows.reduce((s, r) => s + r.minutes, 0)))}
        {showMoney && line('Earned', money(earned))}
        {showMoney && line('Paid', money(w.paid_paisa))}
      </dl>
      {showMoney ? (
        <>
          <h4 className="mt-3 text-xs font-medium tracking-wide text-subtle uppercase">On this project, all months</h4>
          <dl>{due != null && due < 0 ? line('Paid ahead', formatNPR(-due), true) : line('Owed now', money(due), true)}</dl>
          {due != null && due < 0 && <p className="mt-1 text-xs text-subtle">Comes off {w.name.split(' ')[0]}'s next days when they are verified.</p>}
        </>
      ) : <p className="mt-2 text-xs text-subtle">Amounts are shown to those who see this project's money.</p>}
      {w.draft_days > 0 && (
        <p className="mt-2 text-xs text-subtle">{w.draft_days} {w.draft_days === 1 ? 'day is a draft' : 'days are drafts'}: not counted until verified.</p>
      )}
    </Card>
  )
}

function CrewTotals({ workers, showMoney, onPick }: { workers: CrewWorker[]; showMoney: boolean; onPick: (id: string) => void }) {
  const hours = (w: CrewWorker) => worked(w.rows).reduce((s, r) => s + r.minutes, 0)
  const earned = (w: CrewWorker) => worked(w.rows).reduce((s, r) => s + (r.amount_paisa ?? 0), 0)
  const due = (w: CrewWorker) => owedNow(w) ?? 0
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-subtle">
          <th scope="col" className="py-2 pr-2 font-medium">Worker</th>
          <th scope="col" className="py-2 pr-2 text-right font-medium">Hours</th>
          {showMoney && <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">Earned</th>}
          {showMoney && <th scope="col" className="py-2 text-right font-medium">Owed now <span className="font-normal">(all months)</span></th>}
        </tr>
      </thead>
      <tbody>
        {workers.map((w) => (
          <tr key={w.id} className="border-b border-line last:border-0">
            <td className="py-1.5 pr-2">
              <button type="button" className="min-h-9 text-left font-medium text-ink hover:underline" onClick={() => onPick(w.id)}>{w.name}</button>
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{hoursText(hours(w))}</td>
            {showMoney && <td className="hidden py-1.5 pr-2 text-right tabular-nums sm:table-cell">{formatNPR(earned(w))}</td>}
            {showMoney && <td className="py-1.5 text-right font-medium tabular-nums">{owedText(due(w))}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line font-semibold text-ink">
          <td className="py-2 pr-2">Total</td>
          <td className="py-2 pr-2 text-right tabular-nums">{hoursText(workers.reduce((s, w) => s + hours(w), 0))}</td>
          {showMoney && <td className="hidden py-2 pr-2 text-right tabular-nums sm:table-cell">{formatNPR(workers.reduce((s, w) => s + earned(w), 0))}</td>}
          {showMoney && <td className="py-2 text-right tabular-nums">{owedText(workers.reduce((s, w) => s + due(w), 0))}</td>}
        </tr>
      </tfoot>
    </table>
  )
}

/** Put a worker on the crew: one the company already has, or a new one with their rate. */
function AddWorker({ crewId, projectId, onto, onDone }: { crewId: string; projectId: string; onto: CrewWorker[]; onDone: (id?: string) => void }) {
  const known = useProjectWorkers(projectId)
  const add = useAddCrewWorker()
  const [creating, setCreating] = useState(false)
  const onCrew = new Set(onto.filter((w) => w.on_crew).map((w) => w.id))
  const others = (known.data ?? []).filter((w) => !onCrew.has(w.id))
  return (
    <Card title="Add worker" actions={<Button variant="ghost" onClick={() => onDone()}>Cancel</Button>}>
      {/* Only before a tap: adding the last one refetches the list empty before the card closes. */}
      {creating || (!known.isPending && add.isIdle && others.length === 0) ? (
        <WorkerForm crewId={crewId} onDone={() => onDone()} onAdded={(id) => onDone(id)} />
      ) : (
        <>
          {known.isPending && <Spinner />}
          <ErrorBanner onRetry={() => void known.refetch()}>{known.error && friendlyError(known.error)}</ErrorBanner>
          <ul>
            {others.map((w) => (
              <li key={w.id} className="border-b border-line last:border-0">
                <button type="button" disabled={add.isPending}
                  onClick={() => add.mutate({ crewId, worker: { worker_id: w.id } }, { onSuccess: () => onDone(w.id) })}
                  className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{w.name}</span>
                    <span className="block text-xs text-subtle">{[w.crew_name ?? 'No crew yet', rateText(w, formatNPR)].join(' · ')}</span>
                  </span>
                  <span className="text-sm font-medium text-brand">Add</span>
                </button>
              </li>
            ))}
          </ul>
          <ErrorBanner>{add.error && friendlyError(add.error)}</ErrorBanner>
          <Button variant="secondary" className="mt-3" onClick={() => setCreating(true)}>New worker</Button>
        </>
      )}
    </Card>
  )
}
