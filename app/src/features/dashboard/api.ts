import { useQuery } from '@tanstack/react-query'
import { rpc } from '../supply/api'
import type { ProjectFigures } from './parts'

/** One project's dashboard figures as of a date (req §18.2). */
export function useProjectDashboard(projectId: string, asOf?: string) {
  return useQuery({
    queryKey: ['project-dashboard', projectId, asOf ?? null],
    queryFn: async () => (await rpc('project_dashboard', { p_project: projectId, ...(asOf ? { p_as_of: asOf } : {}) })) as unknown as ProjectFigures | null,
  })
}
