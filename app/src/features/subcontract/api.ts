// Subcontract work (req §13): subcontractors, work packages, claims and package figures.
// Reads go through RLS: package scope for anyone on the project, amounts for finance only.
import { useQueries, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { rpc } from '../../data/rpc'

export function useSubcontractors(companyId: string) {
  return useQuery({
    queryKey: ['subcontractors', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('subcontractors').select('*').eq('company_id', companyId).order('name')
      if (error) throw error
      return data
    },
  })
}

export function useWorkPackages(filter: { projectId?: string; subcontractorId?: string }, enabled = true) {
  return useQuery({
    queryKey: ['work-packages', filter],
    enabled,
    queryFn: async () => {
      let q = supabase.from('work_packages')
        .select('*, subcontractors(name), projects(code, name), units(code), cost_headings(name)')
        .order('created_at', { ascending: false })
      if (filter.projectId) q = q.eq('project_id', filter.projectId)
      if (filter.subcontractorId) q = q.eq('subcontractor_id', filter.subcontractorId)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useWorkPackage(packageId: string) {
  return useQuery({
    queryKey: ['work-package', packageId],
    enabled: !!packageId,
    queryFn: async () => {
      const [pkg, terms] = await Promise.all([
        supabase.from('work_packages')
          .select('*, subcontractors(name, phone, pays_by), projects(code, name), units(code, name), cost_headings(name)')
          .eq('id', packageId).maybeSingle(),
        supabase.from('work_package_terms').select('*').eq('id', packageId).maybeSingle(),
      ])
      if (pkg.error) throw pkg.error
      if (terms.error) throw terms.error
      return pkg.data && { ...pkg.data, terms: terms.data }
    },
  })
}

export type PackageFigures = {
  work_package_id: string
  agreed_value_paisa: number | null
  approved_paisa: number
  pending_claims_paisa: number
  paid_paisa: number
  balance_paisa: number
  remaining_value_paisa: number | null
}

/** Per-package money for a project; empty for users without finance access (S5). */
export function packageFiguresQuery(projectId: string, enabled: boolean) {
  return {
    queryKey: ['package-figures', projectId],
    enabled: enabled && !!projectId,
    queryFn: async () => (await rpc('work_package_figures', { p_project: projectId })) as unknown as PackageFigures[],
  }
}

export function usePackageFigures(projectId: string, enabled: boolean) {
  return useQuery(packageFiguresQuery(projectId, enabled))
}

/**
 * What a subcontractor holds that would pay work on these projects first (peski, money paid
 * ahead, an opening balance), as pay_subcontractor would take it: party_usable_held per project.
 */
export function useUsableHeld(partyId: string, projectIds: string[], packageId: string | null) {
  return useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ['balances', 'usable-held', partyId, projectId, packageId],
      enabled: !!partyId,
      queryFn: async () => (await rpc('party_usable_held', { p_party: partyId, p_project: projectId, p_package: packageId ?? undefined })) as number,
    })),
    combine: (rs) => ({ paisa: rs.reduce((s, r) => s + (r.data ?? 0), 0), ready: rs.every((r) => r.data != null) }),
  })
}

export function useCharges(packageId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['charges', packageId],
    enabled: enabled && !!packageId,
    queryFn: async () => {
      const { data, error } = await supabase.from('charge_summaries').select('*')
        .eq('work_package_id', packageId).order('charge_date', { ascending: false })
      if (error) throw error
      // View columns are typed nullable; these are always set for a charge row.
      return data.map((c) => ({
        ...c, id: c.id!, status: c.status!, charge_date: c.charge_date!, claimed_paisa: c.claimed_paisa ?? 0,
        settled_paisa: c.settled_paisa ?? 0, project_id: c.project_id!,
      }))
    },
  })
}
