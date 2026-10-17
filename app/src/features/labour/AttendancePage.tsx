// Day roster (req §14, attendance): one project, one crew, one day. "Everyone in" marks the normal
// day in one tap; a tap on a worker fixes the exceptions (half day, not here, an extra hour, exact
// times). A worker from another crew can be brought in for the day: their hours cost this project
// and are owed to this crew. Each change saves at once; "Close day" turns the day into the crew's
// labour cost, paid now if wanted.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { Button, ButtonLink, Card, Checkbox, EmptyState, ErrorBanner, Field, Input, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { addDays, formatDual, relativeDay, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { useCrews } from '../costs/api'
import { useCurrentProject } from '../projects/current'
import { projectCrumbs } from '../projects/crumbs'
import { rpc, usePosting, useRefreshMoney } from '../supply/api'
import { canEnter, canRecordPayments } from '../supply/permissions'
import { clock, type DayRow, hhmm, hoursText, minutesBetween, payFor, rateText, useAttendanceDay, timeCardPath, toMin, useProjectWorkers, type Worker } from './api'
import { MemberForm } from './MemberForm'

type Mark = { time_in: string | null; time_out: string | null; minutes: number }
type Closed = { total_paisa: number; payment: { number: string } | null; days: number }

export function AttendancePage() {
  const auth = useCompany()
  const company = auth.company
  const [params, setParams] = useSearchParams()
  const current = useCurrentProject()
  const today = todayKathmandu()
  const projectId = params.get('project') || current.project?.id || ''
  const date = params.get('date') && params.get('date')! <= today ? params.get('date')! : today
  const crews = useCrews(auth.companyId)
  const projectCrews = crews.data?.filter((c) => c.active && (c.project_id === projectId || !c.project_id)) ?? []
  const crewId = params.get('crew') && projectCrews.some((c) => c.id === params.get('crew'))
    ? params.get('crew')!
    : (projectCrews.find((c) => c.project_id === projectId && c.is_default) ?? projectCrews[0])?.id ?? ''
  const workers = useProjectWorkers(projectId)
  const day = useAttendanceDay(projectId, date)
  const queryClient = useQueryClient()
  const refreshMoney = useRefreshMoney()
  const [open, setOpen] = useState<string | null>(null)
  const [bringing, setBringing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)
  const [marking, setMarking] = useState(false)
  const [payNow, setPayNow] = useState(canRecordPayments(auth))
  const [method, setMethod] = useState<keyof typeof PAYMENT_METHODS>('cash')
  const [duplicate, setDuplicate] = useState('')
  const [closed, setClosed] = useState<Closed | null>(null)

  const go = (change: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
    // A new day, crew or project starts with nothing open.
    setOpen(null); setBringing(false); setAdding(false); setClosing(false); setDuplicate(''); setClosed(null); setError('')
  }

  const std = company.standard_day_minutes
  const dayStart = hhmm(company.day_start), dayEnd = hhmm(company.day_end)
  const rows = (day.data ?? []).filter((r) => r.crew_id === crewId)
  const rowOf = (memberId: string) => rows.find((r) => r.member_id === memberId)
  const isClosed = rows.some((r) => r.closed)
  const crew = workers.data?.filter((w) => w.crew_id === crewId) ?? []
  const brought = (workers.data ?? []).filter((w) => w.crew_id !== crewId && rowOf(w.id))
  const others = (workers.data ?? []).filter((w) => w.crew_id !== crewId && !rowOf(w.id))
  const marked = [...crew, ...brought].filter((w) => rowOf(w.id))
  const minutes = marked.reduce((s, w) => s + rowOf(w.id)!.minutes, 0)
  const amount = marked.reduce((s, w) => s + (rowOf(w.id)!.amount_paisa ?? payFor(w, rowOf(w.id)!.minutes, std)), 0)

  /** Save one worker's day. Returns what went wrong, or '' when it saved. */
  async function save(w: Worker, m: Mark | null) {
    setSaving(w.id)
    try {
      await rpc('set_attendance', { p_row: { project_id: projectId, crew_id: crewId, member_id: w.id, work_date: date,
        time_in: m?.time_in ?? null, time_out: m?.time_out ?? null, minutes: m?.minutes ?? 0 } })
      return ''
    } catch (e) {
      const overlap = ((e as { message?: string }).message ?? '').startsWith('attendance_overlap')
      return `${w.name}: ${friendlyError(e)}${overlap ? ' Split the day on their time card.' : ''}`
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setSaving(null)
    }
  }
  async function mark(w: Worker, m: Mark | null) {
    setError('')
    setError(await save(w, m))
  }
  const fullDay: Mark = { time_in: dayStart, time_out: dayEnd, minutes: std }
  // Everyone in, one worker at a time; every worker it could not mark is listed at the end.
  async function everyoneIn() {
    setMarking(true)
    setError('')
    const failed: string[] = []
    for (const w of crew.filter((x) => !rowOf(x.id))) {
      const problem = await save(w, fullDay)
      if (problem) failed.push(problem)
    }
    setError(failed.join(' '))
    setMarking(false)
  }

  const close = usePosting((key, confirm: boolean) => rpc('close_labour_day', { p_op_key: key, p_close: {
    project_id: projectId, crew_id: crewId, from_date: date, confirm_duplicate: confirm,
    pay_now: payNow && canRecordPayments(auth) ? { method, reference: null } : null } }) as Promise<unknown> as Promise<Closed>, {
    onSuccess: async (r) => {
      setClosed(r)
      setClosing(false)
      setDuplicate('')
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      await refreshMoney()
    },
  })
  const closeDay = (confirm: boolean) => close.mutate(confirm, {
    onError: (e) => {
      const msg = (e as { message?: string }).message ?? ''
      if (msg.startsWith('near_duplicate')) setDuplicate(msg.replace(/^near_duplicate:\s*/, ''))
    },
  })

  if (!company.labour_module_enabled || company.labour_mode !== 'attendance') {
    return (
      <EmptyState title="Attendance is not turned on">
        Your company enters labour as a day total. {auth.isAdmin ? <Link className="text-slate" to="/settings">Change it in Settings</Link> : 'An admin can change it in Settings.'}
        {company.labour_module_enabled && <> or <Link className="text-slate" to="/labour/new">enter labour</Link>.</>}
      </EmptyState>
    )
  }
  if (!canEnter(auth)) return <EmptyState title="Attendance">Viewers cannot mark attendance.</EmptyState>

  const rowProps: RowProps = {
    rowOf, open, setOpen, isClosed, crewId, std, dayStart, dayEnd, saving, mark, fullDay, label: '', company,
  }
  const choices = current.choices
  const label = date === today ? 'Today' : relativeDay(date, today) === 'yesterday' ? 'Yesterday' : formatDual(date, auth.dateDisplay)
  rowProps.label = label

  return (
    <>
      <PageHeader title="Attendance" crumbs={projectCrumbs(choices, projectId)}
        subtitle={`${dayStart}–${dayEnd} is a full day of ${hoursText(std)}`} />
      <div className="flex flex-col gap-4 pb-24">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project" htmlFor="at-project">
            <Select id="at-project" value={projectId} onChange={(e) => go({ project: e.target.value, crew: '' })}>
              {!projectId && <option value="">Choose a project</option>}
              {choices.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
          {projectCrews.length > 1 && (
            <Field label="Crew" htmlFor="at-crew">
              <Select id="at-crew" value={crewId} onChange={(e) => go({ crew: e.target.value })}>
                {projectCrews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
          <Button variant="secondary" aria-label="Previous day" className="px-3" onClick={() => go({ date: addDays(date, -1) })}><ChevronLeftIcon size={20} /></Button>
          <Field label={label} htmlFor="at-date">
            <DateInput id="at-date" quick="none" value={date} onChange={(d) => d && go({ date: d === today ? '' : d })} display={auth.dateDisplay} />
          </Field>
          <Button variant="secondary" aria-label="Next day" className="px-3" disabled={date >= today} onClick={() => go({ date: addDays(date, 1) === today ? '' : addDays(date, 1) })}><ChevronRightIcon size={20} /></Button>
        </div>

        {!projectId ? (
          <EmptyState title="Choose a project">Attendance is marked for one project's crew at a time.</EmptyState>
        ) : workers.isPending || day.isPending || crews.isPending ? <Spinner /> : workers.error || day.error ? (
          <ErrorBanner onRetry={() => { void workers.refetch(); void day.refetch() }}>{friendlyError(workers.error || day.error)}</ErrorBanner>
        ) : (
          <>
            {closed && (
              <Notice>
                Day closed: {formatNPR(closed.total_paisa)} labour cost for the crew. {closed.payment ? `Paid now (${closed.payment.number}).` : 'Not paid yet; it shows as owed to the crew.'}
              </Notice>
            )}
            {isClosed && !closed && (
              <Notice>
                This day is closed: {formatNPR(amount)} labour cost for the crew. To change it, reverse that cost in the
                project's <Link className="text-slate underline" to={`/projects/${projectId}?tab=labour`}>labour list</Link>, then mark it again.
              </Notice>
            )}
            {!isClosed && crew.length > 0 && (
              <Button variant="tonal" className="w-full border border-dashed border-brand" busy={marking || (saving !== null && !open)}
                disabled={marking || crew.every((w) => rowOf(w.id))} onClick={() => void everyoneIn()}>
                Everyone in · {dayStart}–{dayEnd}
              </Button>
            )}

            <Card title={projectCrews.find((c) => c.id === crewId)?.name ?? 'Crew'}
              actions={!isClosed && !adding && <Button variant="ghost" onClick={() => setAdding(true)}>Add worker</Button>}>
              {adding && <div className="mb-3 rounded-lg border border-line p-3"><MemberForm crewId={crewId} onDone={() => setAdding(false)} /></div>}
              {crew.length === 0 && !adding && <p className="text-sm text-subtle">No workers on this crew yet. Add each worker with their rate.</p>}
              <WorkerList list={crew} {...rowProps} />
            </Card>

            {brought.length > 0 && (
              <Card title="Brought in for the day"><WorkerList list={brought} {...rowProps} /></Card>
            )}

            {!isClosed && (bringing ? (
              <Card title="Bring a worker from another crew" actions={<Button variant="ghost" onClick={() => setBringing(false)}>Done</Button>}>
                {others.length === 0 && <p className="text-sm text-subtle">Every worker is already on this day.</p>}
                <ul>
                  {others.map((w) => (
                    <li key={w.id} className="border-b border-line last:border-0">
                      <button type="button" disabled={saving !== null} onClick={() => { void mark(w, fullDay); setBringing(false) }}
                        className="flex min-h-12 w-full items-center gap-3 py-2 text-left hover:bg-muted">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{w.name}</span>
                          <span className="block text-xs text-subtle">{w.crew_name} · {rateText(w, formatNPR)}</span>
                        </span>
                        <span className="text-sm font-medium text-brand">Bring in</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : others.length > 0 && (
              <Button variant="secondary" onClick={() => setBringing(true)}>Bring a worker from another crew</Button>
            ))}

            <ErrorBanner>{error}</ErrorBanner>

            {closing && !isClosed && (
              <Card title={`Close ${label.toLowerCase() === 'today' ? 'today' : label}`}>
                <p className="text-sm">
                  {marked.length} {marked.length === 1 ? 'worker' : 'workers'}, {hoursText(minutes)}: <span className="font-semibold">{formatNPR(amount)}</span> labour cost for the crew.
                  After closing, the day changes only by reversing that cost.
                </p>
                {canRecordPayments(auth) && (
                  <div className="mt-3">
                    <Checkbox label="Paid now" hint="Records the payment too. The cost is counted once." checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                    {payNow && (
                      <Field label="How" htmlFor="at-method">
                        <Select id="at-method" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof PAYMENT_METHODS)}>
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
                      <Button busy={close.isPending} onClick={() => closeDay(true)}>Yes, close it too</Button>
                      <Button variant="secondary" onClick={() => setDuplicate('')}>No, check first</Button>
                    </span>
                  </Notice>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button busy={close.isPending} onClick={() => closeDay(false)}>Close day</Button>
                    <Button variant="secondary" onClick={() => setClosing(false)}>Not yet</Button>
                  </div>
                )}
                <ErrorBanner>{!duplicate && close.error && friendlyError(close.error)}</ErrorBanner>
              </Card>
            )}
          </>
        )}
      </div>

      {projectId && !workers.isPending && !day.isPending && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[5] -mx-4 flex items-center justify-between gap-3 border-t border-line bg-page/95 px-4 py-3 backdrop-blur md:bottom-0">
          <span className="text-sm text-subtle tabular-nums">
            <span className="font-semibold text-ink">{marked.length}</span> here · <span className="font-semibold text-ink">{hoursText(minutes)}</span> · <span className="font-semibold text-ink">{formatNPR(amount)}</span>
          </span>
          {isClosed ? <ButtonLink variant="secondary" to={`/projects/${projectId}?tab=labour`}>Closed</ButtonLink>
            : <Button disabled={!marked.length || closing} onClick={() => setClosing(true)}>Close day</Button>}
        </div>
      )}
    </>
  )
}

type RowProps = {
  rowOf: (memberId: string) => DayRow | undefined
  open: string | null
  setOpen: (id: string | null) => void
  isClosed: boolean
  crewId: string
  std: number
  dayStart: string
  dayEnd: string
  saving: string | null
  mark: (w: Worker, m: Mark | null) => Promise<void>
  fullDay: Mark
  label: string
  company: { day_start: string; day_end: string; standard_day_minutes: number }
}


function WorkerList({ list, ...p }: RowProps & { list: Worker[] }) {
  return (
    <ul>
      {list.map((w) => {
        const r = p.rowOf(w.id)
        return (
          <li key={w.id} className="border-b border-line last:border-0">
            <button type="button" aria-expanded={p.open === w.id} disabled={p.isClosed}
              onClick={() => p.setOpen(p.open === w.id ? null : w.id)}
              className="flex min-h-14 w-full items-center gap-3 py-2 text-left enabled:hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{w.name}</span>
                <span className="block text-xs text-subtle">{[w.work_type, rateText(w, formatNPR), w.crew_id !== p.crewId && `from ${w.crew_name}`].filter(Boolean).join(' · ')}</span>
              </span>
              <DayChip row={r} std={p.std} />
            </button>
            {p.open === w.id && !p.isClosed && <Sheet key={`${w.id}:${r?.minutes ?? 0}:${r?.time_in ?? ''}:${r?.time_out ?? ''}`} w={w} r={r} {...p} />}
          </li>
        )
      })}
    </ul>
  )
}

function DayChip({ row, std }: { row: DayRow | undefined; std: number }) {
  if (!row) return <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-subtle">Not here</span>
  const full = row.minutes === std
  const times = row.time_in && row.time_out ? ` · ${hhmm(row.time_in)}–${hhmm(row.time_out)}` : ''
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${full ? 'bg-good-soft text-good-ink' : 'bg-warn-soft text-warn-ink'}`}>
      {row.minutes === std / 2 ? 'Half day' : 'Here'} · {hoursText(row.minutes)}{full ? '' : times}
    </span>
  )
}

/** A tap on a worker: the quick choices, then exact times or hours. */
function Sheet({ w, r, ...p }: RowProps & { w: Worker; r: DayRow | undefined }) {
  const busy = p.saving === w.id
  const [tIn, setIn] = useState(hhmm(r?.time_in))
  const [tOut, setOut] = useState(hhmm(r?.time_out))
  const [hours, setHours] = useState(r ? String(r.minutes / 60) : '')
  const half = p.std / 2
  const pick = (m: Mark | null) => { void p.mark(w, m); p.setOpen(null) }
  const plusHour = () => {
    const out = toMin(r?.time_out ? hhmm(r.time_out) : p.dayEnd)
    void p.mark(w, { time_in: r?.time_in ? hhmm(r.time_in) : p.dayStart, time_out: clock(Math.min(out + 60, 23 * 60 + 59)), minutes: (r?.minutes ?? p.std) + 60 })
  }
  const saveTimes = () => {
    if (!tIn || !tOut) return
    const m = minutesBetween(tIn, tOut, p.company)
    if (m > 0) void p.mark(w, { time_in: tIn, time_out: tOut, minutes: m })
  }
  const saveHours = () => {
    const m = Math.round(Number(hours) * 60)
    if (m > 0 && m !== r?.minutes) void p.mark(w, { time_in: tIn || null, time_out: tOut || null, minutes: m })
  }
  return (
    <div className="flex flex-col gap-3 pb-3" role="group" aria-label={`${w.name}, ${p.label}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant={r?.minutes === p.std ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(p.fullDay)}>Full day</Button>
        <Button variant={r?.minutes === half ? 'tonal' : 'secondary'} disabled={busy}
          onClick={() => pick({ time_in: p.dayStart, time_out: clock(toMin(p.dayStart) + half), minutes: half })}>Half day</Button>
        <Button variant={!r ? 'tonal' : 'secondary'} disabled={busy} onClick={() => pick(null)}>Not here</Button>
        <Button variant="secondary" disabled={busy} onClick={plusHour}>+1 hour</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="In" htmlFor={`at-in-${w.id}`}>
          <Input id={`at-in-${w.id}`} type="time" value={tIn} disabled={busy} onChange={(e) => setIn(e.target.value)} onBlur={saveTimes} />
        </Field>
        <Field label="Out" htmlFor={`at-out-${w.id}`}>
          <Input id={`at-out-${w.id}`} type="time" value={tOut} disabled={busy} onChange={(e) => setOut(e.target.value)} onBlur={saveTimes} />
        </Field>
        <Field label="Hours worked" htmlFor={`at-h-${w.id}`}>
          <Input id={`at-h-${w.id}`} inputMode="decimal" value={hours} disabled={busy} onChange={(e) => setHours(e.target.value)} onBlur={saveHours} />
        </Field>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-subtle">
        <span>{r ? `${hoursText(r.minutes)} · ${formatNPR(payFor(w, r.minutes, p.std))}` : 'Not marked'}{w.rate_kind === 'daily' ? ` · a full day is ${hoursText(p.std)}` : ''}</span>
        <Link className="text-sm font-medium text-slate" to={timeCardPath(w.id)}>Time card for the month</Link>
      </p>
    </div>
  )
}
