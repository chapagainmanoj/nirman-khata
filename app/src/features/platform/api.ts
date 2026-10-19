// Platform admin (superuser): every company's usage and the registration allow list.
// The server refuses all of this unless the login is in private.platform_admins.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../data/rpc'

/** Whether to show the Platform link; false until known. */
export function useIsPlatformAdmin() {
  const { userId } = useAuth()
  const query = useQuery({
    queryKey: ['is-platform-admin', userId],
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: () => rpc('is_platform_admin', {}),
  })
  return { isPlatformAdmin: query.data === true, loading: !!userId && query.isPending }
}

/** Companies, most recently active first, 50 at a time. */
export function useCompanyUsage(search: string) {
  const list = usePaged(['platform-usage', search], async (from, to) => {
    const { data, error } = await supabase.rpc('platform_company_usage', { p_search: search }).range(from, to)
    if (error) throw error
    return data
  })
  const total = useQuery({
    queryKey: ['platform-usage-count', search],
    queryFn: async () => {
      const { count, error } = await supabase.rpc('platform_company_usage', { p_search: search }, { count: 'exact', head: true })
      if (error) throw error
      return count
    },
  })
  return { ...list, total: total.data }
}

export function useCompanyUsers(companyId: string) {
  return useQuery({
    queryKey: ['platform-users', companyId],
    queryFn: () => rpc('platform_company_users', { p_company: companyId }),
  })
}

export function useApprovalRequired() {
  return useQuery({ queryKey: ['platform-approval'], queryFn: () => rpc('registration_approval_required', {}) })
}

/** Approved logins that have not registered yet (a short list). */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['platform-allowlist', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registration_allowlist')
        .select('id, login_email, note, created_at')
        .is('used_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Approvals already used to register, newest first, 50 at a time. Through an RPC, because a
    platform admin is not a member of the companies and could not read their names directly. */
export function useUsedApprovals() {
  const list = usePaged(['platform-allowlist', 'used'], async (from, to) => {
    const { data, error } = await supabase.rpc('platform_used_approvals').range(from, to)
    if (error) throw error
    return data
  })
  const total = useQuery({
    queryKey: ['platform-allowlist', 'used-count'],
    queryFn: async () => {
      const { count, error } = await supabase.rpc('platform_used_approvals', undefined, { count: 'exact', head: true })
      if (error) throw error
      return count
    },
  })
  return { ...list, total: total.data }
}

export function useApproveLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entry: { login_email: string; note: string | null }) => {
      const { error } = await supabase.from('registration_allowlist').insert(entry)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-allowlist'] }),
  })
}

export function useRemoveApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('registration_allowlist').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-allowlist'] }),
  })
}
