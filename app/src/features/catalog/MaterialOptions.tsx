import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useHeadings } from '../projects/api'
import { useMaterials } from './api'
import { materialGroups } from './materialGroups'

/** Materials this user ordered most recently, newest first (req §9.2). */
function useRecentMaterials(userId: string) {
  return useQuery({
    queryKey: ['recent-materials', userId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_slip_lines').select('material_id').eq('created_by', userId).not('material_id', 'is', null)
        .order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return [...new Set(data.map((d) => d.material_id!))]
    },
  })
}

/**
 * The material choices inside a native <Select>: the phone's own picker, related materials side by
 * side (by heading, the headings this user used last first) but no heading labels, which made the
 * list longer (product owner, 2026-10-19). The caller adds "Choose material" and "Other (type it)".
 */
export function MaterialOptions({ companyId, userId }: { companyId: string; userId: string }) {
  const materials = useMaterials(companyId)
  const headings = useHeadings(companyId)
  const recent = useRecentMaterials(userId)
  const groups = useMemo(
    () => materialGroups(materials.data ?? [], headings.data ?? [], recent.data),
    [materials.data, headings.data, recent.data],
  )
  return groups.flatMap((g) => g.items).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)
}
