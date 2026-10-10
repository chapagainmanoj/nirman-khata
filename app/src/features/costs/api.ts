// Own labour (req §14) and other expenses (req §15). Amounts are visible to finance users,
// and to the person who entered them for 7 days (X2); RLS decides which rows come back.
import { useQuery } from '@tanstack/react-query'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'

export function useCrews(companyId: string) {
  return useQuery({
    queryKey: ['crews', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('crews').select('*').eq('company_id', companyId).order('is_default', { ascending: false }).order('name')
      if (error) throw error
      return data
    },
  })
}

export function usePayees(companyId: string) {
  return useQuery({
    queryKey: ['payees', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('payees').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}

export function useLabourCosts(filter: { projectId?: string; crewId?: string }) {
  return usePaged(['labour', filter], async (from, to) => {
    let q = supabase.from('labour_cost_summaries').select('*, crews(name)')
    if (filter.projectId) q = q.eq('project_id', filter.projectId)
    if (filter.crewId) q = q.eq('crew_id', filter.crewId)
    const { data, error } = await q.order('work_date', { ascending: false }).order('id').range(from, to)
    if (error) throw error
    // View columns are typed nullable; these are always set for an entry.
    return data.map((l) => ({
      ...l, id: l.id!, work_date: l.work_date!, amount_paisa: l.amount_paisa ?? 0, settled_paisa: l.settled_paisa ?? 0,
      status: l.status!, project_id: l.project_id!, crew_id: l.crew_id!,
    }))
  })
}

export function useExpenses(filter: { projectId?: string; payeeId?: string }) {
  return usePaged(['expenses', filter], async (from, to) => {
    let q = supabase.from('expense_summaries').select('*, payees(name), cost_headings(name)')
    if (filter.projectId) q = q.eq('project_id', filter.projectId)
    if (filter.payeeId) q = q.eq('payee_id', filter.payeeId)
    const { data, error } = await q.order('expense_date', { ascending: false }).order('id').range(from, to)
    if (error) throw error
    return data.map((e) => ({
      ...e, id: e.id!, expense_date: e.expense_date!, amount_paisa: e.amount_paisa ?? 0, settled_paisa: e.settled_paisa ?? 0,
      status: e.status!, project_id: e.project_id!, payee_id: e.payee_id!, description: e.description ?? '',
    }))
  })
}
