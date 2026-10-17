// In-app notifications (req §18.4): slip submitted (to approvers), approved or rejected (to the creator).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

export function NotificationsPage() {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['notifications', auth.userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications').select('*').eq('user_id', auth.userId).order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data
    },
  })
  const markRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
        .eq('user_id', auth.userId).is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', auth.userId, 'unread'] }),
  })
  const hasUnread = list.data?.some((n) => !n.read_at)
  const { mutate } = markRead
  useEffect(() => {
    if (hasUnread) mutate()
  }, [hasUnread, mutate])

  return (
    <>
      <PageHeader title="Notifications" />
      {list.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void list.refetch()}>{list.error && friendlyError(list.error)}</ErrorBanner>
      {list.data?.length === 0 && <EmptyState title="Nothing new">Order slip approvals and decisions show up here.</EmptyState>}
      <ul className="flex flex-col gap-2">
        {list.data?.map((n) => (
          <li key={n.id}>
            <Link to={n.slip_id ? `/slips/${n.slip_id}` : '#'}
              className={`block rounded-xl border bg-surface p-3 hover:border-slate ${n.read_at ? 'border-line' : 'border-brand'}`}>
              <div className="font-medium text-ink">{n.title}</div>
              {n.body && <div className="text-sm text-subtle">{n.body}</div>}
              <div className="mt-1 text-xs text-subtle">{formatDateTime(n.created_at, auth.dateDisplay)}</div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
