// Site work (req §16, §17): stages, progress, daily reports and the calendar.
import { useQuery } from '@tanstack/react-query'
import { type MessageKey, t } from '../../lib/i18n'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../data/rpc'
import { useRefresh } from '../../data/refresh'

/** Common stages of a building job; a project can also copy another project's list. */
export const STAGE_LIST = ['Excavation', 'Foundation', 'Structure/Slab', 'Masonry', 'Plaster', 'Electrical', 'Plumbing', 'Finishing']

export const WEATHER = ['Sunny', 'Cloudy', 'Rain', 'Heavy rain', 'Cold']
// The English word is what is saved; people see it in their language.
const WEATHER_LABEL: Record<string, MessageKey> = {
  Sunny: 'weather.sunny', Cloudy: 'weather.cloudy', Rain: 'weather.rain', 'Heavy rain': 'weather.heavyRain', Cold: 'weather.cold',
}
export const weatherLabel = (w: string) => (WEATHER_LABEL[w] ? t(WEATHER_LABEL[w]) : w)

export function useStages(projectId: string) {
  return useQuery({
    queryKey: ['stages', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase.from('stages').select('*').eq('project_id', projectId).eq('active', true)
        .order('sort_order').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useProgress(projectId: string, asOf?: string) {
  return useQuery({
    queryKey: ['progress', projectId, asOf ?? null],
    enabled: !!projectId,
    queryFn: () => rpc('progress_as_of', { p_project: projectId, ...(asOf ? { p_date: asOf } : {}) }),
  })
}

export type ProgressRow = NonNullable<ReturnType<typeof useProgress>['data']>[number]

export function useDailyReports(projectId: string) {
  return usePaged(['daily-reports', projectId], async (from, to) => {
    const { data, error } = await supabase.from('daily_reports')
      .select('id, work_date, work_done, area, headcount, issues, weather, created_by, submitted_at, stages(name)')
      .eq('project_id', projectId).order('work_date', { ascending: false }).order('submitted_at', { ascending: false }).order('id')
      .range(from, to)
    if (error) throw error
    return data
  })
}

export function useDailyReport(reportId: string) {
  return useQuery({
    queryKey: ['daily-report', reportId],
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_reports')
        .select('*, stages(name), projects(code, name), daily_report_lines(id, description, qty, sort_order, units(code))')
        .eq('id', reportId).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** The labour cost a report created, if the person may see it. */
export function useReportLabour(reportId: string) {
  return useQuery({
    queryKey: ['labour', 'report', reportId],
    queryFn: async () => {
      const { data, error } = await supabase.from('labour_costs').select('id, amount_paisa, crews(name)')
        .eq('daily_report_id', reportId).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** That day on one project: reports and the deliveries already recorded (acceptance #23). */
export function useReportDay(projectId: string, date: string) {
  return useQuery({
    queryKey: ['report-day', projectId, date],
    enabled: !!projectId && !!date,
    queryFn: () => rpc('report_day', { p_project: projectId, p_date: date }),
  })
}

export function useCalendarEvents(companyId: string, from: string, to: string, projectId: string | null) {
  return useQuery({
    queryKey: ['calendar', companyId, from, to, projectId],
    queryFn: () => rpc('calendar_events', { p_company: companyId, p_from: from, p_to: to, ...(projectId ? { p_project: projectId } : {}) }),
  })
}

export type CalendarEvent = NonNullable<ReturnType<typeof useCalendarEvents>['data']>[number]

export function useRefreshSite() {
  const refresh = useRefresh()
  return () => refresh('site')
}
