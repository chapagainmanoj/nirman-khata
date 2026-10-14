// Attendance (req §14, company setting "Labour by: Attendance"): crew members with a rate, each
// member's in, out and hours per day, and closing a day into the crew's labour cost.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { rpc } from '../supply/api'

export type Worker = { id: string; name: string; work_type: string | null; rate_kind: 'daily' | 'hourly'; rate_paisa: number; crew_id: string; crew_name: string; crew_project_id: string | null }
export type DayRow = { member_id: string; crew_id: string; time_in: string | null; time_out: string | null; minutes: number; amount_paisa: number | null; closed: boolean }

/** A crew's members, for the crew page. RLS shows them to those who may edit them, and finance. */
export function useCrewMembers(crewId: string) {
  return useQuery({
    queryKey: ['crew-members', crewId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crew_members').select('*').eq('crew_id', crewId).order('active', { ascending: false }).order('name')
      if (error) throw error
      return data
    },
  })
}

/** Every active worker who can be marked on this project: its own crews and any brought in. */
export function useProjectWorkers(projectId: string) {
  return useQuery({
    queryKey: ['crew-members', 'project', projectId],
    enabled: !!projectId,
    queryFn: async () => (await rpc('project_workers', { p_project: projectId })) as Worker[],
  })
}

export function useAttendanceDay(projectId: string, date: string) {
  return useQuery({
    queryKey: ['attendance', projectId, date],
    enabled: !!projectId && !!date,
    queryFn: async () => (await rpc('attendance_day', { p_project: projectId, p_date: date })) as DayRow[],
  })
}

export type MemberValues = Pick<Tables<'crew_members'>, 'name' | 'work_type' | 'rate_kind' | 'rate_paisa' | 'phone' | 'crew_id'>

export function useSaveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, companyId, values }: { id?: string; companyId: string; values: Partial<MemberValues> & { active?: boolean } }) => {
      const q = id
        ? supabase.from('crew_members').update(values).eq('id', id)
        : supabase.from('crew_members').insert({ ...(values as MemberValues), company_id: companyId })
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crew-members'] }),
  })
}

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
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

/** What a worker earns for the minutes: hourly rate × hours, or daily rate × share of the paid day. */
export const payFor = (w: Pick<Worker, 'rate_kind' | 'rate_paisa'>, minutes: number, standard: number) =>
  Math.round((w.rate_paisa * minutes) / (w.rate_kind === 'hourly' ? 60 : standard))

export const hoursText = (minutes: number) => `${(minutes / 60).toLocaleString('en-IN', { maximumFractionDigits: 2 })} h`
export const rateText = (w: Pick<Worker, 'rate_kind' | 'rate_paisa'>, formatNPR: (p: number) => string) =>
  `${formatNPR(w.rate_paisa)} / ${w.rate_kind === 'hourly' ? 'hour' : 'day'}`

/** Where "Enter labour" goes: the attendance roster when the company works by attendance. */
export function labourPath(company: { labour_mode: string }, opts: { project?: string | null; crew?: string | null } = {}) {
  const q = new URLSearchParams()
  if (opts.project) q.set('project', opts.project)
  if (opts.crew) q.set('crew', opts.crew)
  const base = company.labour_mode === 'attendance' ? '/labour/attendance' : '/labour/new'
  const s = q.toString()
  return s ? `${base}?${s}` : base
}
