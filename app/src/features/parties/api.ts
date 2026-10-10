// Data shared by every kind of party: balances, khata, open items, opening balance, payments.
// Reads go through RLS, so each list already contains only what the user may see.
import { useQuery } from '@tanstack/react-query'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'
import { rpc } from '../supply/api'
import { PARTY, type PartyKind } from './kinds'

export function usePartyBalances(companyId: string, kind: PartyKind, enabled: boolean) {
  return useQuery({
    queryKey: ['balances', companyId, kind],
    enabled,
    queryFn: () => rpc('party_balances', { p_company: companyId, p_kind: kind }),
  })
}

export function usePartyKhata(partyId: string, projectId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['khata', partyId, projectId],
    enabled,
    queryFn: () => rpc('party_khata', { p_party: partyId, ...(projectId ? { p_project: projectId } : {}) }),
  })
}

export function usePartyOpenItems(partyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['open-items', partyId],
    enabled,
    queryFn: () => rpc('party_open_items', { p_party: partyId }),
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
    queryKey: [PARTY[kind].table, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from(PARTY[kind].table).select('id, name, active, phone').eq('company_id', companyId).order('name')
      if (error) throw error
      return data as Array<{ id: string; name: string; active: boolean; phone: string | null }>
    },
  })
}
