// The crew page when the company works by attendance (GLOSSARY: Crew, Worker, Attendance): the one
// place attendance is marked. "Everyone in" marks the whole crew for a day in one tap; the crew's
// workers on the left, the chosen worker's month as a calendar on the right with the hours in each
// day's box. A tap on a box opens the day's editor right there (DayGrid), where a day can also be
// split with another project. Under the calendar: the worker's
// hours, what they earned, were paid and are still owed, with Pay; then the whole crew's totals and
// "Close days". Each worker is paid on their own; paying closes their open days first.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { DateInput } from '../../components/DateInput'
import { Button, Card, Checkbox, EmptyState, ErrorBanner, Field, Notice, Select, Spinner } from '../../components/ui'
import { formatDate, relativeDay, todayKathmandu, type IsoDate } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { monthDays, monthLabel, monthOf, monthParam, parseMonth, shiftMonth, type MonthRef } from '../../lib/months'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canRecordPayments } from '../supply/permissions'
import { useCrews } from '../costs/api'
import { useCurrentProject } from '../projects/current'
import { type CrewWorker, fullDayOf, hhmm, hoursText, rateText, useAddCrewWorker, useCrewMonth, useProjectWorkers, useSetCrewMember, useWorkerMonth } from './api'
import { DayGrid } from './DayGrid'
import { DaySheet, type Mark } from './DaySheet'
import { WorkerForm } from './WorkerForm'

const money = (p: number | null | undefined) => (p == null ? 'Not available' : formatNPR(p))

type Closed = { total_paisa: number; days: number; payments: { number: string }[] }

export function CrewBoard({ crewId, projectId }: { crewId: string; projectId: string | null }) {
  const auth = useCompany()
  const company = auth.company
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refreshMoney = useRefreshMoney()
  const today = todayKathmandu()
  const thisMonth = monthOf(today, auth.dateDisplay)
  const month = parseMonth(params.get('month'), thisMonth)
  const days = monthDays(month)
  const data = useCrewMonth(crewId, days[0], days.at(-1)!)
  const [day, setDay] = useState<IsoDate | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closed, setClosed] = useState<Closed | null>(null)
  const pays = canRecordPayments(auth)
  const [payNow, setPayNow] = useState(false)
  const [method, setMethod] = useState<keyof typeof PAYMENT_METHODS>('cash')
  const [duplicate, setDuplicate] = useState('')
  const membership = useSetCrewMember()
  const [rollDay, setRollDay] = useState<IsoDate>(() => params.get('date') ?? today)
  const [rolling, setRolling] = useState(false)
  const [rolled, setRolled] = useState('')

  const go = (change: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
    setDay(null); setError(''); setClosed(null); setDuplicate('')
  }
  const goMonth = (m: MonthRef) => go({ month: m.year === thisMonth.year && m.month === thisMonth.month ? '' : monthParam(m) })
  /** ◀ ▶: back on this month, the whole crew is marked for today again. */
  const stepMonth = (m: MonthRef) => {
    if (m.year === thisMonth.year && m.month === thisMonth.month) setRollDay(today)
    goMonth(m)
  }

  const workers = data.data?.workers ?? []
  const chosen = workers.find((w) => w.id === params.get('worker')) ?? workers.find((w) => w.on_crew) ?? workers[0]
  const isThisMonth = month.year === thisMonth.year && month.month === thisMonth.month
  const lastDay = days.at(-1)! < today ? days.at(-1)! : today

  async function mark(w: CrewWorker, date: IsoDate, m: Mark | null) {
    if (!projectId) return
    setSaving(true)
    setError('')
    try {
      await rpc('set_attendance', { p_row: { project_id: projectId, crew_id: crewId, worker_id: w.id, work_date: date,
        time_in: m?.time_in ?? null, time_out: m?.time_out ?? null, minutes: m?.minutes ?? 0 } })
    } catch (e) {
      const overlap = ((e as { message?: string }).message ?? '').startsWith('attendance_overlap')
      setError(`${w.name}, ${formatDate(date, auth.dateDisplay)}: ${friendlyError(e)}${overlap ? ' Open the day on their other project to change it.' : ''}`)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setSaving(false)
    }
  }

  /** Split the worker's day here with another project: this project keeps the first half of the
   *  hours, the other the rest. The server saves both or neither. */
  async function split(w: CrewWorker, date: IsoDate, toProject: string, toCrew: string) {
    if (!projectId) return
    setSaving(true); setError('')
    try {
      await rpc('split_attendance', { p_split: { worker_id: w.id, work_date: date, from_project: projectId, to_project: toProject, to_crew: toCrew } })
    } catch (e) {
      setError(`${w.name}, ${formatDate(date, auth.dateDisplay)}: ${friendlyError(e)}`)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setSaving(false)
    }
  }

  // Everyone in: a full day for each worker on the crew not marked that day yet, one at a time;
  // whoever could not be marked is listed. Absences and half days are then fixed on the calendar.
  async function everyoneIn() {
    if (!projectId) return
    setRolling(true); setError(''); setRolled('')
    const todo = workers.filter((w) => w.on_crew && w.active && !w.rows.some((r) => r.work_date === rollDay))
    const failed: string[] = []
    for (const w of todo) {
      try {
        await rpc('set_attendance', { p_row: { project_id: projectId, crew_id: crewId, worker_id: w.id, work_date: rollDay, ...fullDayOf(company) } })
      } catch (e) {
        failed.push(`${w.name}: ${friendlyError(e)}`)
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['attendance'] })
    const done = todo.length - failed.length
    setRolled(`${done} ${done === 1 ? 'worker' : 'workers'} marked in for ${formatDate(rollDay, auth.dateDisplay)}. Tap a box to change anyone's day.`)
    setError(failed.join(' '))
    setRolling(false)
  }

  const close = usePosting((key, confirm: boolean) => rpc('close_labour_day', { p_op_key: key, p_close: {
    project_id: projectId, crew_id: crewId, from_date: days[0], to_date: lastDay, confirm_duplicate: confirm,
    pay_now: payNow && pays ? { method, reference: null } : null } }) as Promise<unknown> as Promise<Closed>, {
    onSuccess: async (r) => {
      setClosed(r); setClosing(false); setDuplicate('')
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

  // Pay: close the worker's open days on this project first, so the payment can be matched to them.
  const pay = usePosting((key, w: CrewWorker) => {
    const open = w.open_paisa ? rpc('close_worker_days', { p_op_key: key, p_close: {
      worker_id: w.id, project_id: projectId, to_date: today, pay_now: null } }) : Promise.resolve(null)
    return open.then(() => w)
  }, {
    onSuccess: async (w) => {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      await refreshMoney()
      navigate(`/payments/new?worker=${w.id}${projectId ? `&project=${projectId}` : ''}`)
    },
  })

  if (data.isPending) return <Spinner />
  if (data.error) return <ErrorBanner onRetry={() => void data.refetch()}>{friendlyError(data.error)}</ErrorBanner>
  const showMoney = data.data.can_see_money
  const unmarked = workers.filter((w) => w.on_crew && w.active && !w.rows.some((r) => r.work_date === rollDay)).length
  const rollInMonth = rollDay >= days[0] && rollDay <= days.at(-1)!
  const openDays = new Set(workers.flatMap((w) => w.rows.filter((r) => !r.closed && r.work_date <= lastDay).map((r) => r.work_date))).size

  return (
    <div className="flex flex-col gap-4">
      {!projectId && <Notice>This crew is not tied to a project, so attendance is marked from the roster of each project.</Notice>}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Button variant="secondary" aria-label="Previous month" className="px-3" onClick={() => stepMonth(shiftMonth(month, -1))}><ChevronLeftIcon size={20} /></Button>
        <h2 className="text-center text-lg font-semibold text-ink" aria-live="polite">{monthLabel(month)}</h2>
        <Button variant="secondary" aria-label="Next month" className="px-3" disabled={isThisMonth || days[0] > today} onClick={() => stepMonth(shiftMonth(month, 1))}><ChevronRightIcon size={20} /></Button>
      </div>

      {projectId && (isThisMonth || rollInMonth) && workers.some((w) => w.on_crew && w.active) && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-line bg-surface p-3">
          <div className="w-full sm:w-72">
            <Field label="Whole crew on" htmlFor="cb-roll">
              <DateInput id="cb-roll" value={rollDay} display={auth.dateDisplay} onChange={(d) => {
                if (!d) return
                setRollDay(d); setRolled('')
                // A day in another month: show that month, so its boxes can be checked after.
                if (d < days[0] || d > days.at(-1)!) goMonth(monthOf(d, auth.dateDisplay))
              }} />
            </Field>
          </div>
          <Button className="mb-3" busy={rolling} disabled={!unmarked || !rollInMonth}
            onClick={() => void everyoneIn()}>
            Everyone in · {hhmm(company.day_start)}–{hhmm(company.day_end)}
          </Button>
          <p className="mb-3 w-full text-xs text-subtle sm:w-auto">
            {unmarked ? `${unmarked} of the crew not marked yet.` : 'Everyone on the crew is marked for that day.'}
          </p>
        </div>
      )}
      {rolled && <Notice>{rolled}</Notice>}

      {closed && (
        <Notice>
          Closed {closed.days} {closed.days === 1 ? 'day' : 'days'}: {formatNPR(closed.total_paisa)} labour cost, owed to each worker.{' '}
          {closed.payments.length ? `Paid now (${closed.payments.map((p) => p.number).join(', ')}).` : 'Not paid yet; pay each worker when you settle.'}
        </Notice>
      )}

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Workers: chips on a phone, a column on a desktop. */}
        <nav aria-label="Workers" className="mb-4 lg:sticky lg:top-4 lg:mb-0">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
            {workers.map((w) => {
              const on = w.id === chosen?.id
              return (
                <li key={w.id} className="shrink-0">
                  <button type="button" aria-current={on ? 'true' : undefined} onClick={() => go({ worker: w.id })}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-full border px-3 text-left text-sm lg:rounded-lg lg:border-0 lg:py-1.5
                      ${on ? 'border-brand bg-brand-soft font-semibold text-brand-dark' : 'border-line bg-surface font-medium text-ink hover:bg-muted lg:bg-transparent'}`}>
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    <span className={`shrink-0 text-xs tabular-nums ${on ? 'text-brand-dark' : 'text-subtle'}`}>{w.minutes ? hoursText(w.minutes) : '—'}</span>
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

        <div className="flex min-w-0 flex-col gap-4">
          {adding && projectId && <AddWorker crewId={crewId} projectId={projectId} onto={workers} onDone={(id) => { setAdding(false); if (id) go({ worker: id }) }} />}
          {!chosen ? (
            !adding && <EmptyState title="No workers on this crew yet">Add each worker with their daily or hourly rate, then mark their days here.</EmptyState>
          ) : (
            <>
              <WorkerHeader w={chosen} crewId={crewId} membership={membership} month={params.get('month')} />
              <DayGrid name={chosen.name} days={days} today={today} display={auth.dateDisplay} selected={day} onPick={setDay}
                entries={(d) => chosen.rows.filter((r) => r.work_date === d)}
                title={day ? `${dayTitle(day, today, auth.dateDisplay)} · ${chosen.name}` : ''}
                editor={day && (
                  <DayPanel key={`${chosen.id}:${day}`} w={chosen} date={day} today={today} display={auth.dateDisplay} company={company} busy={saving}
                    editable={!!projectId && chosen.active} onMark={(m) => void mark(chosen, day, m)} onPicked={() => setDay(null)} projectId={projectId}
                    onSplit={(to, toCrew) => void split(chosen, day, to, toCrew)} />
                )} />
              <ErrorBanner>{error || (membership.error && friendlyError(membership.error))}</ErrorBanner>
              <WorkerSummary w={chosen} month={month} showMoney={showMoney} canPay={pays && !!projectId} paying={pay.isPending} onPay={() => pay.mutate(chosen)} />
              <ErrorBanner>{pay.error && friendlyError(pay.error)}</ErrorBanner>
            </>
          )}
        </div>
      </div>

      {workers.length > 0 && (
        <Card title={`Crew this month`} actions={projectId && openDays > 0 && !closing && <Button variant="secondary" onClick={() => setClosing(true)}>Close days</Button>}>
          <CrewTotals workers={workers} showMoney={showMoney} onPick={(id) => go({ worker: id })} />
          {closing && projectId && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-sm">
                {openDays} open {openDays === 1 ? 'day' : 'days'} in {monthLabel(month)}. Each worker's days become labour cost on this project, owed to them.
                After closing, a day changes only by reversing that cost.
              </p>
              {pays && (
                <div className="mt-3">
                  <Checkbox label="Paid now" hint="Records a payment to each worker for their days. The cost is counted once." checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                  {payNow && (
                    <Field label="How" htmlFor="cb-method">
                      <Select id="cb-method" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof PAYMENT_METHODS)}>
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
            </div>
          )}
        </Card>
      )}
    </div>
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
      <span className="flex flex-wrap items-center gap-x-3 text-sm">
        <Link className="inline-flex min-h-11 items-center font-medium text-slate underline underline-offset-2" to={`/workers/${w.id}${month ? `?month=${month}` : ''}`}
>Khata</Link>
        <button type="button" disabled={membership.isPending}
          className="inline-flex min-h-11 items-center font-medium text-slate underline underline-offset-2 disabled:opacity-50"
          onClick={() => membership.mutate({ crewId, workerId: w.id, active: !w.on_crew })}>
          {w.on_crew ? 'Remove from crew' : 'Put on crew'}
        </button>
      </span>
    </div>
  )
}

const dayTitle = (date: IsoDate, today: IsoDate, display: 'bs' | 'ad') =>
  date === today ? 'Today' : relativeDay(date, today) === 'yesterday' ? 'Yesterday' : formatDate(date, display)

/** The chosen day, in the editor at its box: the quick choices and times, the worker's time on
 *  other projects that day, and Split; or why it cannot change. */
function DayPanel({ w, date, today, display, company, busy, editable, onMark, onPicked, onSplit, projectId }: {
  w: CrewWorker; date: IsoDate; today: IsoDate; display: 'bs' | 'ad'; company: { day_start: string; day_end: string; standard_day_minutes: number }
  busy: boolean; editable: boolean; onMark: (m: Mark | null) => void; onPicked: () => void
  onSplit: (toProject: string, toCrew: string) => void; projectId: string | null
}) {
  const auth = useCompany()
  const current = useCurrentProject()
  const crews = useCrews(auth.companyId)
  // The worker's whole day, on every project: to show time taken elsewhere and offer Split.
  const all = useWorkerMonth(w.id, date, date)
  const [splitting, setSplitting] = useState(false)
  const row = w.rows.find((r) => r.work_date === date && (!projectId || r.project_id === projectId))
  const elsewhere = (all.data?.rows ?? []).filter((r) => r.project_id !== projectId)
  const projectName = (pid: string | null) => {
    const p = pid && current.choices.find((x) => x.id === pid)
    return p ? `${p.code} · ${p.name}` : 'Another project'
  }
  const others = current.choices.filter((c) => c.id !== projectId && !elsewhere.some((r) => r.project_id === c.id))
  /** The crew the rest of the day goes to: the worker's own crew there, else that project's main crew. */
  const crewOn = (pid: string) => all.data?.worker.crews.find((c) => c.project_id === pid)?.crew_id
    ?? (crews.data?.filter((c) => c.active && c.project_id === pid).sort((a, b) => Number(b.is_default) - Number(a.is_default))[0]?.id ?? '')
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

  if (row?.closed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {hoursText(row.minutes)}{row.time_in && row.time_out ? ` · ${hhmm(row.time_in)}–${hhmm(row.time_out)}` : ''}. This day is closed.
          To change it, reverse its labour cost in the project's{' '}
          <Link className="text-slate underline" to={`/projects/${row.project_id}?tab=labour`}>labour list</Link>.
        </p>
        {other}
      </div>
    )
  }
  if (!editable) return <p className="text-sm text-subtle">{row ? hoursText(row.minutes) : 'Not marked.'} {!w.active && `${w.name} has left, so new days cannot be marked.`}</p>
  const canSplit = !!row && others.length > 0
  return (
    <div className="flex flex-col gap-3">
      <DaySheet key={`${row?.minutes ?? 0}:${row?.time_in ?? ''}:${row?.time_out ?? ''}`} id={`${w.id}-${date}`} label={`${w.name}, ${dayTitle(date, today, display)}`}
        row={row} company={company} busy={busy} onMark={onMark} onPicked={onPicked}
        footer={row?.amount_paisa != null && <p className="text-xs text-subtle">{hoursText(row.minutes)} · {formatNPR(row.amount_paisa)}</p>} />
      {other && <div><p className="mb-1 text-xs font-medium text-subtle">Also that day</p>{other}</div>}
      {canSplit && (splitting ? (
        <Field label="Other project for the rest of the day" htmlFor={`cb-split-${date}`}
          hint="This project keeps the first half of the hours; change the times after.">
          <Select id={`cb-split-${date}`} value="" disabled={busy}
            onChange={(e) => { const pid = e.target.value; if (pid) { onSplit(pid, crewOn(pid)); setSplitting(false) } }}>
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

/** This month for one worker, and what is still owed to them on this project. */
function WorkerSummary({ w, month, showMoney, canPay, paying, onPay }: {
  w: CrewWorker; month: MonthRef; showMoney: boolean; canPay: boolean; paying: boolean; onPay: () => void
}) {
  const daysWorked = new Set(w.rows.map((r) => r.work_date)).size
  const earned = showMoney ? w.rows.reduce((s, r) => s + (r.amount_paisa ?? 0), 0) : null
  const due = showMoney && w.balance_paisa != null && w.open_paisa != null ? w.balance_paisa + w.open_paisa : null
  const line = (label: string, value: string, strong?: boolean) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd className={`text-sm tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value}</dd>
    </div>
  )
  return (
    <Card title={`${monthLabel(month)} for ${w.name}`}
      actions={canPay && due != null && due > 0 && <Button busy={paying} onClick={onPay}>Pay {w.name.split(' ')[0]}</Button>}>
      <dl>
        {line('Days worked', String(daysWorked))}
        {line('Hours', hoursText(w.minutes))}
        {showMoney && line('Earned this month', money(earned))}
        {showMoney && line('Paid this month', money(w.paid_paisa))}
        {showMoney && line('Still to pay on this project', money(due), true)}
      </dl>
      {showMoney && !!w.open_paisa && (
        <p className="mt-2 text-xs text-subtle">Includes {formatNPR(w.open_paisa)} for days not closed yet; Pay closes them first.</p>
      )}
      {!showMoney && <p className="mt-2 text-xs text-subtle">Amounts are shown to those who see this project's money.</p>}
    </Card>
  )
}

function CrewTotals({ workers, showMoney, onPick }: { workers: CrewWorker[]; showMoney: boolean; onPick: (id: string) => void }) {
  const earned = (w: CrewWorker) => w.rows.reduce((s, r) => s + (r.amount_paisa ?? 0), 0)
  const due = (w: CrewWorker) => (w.balance_paisa ?? 0) + (w.open_paisa ?? 0)
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-subtle">
          <th scope="col" className="py-2 pr-2 font-medium">Worker</th>
          <th scope="col" className="py-2 pr-2 text-right font-medium">Hours</th>
          {showMoney && <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">Earned</th>}
          {showMoney && <th scope="col" className="py-2 text-right font-medium">To pay</th>}
        </tr>
      </thead>
      <tbody>
        {workers.map((w) => (
          <tr key={w.id} className="border-b border-line last:border-0">
            <td className="py-1.5 pr-2">
              <button type="button" className="min-h-9 text-left font-medium text-ink hover:underline" onClick={() => onPick(w.id)}>{w.name}</button>
            </td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{hoursText(w.minutes)}</td>
            {showMoney && <td className="hidden py-1.5 pr-2 text-right tabular-nums sm:table-cell">{formatNPR(earned(w))}</td>}
            {showMoney && <td className="py-1.5 text-right font-medium tabular-nums">{formatNPR(due(w))}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line font-semibold text-ink">
          <td className="py-2 pr-2">Total</td>
          <td className="py-2 pr-2 text-right tabular-nums">{hoursText(workers.reduce((s, w) => s + w.minutes, 0))}</td>
          {showMoney && <td className="hidden py-2 pr-2 text-right tabular-nums sm:table-cell">{formatNPR(workers.reduce((s, w) => s + earned(w), 0))}</td>}
          {showMoney && <td className="py-2 text-right tabular-nums">{formatNPR(workers.reduce((s, w) => s + due(w), 0))}</td>}
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
