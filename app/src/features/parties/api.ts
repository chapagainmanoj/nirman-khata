// Data shared by every kind of party: balances, khata, open items, opening balance, payments.
// Reads go through RLS, so each list already contains only what the user may see.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'
import { refresh } from '../../data/refresh'
import { rpc, rpcAll } from '../../data/rpc'
import { PARTY, type PartyKind, type PaysBy } from './kinds'

export function usePartyBalances(companyId: string, kind: PartyKind, enabled: boolean) {
  return useQuery({
    queryKey: ['balances', companyId, kind],
    enabled,
    queryFn: () => rpc('party_balances', { p_company: companyId, p_kind: kind }),
  })
}

/** With attendance: what each crew's workers are owed on its project, plus the crew's own balance.
 *  Under 'balances', so every money change refreshes it. */
export function useCrewBalances(companyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['balances', companyId, 'crew-workers'],
    enabled,
    queryFn: () => rpc('crew_balances', { p_company: companyId }),
  })
}

export function usePartyKhata(partyId: string, projectId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['khata', partyId, projectId],
    enabled,
    queryFn: () => rpcAll('party_khata', { p_party: partyId, ...(projectId ? { p_project: projectId } : {}) }, ['business_date.nullsfirst', 'posted_at.nullsfirst', 'event_id.nullsfirst']),
  })
}

export function usePartyOpenItems(partyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['open-items', partyId],
    enabled,
    queryFn: () => rpcAll('party_open_items', { p_party: partyId }, ['doc_date', 'label', 'kind', 'doc_id', 'project_id']),
  })
}

/** What the party holds of the company's money, whole khata: Peski not yet used and Overpayment. */
export function usePartyHeld(partyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['open-items', partyId, 'held'],
    enabled,
    queryFn: async () => (await rpc('party_held', { p_party: partyId }))[0] ?? { peski_paisa: 0, overpaid_paisa: 0 },
  })
}

export function usePartyOpeningBalance(partyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['opening-balance', partyId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('party_opening_balances').select('*').eq('party_id', partyId).eq('status', 'posted').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function usePartyPayments(kind: PartyKind, partyId: string) {
  return usePaged(['payments', { kind, partyId }], async (from, to) => {
    const { data, error } = await supabase.from('payment_summaries').select('*')
      .eq(PARTY[kind].column, partyId).order('payment_date', { ascending: false }).order('number', { ascending: false }).range(from, to)
    if (error) throw error
    return data.map((p) => ({
      ...p, id: p.id!, number: p.number!, payment_date: p.payment_date!, status: p.status!, method: p.method!,
      amount_paisa: p.amount_paisa ?? 0, allocated_paisa: p.allocated_paisa ?? 0, settled_paisa: p.settled_paisa ?? 0,
    }))
  })
}

/** Parties of one kind, by name (contact details; every member may read them). */
export function useParties(companyId: string, kind: PartyKind) {
  return useQuery({
    // Its own key: useSuppliers caches full rows under [table, companyId], and sharing it let a
    // supplier page read these short rows (no categories) and crash.
    queryKey: [PARTY[kind].table, companyId, 'brief'],
    queryFn: async () => {
      // A subcontractor also says how they are paid (direct or against bills).
      const columns = kind === 'subcontractor' ? 'id, name, active, phone, pays_by' : 'id, name, active, phone'
      const { data, error } = await supabase.from(PARTY[kind].table).select(columns).eq('company_id', companyId).order('name')
      if (error) throw error
      return data as unknown as Array<{ id: string; name: string; active: boolean; phone: string | null; pays_by?: PaysBy }>
    },
  })
}

/** What delete_unused can delete: a party, or a project, that was never used. */
export type DeletableKind = PartyKind | 'project'

/**
 * Admin only: delete an entry made by mistake that nothing points to (no slip, bill, payment,
 * day of work, report, even a reversed one). The server refuses anything used, in plain words.
 */
export function useDeleteUnused(kind: DeletableKind, id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => rpc('delete_unused', { p_kind: kind, p_id: id }),
    // A project takes its crew, budget and assignments with it.
    onSuccess: () => refresh(queryClient, ...(kind === 'project' ? ['projects', 'parties', 'budget', 'attendance'] as const : ['parties', 'attendance'] as const)),
  })
}
