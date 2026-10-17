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

type ExpenseFilter = { projectId?: string; payeeId?: string; kind?: 'project' | 'company' }

// PostgREST filters shared by the list and its count.
function expenseQuery<Q extends { eq: (c: string, v: string) => Q; not: (c: string, op: string, v: null) => Q; is: (c: string, v: null) => Q }>(q: Q, filter: ExpenseFilter): Q {
  if (filter.projectId) q = q.eq('project_id', filter.projectId)
  if (filter.payeeId) q = q.eq('payee_id', filter.payeeId)
  if (filter.kind === 'project') q = q.not('project_id', 'is', null)
  if (filter.kind === 'company') q = q.is('project_id', null)
  return q
}

/** `kind`: only expenses on a project, or only company expenses (no project, record only). */
export function useExpenses(filter: ExpenseFilter) {
  return usePaged(['expenses', filter], async (from, to) => {
    const q = expenseQuery(supabase.from('expense_summaries').select('*, payees(name, is_cash), cost_headings(name)'), filter)
    const { data, error } = await q.order('expense_date', { ascending: false }).order('id').range(from, to)
    if (error) throw error
    return data.map((e) => ({
      ...e, id: e.id!, expense_date: e.expense_date!, amount_paisa: e.amount_paisa ?? 0, settled_paisa: e.settled_paisa ?? 0,
      status: e.status!, description: e.description ?? '',
    }))
  })
}

/** How many other expenses match (every row the person may see), for "Showing 50 of 230". */
export function useExpenseCount(filter: ExpenseFilter) {
  return useQuery({
    queryKey: ['expenses', 'count', filter],
    queryFn: async () => {
      const { count, error } = await expenseQuery(supabase.from('expense_summaries').select('id', { count: 'exact', head: true }), filter)
      if (error) throw error
      return count ?? 0
    },
  })
}
