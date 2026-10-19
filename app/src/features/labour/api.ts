// Attendance (req §14, company setting "Labour by: Attendance"): workers with a rate, put on the
// crews of the projects they work on; each worker's in, out and hours per day, a Draft until it is
// Verified, which makes it labour cost owed to the worker (GLOSSARY: Worker, Crew Member, Attendance).
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Tables } from '../../lib/database.types'
import type { IsoDate } from '../../lib/dates'
import { newId } from '../../lib/ids'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../data/rpc'
import { useRefresh } from '../../data/refresh'

export type RateKind = 'daily' | 'hourly'
/** A worker who can be marked on a project, with the crew they are on there (or another of theirs, or none yet). */
export type Worker = { id: string; name: string; work_type: string | null; rate_kind: RateKind; rate_paisa: number; crew_id: string | null; crew_name: string | null; crew_project_id: string | null }

/** Every active worker who can be marked on this project: its own crews and any brought in. */
export function useProjectWorkers(projectId: string) {
  return useQuery({
    queryKey: ['workers', 'project', projectId],
    enabled: !!projectId,
    queryFn: async () => (await rpc('project_workers', { p_project: projectId })) as Worker[],
  })
}

export type WorkerValues = Pick<Tables<'workers'>, 'name' | 'work_type' | 'rate_kind' | 'rate_paisa' | 'phone'> & { notes?: string | null }

/** Everything that shows a worker: lists, the crew's month, their khata. */
function useRefreshWorkers() {
  const refresh = useRefresh()
  return () => refresh('parties', 'attendance')
}

/** Add a worker to the company (no crew yet) or change one. */
export function useSaveWorker() {
  const refresh = useRefreshWorkers()
  return useMutation({
    mutationFn: async ({ id, companyId, values }: { id?: string; companyId: string; values: Partial<WorkerValues> & { active?: boolean } }) => {
      const q = id
        ? supabase.from('workers').update(values).eq('id', id)
        : supabase.from('workers').insert({ ...(values as WorkerValues), id: newId(), company_id: companyId })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

/** Put a worker on a crew: one already in the company, or a new one (its id made here, so a retry is safe). */
export function useAddCrewWorker() {
  const refresh = useRefreshWorkers()
  return useMutation({
    mutationFn: ({ crewId, worker }: { crewId: string; worker: { worker_id: string } | (WorkerValues & { id: string }) }) =>
      rpc('add_crew_worker', { p_crew: crewId, p_worker: worker }) as Promise<unknown> as Promise<string>,
    onSuccess: refresh,
  })
}

/** Take a worker off a crew, or put them back. Their days stay. */
export function useSetCrewMember() {
  const refresh = useRefreshWorkers()
  return useMutation({
    mutationFn: async ({ crewId, workerId, active }: { crewId: string; workerId: string; active: boolean }) => {
      const { error } = await supabase.from('crew_members').update({ active }).eq('crew_id', crewId).eq('worker_id', workerId)
      if (error) throw error
    },
    onSuccess: refresh,
  })
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

/**
 * Hours worked from in and out. A day longer than 6 hours loses the company's unpaid break
 * (its working day less its paid hours, e.g. 8:00–17:00 with 8 paid = 1 hour), so a normal day is
 * exactly the paid hours. The hours stay editable on the form.
 */
export function minutesBetween(timeIn: string, timeOut: string, company: { day_start: string; day_end: string; standard_day_minutes: number }) {
  if (!timeIn || !timeOut) return 0
  const span = toMin(timeOut) - toMin(timeIn)
  if (span <= 0) return 0
  const pause = Math.max(0, toMin(hhmm(company.day_end)) - toMin(hhmm(company.day_start)) - company.standard_day_minutes)
  return span > 360 ? Math.max(0, span - pause) : span
}

/** A day's attendance. Absent is kept as its own mark (no hours), so it is told apart from a day not marked. */
export type Mark = { time_in: string | null; time_out: string | null; minutes: number; absent?: boolean }
export const ABSENT: Mark = { time_in: null, time_out: null, minutes: 0, absent: true }
/** The mark as set_attendance takes it; null clears the day back to not marked. */
export const markRow = (m: Mark | null) => ({ time_in: m?.time_in ?? null, time_out: m?.time_out ?? null, minutes: m?.minutes ?? 0, absent: !!m?.absent })
type WorkingDay = { day_start: string; day_end: string; standard_day_minutes: number }
/** The normal working day, and half of it from the start of the day. */
export const fullDayOf = (c: WorkingDay): Mark => ({ time_in: hhmm(c.day_start), time_out: hhmm(c.day_end), minutes: c.standard_day_minutes })
export const halfDayOf = (c: WorkingDay): Mark => ({
  time_in: hhmm(c.day_start), time_out: clock(toMin(hhmm(c.day_start)) + c.standard_day_minutes / 2), minutes: c.standard_day_minutes / 2,
})

/** What a worker earns for the minutes: hourly rate × hours, or daily rate × share of the paid day. */
export const payFor = (w: Pick<Worker, 'rate_kind' | 'rate_paisa'>, minutes: number, standard: number) =>
  Math.round((w.rate_paisa * minutes) / (w.rate_kind === 'hourly' ? 60 : standard))

export const hoursText = (minutes: number) => `${(minutes / 60).toLocaleString('en-IN', { maximumFractionDigits: 2 })} h`
export const rateText = (w: Pick<Worker, 'rate_kind' | 'rate_paisa'>, formatNPR: (p: number) => string) =>
  `${formatNPR(w.rate_paisa)} / ${w.rate_kind === 'hourly' ? 'hour' : 'day'}`

/** Where "Enter labour" goes: with attendance, the crew's page (its workers' calendar). */
export function labourPath(company: { labour_mode: string }, opts: { project?: string | null; crew?: string | null } = {}) {
  if (company.labour_mode === 'attendance' && opts.crew) return `/crews/${opts.crew}`
  const q = new URLSearchParams()
  if (opts.project) q.set('project', opts.project)
  if (opts.crew) q.set('crew', opts.crew)
  const base = company.labour_mode === 'attendance' ? '/labour/crew' : '/labour/new'
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

// ---------------------------------------------------------------------------
// A worker's month on every project (the crew page's day editor: their time elsewhere that day)
// ---------------------------------------------------------------------------
export type CardRow = {
  work_date: string
  /** Null when the day is on a project this user cannot see: the time is taken, nothing more. */
  project_id: string | null
  crew_id: string | null
  time_in: string | null
  time_out: string | null
  minutes: number
  absent: boolean
  amount_paisa: number | null
  closed: boolean
  verified: boolean
  editable: boolean
}
export type CardWorker = {
  id: string; name: string; work_type: string | null; rate_kind: RateKind; rate_paisa: number; active: boolean
  crews: Array<{ crew_id: string; crew_name: string; project_id: string | null }>
}

export function useWorkerMonth(workerId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['attendance', 'worker', workerId, from, to],
    enabled: !!workerId && !!from && !!to,
    queryFn: async () => (await rpc('worker_month', { p_worker: workerId, p_from: from, p_to: to })) as { worker: CardWorker; rows: CardRow[] },
  })
}

// ---------------------------------------------------------------------------
// A crew's month (the crew page)
// ---------------------------------------------------------------------------
export type MonthRow = {
  work_date: string
  project_id: string
  time_in: string | null
  time_out: string | null
  minutes: number
  /** Kept as a row with no hours; never priced. */
  absent: boolean
  /** In labour cost (a verified worked day). */
  closed: boolean
  /** Verified: a worked day in labour cost, or an absent day confirmed. Otherwise a draft. */
  verified: boolean
  /** What a verified day was priced at. Null for a draft (no money) or when money is hidden. */
  amount_paisa: number | null
}
export type CrewWorker = {
  id: string; name: string; work_type: string | null; rate_kind: RateKind; rate_paisa: number; phone: string | null
  active: boolean
  /** Still on this crew; false for someone brought in, or taken off since. */
  on_crew: boolean
  rows: MonthRow[]
  minutes: number
  /** On the crew's project; null when money is hidden. */
  paid_paisa: number | null
  balance_paisa: number | null
  /** Days on the project still drafts (absent ones too). */
  draft_days: number
  /** Everywhere, including money not given to a project: Accounts and Admin only. */
  company_balance_paisa: number | null
}
export type CrewMonth = {
  crew: { id: string; name: string; project_id: string | null; active: boolean }
  standard_day_minutes: number
  can_see_money: boolean
  workers: CrewWorker[]
  /** The first day this user may mark or change (site staff: 7 days back); null for any day. */
  mark_from: IsoDate | null
}

/** The crew month's key, shared with CrewBoard's instant updates so both name the same entry. */
export const crewMonthKey = (crewId: string, from: string, to: string) => ['attendance', 'crew', crewId, from, to]

export function useCrewMonth(crewId: string, from: string, to: string) {
  return useQuery({
    queryKey: crewMonthKey(crewId, from, to),
    enabled: !!crewId && !!from && !!to,
    queryFn: async () => (await rpc('crew_month', { p_crew: crewId, p_from: from, p_to: to })) as CrewMonth,
  })
}

// ---------------------------------------------------------------------------
// Draft days (marked, not verified): per project, crew and worker
// ---------------------------------------------------------------------------
export type OpenLabour = { project_id: string; crew_id: string; worker_id: string; days: number; minutes: number; amount_paisa: number | null }

/** The advance a worker holds that paying takes off their days, from every project the user sees. */
export function useWorkerAdvance(workerId: string, enabled = true) {
  return useQuery({
    queryKey: ['balances', 'worker-advance', workerId],
    enabled: !!workerId && enabled,
    queryFn: () => rpc('worker_advance', { p_worker: workerId }),
  })
}

/** Under 'attendance', so every mark and close refreshes it. */
export function useOpenLabour(companyId: string, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'open', companyId],
    enabled: !!companyId && enabled,
    queryFn: async () => (await rpc('open_labour', { p_company: companyId })) as OpenLabour[],
  })
}

/** Sum the open labour by one key: amount null when any part of it is hidden. */
export function openBy(rows: OpenLabour[] | undefined, key: 'project_id' | 'crew_id' | 'worker_id') {
  const out = new Map<string, { days: number; amount_paisa: number | null }>()
  for (const r of rows ?? []) {
    const o = out.get(r[key]) ?? { days: 0, amount_paisa: 0 }
    o.days += r.days
    o.amount_paisa = o.amount_paisa == null || r.amount_paisa == null ? null : o.amount_paisa + r.amount_paisa
    out.set(r[key], o)
  }
  return out
}
