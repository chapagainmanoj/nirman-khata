// Counts on nav items: work waiting for this person, not activity. RLS limits each count to
// what the person can see; head-only queries, refreshed every minute like the bell.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { NavKey, NavRole } from './nav'

export function useNavCounts(companyId: string, r: NavRole): Partial<Record<NavKey, number>> {
  const bills = useQuery({
    queryKey: ['nav-count', 'bills-to-post', companyId],
    enabled: r.seesAllProjects,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('supplier_bills').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'under_review')
      if (error) throw error
      return count ?? 0
    },
  })
  const slips = useQuery({
    queryKey: ['nav-count', 'slips-to-approve', companyId],
    enabled: r.isAdmin || r.canApproveSlips,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('order_slips').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
  return { bills: bills.data ?? 0, slips: slips.data ?? 0 }
}

/** Unread notifications for the bell. */
export function useUnreadCount(userId: string) {
  return useQuery({
    queryKey: ['notifications', userId, 'unread'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}
