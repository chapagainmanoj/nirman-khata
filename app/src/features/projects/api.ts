import { useQuery } from '@tanstack/react-query'
import { t } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'

export function useProjects(companyId: string) {
  return useQuery({
    queryKey: ['projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, code, name, status, district, municipality, planned_start, planned_end, manager_id')
        .eq('company_id', companyId)
        .order('code')
      if (error) throw error
      return data
    },
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useMembers(companyId: string) {
  return useQuery({
    queryKey: ['members', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('*, profiles(full_name, phone, email)')
        .eq('company_id', companyId)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export type Member = NonNullable<ReturnType<typeof useMembers>['data']>[number]

export function memberName(members: Member[] | undefined, userId: string | null | undefined): string {
  if (!userId) return ''
  return members?.find((m) => m.user_id === userId)?.profiles?.full_name ?? t('common.formerStaff')
}

export function useAmountsAsOf(projectId: string, asOf: string, enabled: boolean) {
  return useQuery({
    queryKey: ['amounts', projectId, asOf],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('project_amounts_as_of', { p_project: projectId, p_as_of: asOf })
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}

export function useRevisions(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['revisions', projectId],
    enabled,
    queryFn: async () => {
      const [contract, budget] = await Promise.all([
        supabase.from('contract_revisions').select('*').eq('project_id', projectId),
        supabase.from('budget_revisions').select('*, budget_lines(heading_id, amount_paisa)').eq('project_id', projectId),
      ])
      if (contract.error) throw contract.error
      if (budget.error) throw budget.error
      return { contract: contract.data, budget: budget.data }
    },
  })
}

export function useAssignments(projectId: string) {
  return useQuery({
    queryKey: ['assignments', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_assignments').select('id, user_id').eq('project_id', projectId)
      if (error) throw error
      return data
    },
  })
}

export function useHeadings(companyId: string) {
  return useQuery({
    queryKey: ['headings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cost_headings')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}
