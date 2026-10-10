import type { Crumb } from '../../components/ui'

/** Projects › the project, for records entered on one project (labour, expenses, daily reports). */
export function projectCrumbs(projects: Array<{ id: string; name: string }> | undefined, projectId: string): Crumb[] {
  const project = projectId ? projects?.find((p) => p.id === projectId) : undefined
  return project
    ? [{ to: '/projects', label: 'Projects' }, { to: `/projects/${project.id}`, label: project.name }]
    : [{ to: '/projects', label: 'Projects' }]
}
