// Client receipts: what the client the project is built for has paid. Kept out of the ledger, so
// they never change cost, cash paid or party balances; only "Received" and "To collect".
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { rpc } from '../supply/api'

/** A project's receipts, newest first, with the reversal if there is one. */
export function useClientReceipts(projectId: string) {
  return useQuery({
    queryKey: ['client-receipts', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_receipts')
        .select('*, client_receipt_reversals(reversal_date, reason)')
        .eq('project_id', projectId)
        .order('receipt_date', { ascending: false }).order('number', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** What the client has paid on a project as of a date, net of reversals by then. */
export function useClientReceived(projectId: string, asOf: string, enabled: boolean) {
  return useQuery({
    queryKey: ['client-received', projectId, asOf],
    enabled,
    queryFn: () => rpc('client_received_as_of', { p_project: projectId, p_as_of: asOf }),
  })
}

/** Refresh everything a receipt can change. */
export function useRefreshClientMoney() {
  const queryClient = useQueryClient()
  return () => Promise.all(['client-receipts', 'client-receipt', 'client-received', 'calendar']
    .map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
}
