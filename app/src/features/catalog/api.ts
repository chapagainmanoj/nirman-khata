import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export function useUnits(companyId: string) {
  return useQuery({
    queryKey: ['units', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('units').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}

export function useMaterials(companyId: string) {
  return useQuery({
    queryKey: ['materials', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}
