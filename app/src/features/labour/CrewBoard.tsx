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
import { t } from '../../lib/i18n'
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

const money = (p: number | null | undefined) => (p == null ? t('common.notAvailable') : formatNPR(p))
type Company = { day_start: string; day_end: string; standard_day_minutes: number }
/** What is owed to a worker on this project now: their verified days not paid. Drafts carry no money. */
const owedNow = (w: CrewWorker) => w.balance_paisa
const worked = (rows: MonthRow[]) => rows.filter((r) => !r.absent)
/** Owed, or held by the worker (paid ahead, peski) when below zero: never a minus sign. */
const owedText = (p: number) => (p < 0 ? t('crew.ahead', { amount: formatNPR(-p) }) : formatNPR(p))

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
    return `${friendlyError(e)}${overlap ? t('crew.err.overlap') : ''}`
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
        setError(r.failed.map((f) => `${todo.find((w) => w.id === f.worker_id)?.name ?? t('crew.err.worker')}: ${friendlyError({ message: f.message })}`).join(' '))
      }
    } catch (e) {
      setError(t('crew.err.everyone', { reason: friendlyError(e) }))
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
      else setError(t('crew.err.verify', { reason: friendlyError(e) }))
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
  // The month heads its own tab (h2), or sits under the chosen worker's name (h3). The arrows sit
  // beside the month, so they read as one control.
  const arrow = 'inline-flex size-11 items-center justify-center rounded-lg text-subtle hover:bg-muted hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent'
  const monthBar = (Heading: 'h2' | 'h3') => (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={t('crew.month.prev')} className={arrow} onClick={() => stepMonth(shiftMonth(month, -1))}><ChevronLeftIcon size={20} /></button>
      <Heading className="min-w-28 text-center text-base font-semibold text-ink" aria-live="polite">{monthLabel(month)}</Heading>
      <button type="button" aria-label={t('crew.month.next')} className={arrow} disabled={isThisMonth || days[0] > today} onClick={() => stepMonth(shiftMonth(month, 1))}><ChevronRightIcon size={20} /></button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {!projectId && <Notice>{t('crew.noProject')}</Notice>}

      <ErrorBanner>{error || (membership.error && friendlyError(membership.error))}</ErrorBanner>
      {/* Two tabs: marking days, and the crew's month with what each is owed (and adding days to cost). */}
      <Tabs tabs={[['attendance', t('crew.tab.attendance')], ['crew', t('crew.tab.month', { month: monthLabel(month) })]]} value={tab} label={t('crew.tabs')}
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
              <button type="button" className="min-h-11 font-medium text-slate underline" onClick={() => stepMonth(thisMonth)}>{t('crew.backToToday')}</button>{t('crew.backToToday.after')}
            </p>
          )}
          {/* One card: choosing a worker and marking their days are one tool. The workers are a column on
              its left on a desktop, a row of chips across its top on a phone; the chosen worker's name,
              month and calendar fill the rest. The money is in its own card under it. Not overflow-hidden:
              a day's editor opens under its box and may reach past the card. */}
          <div className="rounded-xl border border-line bg-surface lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
            <nav aria-label={t('crew.workers')} className="rounded-t-xl border-b border-line bg-side lg:rounded-tr-none lg:rounded-l-xl lg:border-r lg:border-b-0 lg:p-3">
              <p className="hidden px-2 pt-1 pb-2 text-xs font-medium tracking-wide text-subtle uppercase lg:block">{t('crew.workers')} · {workers.length}</p>
              <ul className="flex gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-0">
                {workers.map((w) => {
                  const on = w.id === chosen?.id
                  const hours = worked(w.rows).reduce((s, r) => s + r.minutes, 0)
                  return (
                    <li key={w.id} className="shrink-0">
                      <button type="button" aria-current={on ? 'true' : undefined} onClick={() => go({ worker: w.id })}
                        className={`flex min-h-11 w-full items-center gap-2 rounded-full border px-3 text-left text-sm lg:rounded-lg lg:border-0
                          ${on ? 'border-brand bg-brand-soft font-semibold text-brand-dark lg:bg-side-selected' : 'border-line bg-surface font-medium text-ink hover:bg-muted lg:bg-transparent lg:hover:bg-line'}`}>
                        <span className="min-w-0 flex-1 truncate">{w.name}</span>
                        <span className={`shrink-0 text-xs tabular-nums ${on ? 'text-brand-dark' : 'text-subtle'}`}>{hours ? hoursText(hours) : '—'}</span>
                      </button>
                    </li>
                  )
                })}
                {projectId && (
                  <li className="shrink-0 lg:mt-1.5 lg:border-t lg:border-line lg:pt-1.5">
                    <button type="button" onClick={() => setAdding(true)} disabled={adding}
                      className="flex min-h-11 w-full items-center rounded-full border border-dashed border-field px-3 text-sm font-semibold text-slate hover:bg-muted disabled:opacity-50 lg:rounded-lg lg:border-0 lg:hover:bg-line">
                      <span aria-hidden>+&nbsp;</span>{t('crew.addWorker')}
                    </button>
                  </li>
                )}
              </ul>
            </nav>

            <div className="min-w-0">
              {adding && projectId && (
                <div className="border-b border-line p-3 sm:p-4">
                  <AddWorker crewId={crewId} projectId={projectId} onto={workers} onDone={(id) => { setAdding(false); if (id) go({ worker: id }) }} />
                </div>
              )}
              {!chosen ? (
                !adding && <div className="p-3 sm:p-4"><EmptyState title={t('crew.empty')}>{t('crew.empty.how')}</EmptyState></div>
              ) : (
                <>
                  <div className="border-b border-line px-3 py-3 sm:px-5">
                    <WorkerHeader w={chosen} crewId={crewId} membership={membership} month={params.get('month')} />
                  </div>
                  <div className="px-3 pt-2 pb-4 sm:px-5 sm:pb-5">
                    {monthBar('h3')}
                    <div className="mt-2">
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
                        <Button variant="secondary" disabled={verifying} onClick={() => setDay(null)}>{t('crew.saveDraft')}</Button>
                        <Button busy={verifying} onClick={() => void verify(day, chosen).then((ok) => { if (ok) setDay(null) })}>{t('crew.verified')}</Button>
                      </div>
                    ) : <Button className="w-full" onClick={() => setDay(null)}>{t('crew.done')}</Button>)} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {chosen && <WorkerSummary w={chosen} month={month} showMoney={showMoney} canPay={pays && !!projectId} projectId={projectId} />}
        </div>
        )}

        {tab === 'crew' && (
        <div className="flex flex-col gap-4">
          {monthBar('h2')}
          {workers.length === 0 && <EmptyState title={t('crew.empty')}>{t('crew.empty.tab')}</EmptyState>}
          {workers.length > 0 && (
            <Card title={t('crew.totals')}>
              <CrewTotals workers={workers} showMoney={showMoney} onPick={(id) => go({ worker: id, tab: '' })} />
              {workers.some((w) => w.draft_days > 0) && (
                <p className="mt-3 text-xs text-subtle">{t('crew.totals.drafts')}</p>
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
  const label = date === today ? t('common.today') : yesterday ? t('common.yesterday') : formatDate(date, display)
  const chip = (on: boolean) => `inline-flex min-h-11 [@media(pointer:fine)]:min-h-9 items-center rounded-full border px-3 text-sm font-medium ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink hover:bg-muted'}`
  const prev = new Date(`${today}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1)
  const yesterdayIso = prev.toISOString().slice(0, 10) as IsoDate

  return (
    <section aria-label={t('crew.day.label', { day: label })} className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">{t('crew.day.on')}</span>
        <button type="button" className={chip(date === today)} aria-pressed={date === today} onClick={() => { setOtherDay(false); onDate(today) }}>{t('common.today')}</button>
        <button type="button" className={chip(yesterday)} aria-pressed={yesterday} onClick={() => { setOtherDay(false); onDate(yesterdayIso) }}>{t('common.yesterday')}</button>
        {date !== today && !yesterday
          ? <button type="button" className={chip(true)} onClick={() => setOtherDay((x) => !x)}>{label}</button>
          : <button type="button" className="min-h-11 [@media(pointer:fine)]:min-h-9 px-1 text-sm font-medium text-slate underline" onClick={() => setOtherDay((x) => !x)}>{t('crew.day.other')}</button>}
        <span className="ml-auto flex flex-wrap gap-2">
          {canMark && todo.length > 0 && <Button onClick={() => onEveryone(todo)}>{t('crew.day.everyone', { from: hhmm(company.day_start), to: hhmm(company.day_end) })}</Button>}
          {canMark && drafts > 0 && (
            <Button variant={todo.length ? 'secondary' : 'primary'} busy={verifying} onClick={onVerify}>{t('crew.day.verify', { n: drafts })}</Button>
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
          {t('crew.day.in', { n: crew.length - todo.length - absent })}{absent ? t('crew.day.absent', { n: absent }) : ''}
          {todo.length ? t('crew.day.notMarked', { n: todo.length }) : t('crew.day.allMarked')}
          {drafts > 0 ? t(drafts === 1 ? 'crew.day.draft' : 'crew.day.drafts', { n: drafts }) : todo.length < crew.length ? t('crew.day.verified') : ''}
        </p>
        <button type="button" className="min-h-11 [@media(pointer:fine)]:min-h-9 text-sm font-medium text-slate underline" aria-expanded={shown} onClick={() => setOpen((x) => !x)}>
          {shown ? t('crew.day.hide') : t('crew.day.show')}
        </button>
      </div>
      {shown && (
        <ul className="mt-1">
          {crew.map((w) => {
            const r = markOf(w)
            const status = !r ? t('crew.notMarked') : `${r.absent ? t('crew.absent') : hoursText(r.minutes)}${r.verified ? t('crew.status.verified') : t('crew.status.draft')}`
            const pick = (m: Mark, on: boolean) => (
              <button type="button" aria-pressed={on} disabled={!canMark}
                onClick={() => onMark(w, m)}
                className={`min-h-11 min-w-14 rounded-lg border px-2 text-sm font-medium disabled:opacity-40 ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line text-ink hover:bg-muted'}`}>
                {m.absent ? t('crew.absent') : m.minutes === std ? t('crew.full') : t('crew.half')}
              </button>
            )
            return (
              <li key={w.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0" aria-label={`${w.name}: ${status}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{w.name}</span>
                  <span className={`flex items-center gap-1 text-xs ${!r ? 'text-warn-ink' : 'text-subtle'}`}>
                    {!r ? t('crew.notMarked') : r.absent ? t('crew.absent') : hoursText(r.minutes)}
                    {r && (r.verified ? <CheckIcon size={12} className="text-good-ink" aria-label={t('crew.verifiedIcon')} /> : <span className="uppercase">{t('crew.draftTag')}</span>)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1" role="group" aria-label={t('crew.workerOnDay', { name: w.name, day: label })}>
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
        <h2 className="text-base font-semibold text-ink">{w.name}</h2>
        <p className="text-sm text-subtle">
          {[w.work_type, rateText(w, formatNPR), !w.active ? t('crew.worker.left') : !w.on_crew ? t('crew.worker.offCrew') : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="flex flex-wrap items-center gap-x-1 text-sm">
        <Link className="inline-flex min-h-11 items-center px-2 font-medium text-slate underline underline-offset-2" to={`/workers/${w.id}${month ? `?month=${month}` : ''}`}>{t('crew.worker.khata')}</Link>
        {w.on_crew ? (
          <ConfirmButton quiet confirmLabel={t('crew.worker.remove', { name: w.name.split(' ')[0] })} disabled={membership.isPending}
            onConfirm={() => membership.mutate({ crewId, workerId: w.id, active: false })}>{t('crew.worker.removeFromCrew')}</ConfirmButton>
        ) : (
          <Button variant="ghost" disabled={membership.isPending} onClick={() => membership.mutate({ crewId, workerId: w.id, active: true })}>{t('crew.worker.putOn')}</Button>
        )}
      </span>
    </div>
  )
}

const dayTitle = (date: IsoDate, today: IsoDate, display: 'bs' | 'ad') =>
  date === today ? t('common.today') : relativeDay(date, today) === 'yesterday' ? t('common.yesterday') : formatDate(date, display)

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
    return p ? `${p.code} · ${p.name}` : t('crew.panel.otherProject')
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
        {row ? (row.absent ? t('crew.panel.absent') : hoursText(row.minutes)) : t('crew.panel.notMarked')}{row && (row.verified ? t('crew.panel.verified') : t('crew.panel.draft'))}{' '}
        {!w.active ? t('crew.panel.left', { name: w.name }) : t('crew.panel.tooOld')}
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
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
      <DaySheet key={`${row?.minutes ?? 0}:${row?.time_in ?? ''}:${row?.time_out ?? ''}:${row?.absent ?? ''}`} id={`${w.id}-${date}`} label={`${w.name}, ${dayTitle(date, today, display)}`}
        row={row} company={company} busy={busy} onMark={onMark} half={morningTaken ? afternoon : undefined}
        footer={row?.verified
          ? <p className="text-xs text-subtle">{t('crew.panel.verifiedFoot', { amount: !row.absent && row.amount_paisa != null ? `: ${formatNPR(row.amount_paisa)}` : '' })}</p>
          : row && <p className="text-xs text-subtle">{t('crew.panel.draftFoot')}</p>} />
      {other && (
        <div>
          <p className="mb-1 text-xs font-medium text-subtle">{t('crew.panel.alsoThatDay')}</p>
          {other}
          <p className="mt-1 text-xs text-subtle">{t('crew.panel.noOverlap')}</p>
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
  const line = (label: string, value: string, strong?: boolean, tone = 'text-ink') => (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className={`text-sm tabular-nums ${strong ? 'font-semibold' : ''} ${tone}`}>{value}</dd>
    </div>
  )
  const drafts = w.draft_days > 0 && (
    <p className="mt-2 text-xs text-subtle">{t(w.draft_days === 1 ? 'crew.summary.draftDay' : 'crew.summary.draftDays', { n: w.draft_days })}</p>
  )
  return (
    // All paying happens on the worker's payment form (pay_worker): it ticks this project's days and
    // takes off any advance they hold (on any project). The month on the left, all months on the right.
    <Card title={t('crew.summary', { name: w.name })} actions={canPay && projectId && due != null && due > 0 && (
      <ButtonLink to={`/payments/new?worker=${w.id}&project=${projectId}`}>{t('crew.summary.pay', { name: w.name.split(' ')[0] })}</ButtonLink>
    )}>
      <div className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
        <div>
          <h3 className="mt-1 text-xs font-medium tracking-wide text-subtle uppercase">{t('crew.summary.inMonth', { month: monthLabel(month) })}</h3>
          <dl>
            {line(t('crew.summary.days'), String(daysWorked))}
            {absentDays > 0 && line(t('crew.absent'), String(absentDays))}
            {line(t('crew.summary.hours'), hoursText(rows.reduce((s, r) => s + r.minutes, 0)))}
            {showMoney && line(t('crew.summary.earned'), money(earned))}
            {showMoney && line(t('crew.summary.paid'), money(w.paid_paisa))}
          </dl>
        </div>
        <div>
          {showMoney ? (
            <>
              <h3 className="mt-1 text-xs font-medium tracking-wide text-subtle uppercase">{t('crew.summary.allMonths')}</h3>
              {/* Paid ahead is money the worker holds: green, as "they hold" is everywhere else. */}
              <dl>{due != null && due < 0 ? line(t('crew.summary.paidAhead'), formatNPR(-due), true, 'text-good-ink') : line(t('crew.summary.owed'), money(due), true)}</dl>
              {due != null && due < 0 && <p className="mt-1 text-xs text-subtle">{t('crew.summary.comesOff', { name: w.name.split(' ')[0] })}</p>}
            </>
          ) : <p className="mt-2 text-xs text-subtle">{t('crew.summary.hidden')}</p>}
          {drafts}
        </div>
      </div>
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
          <th scope="col" className="py-2 pr-2 font-medium">{t('crew.col.worker')}</th>
          <th scope="col" className="py-2 pr-2 text-right font-medium">{t('crew.summary.hours')}</th>
          {showMoney && <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">{t('crew.summary.earned')}</th>}
          {showMoney && <th scope="col" className="py-2 text-right font-medium">{t('crew.col.owed')} <span className="font-normal">{t('crew.col.owed.note')}</span></th>}
        </tr>
      </thead>
      <tbody>
        {workers.map((w) => (
          <tr key={w.id} className="border-b border-line last:border-0">
            <td className="py-1.5 pr-2">
              <button type="button" className="min-h-11 [@media(pointer:fine)]:min-h-9 text-left font-medium text-ink hover:underline" onClick={() => onPick(w.id)}>{w.name}</button>
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{hoursText(hours(w))}</td>
            {showMoney && <td className="hidden py-1.5 pr-2 text-right tabular-nums sm:table-cell">{formatNPR(earned(w))}</td>}
            {showMoney && <td className="py-1.5 text-right font-medium tabular-nums">{owedText(due(w))}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line font-semibold text-ink">
          <td className="py-2 pr-2">{t('crew.total')}</td>
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
    <Card title={t('crew.addWorker')} actions={<Button variant="ghost" onClick={() => onDone()}>{t('common.cancel')}</Button>}>
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
                    <span className="block text-xs text-subtle">{[w.crew_name ?? t('crew.add.noCrew'), rateText(w, formatNPR)].join(' · ')}</span>
                  </span>
                  <span className="text-sm font-medium text-brand">{t('common.add')}</span>
                </button>
              </li>
            ))}
          </ul>
          <ErrorBanner>{add.error && friendlyError(add.error)}</ErrorBanner>
          <Button variant="secondary" className="mt-3" onClick={() => setCreating(true)}>{t('crew.add.new')}</Button>
        </>
      )}
    </Card>
  )
}
