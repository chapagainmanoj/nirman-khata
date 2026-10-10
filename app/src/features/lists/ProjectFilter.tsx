// Lists open on the current project; one tap shows everything.
import { useState } from 'react'
import { useCurrentProject } from '../projects/current'

export function useProjectFilter() {
  const current = useCurrentProject()
  const [all, setAll] = useState(false)
  const projectId = all ? null : current.projectId
  const chip = current.project && (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-subtle">{all ? 'All projects' : `${current.project.code} · ${current.project.name}`}</span>
      <button type="button" onClick={() => setAll(!all)}
        className="min-h-11 rounded-lg px-3 font-medium text-ink underline underline-offset-2 hover:bg-muted">
        {all ? `Only ${current.project.code}` : 'Show all projects'}
      </button>
    </div>
  )
  return { projectId, chip }
}
