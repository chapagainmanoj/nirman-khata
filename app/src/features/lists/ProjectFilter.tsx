// Lists open on the current project (the sidebar's "Working on"). A two-way switch shows which
// view is on: [P-2 · Lakeside] [All projects]. "All" lasts until the current project changes,
// so the sidebar and the list never disagree for long.
import { useState, type ReactNode } from 'react'
import { useCurrentProject } from '../projects/current'

const option = (on: boolean) =>
  `min-h-10 min-w-0 rounded-md px-3 text-sm font-medium ${on ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink'}`

export function useProjectFilter() {
  const current = useCurrentProject()
  // Only a project that has loaded filters the list, so it is never filtered without a label.
  const p = current.project
  // The project "All" was chosen for; a different current project starts filtered again.
  const [allFor, setAllFor] = useState<string | null>(null)
  const all = !!p && allFor === p.id
  const projectId = p && !all ? p.id : null

  const chip = p && (
    <div role="group" aria-label="Projects shown" className="mb-3 inline-flex max-w-full gap-1 rounded-lg bg-muted p-1">
      <button type="button" aria-pressed={!all} onClick={() => setAllFor(null)} className={`${option(!all)} truncate`}>
        {p.code} · {p.name}
      </button>
      <button type="button" aria-pressed={all} onClick={() => setAllFor(p.id)} className={`${option(all)} shrink-0`}>
        All projects
      </button>
    </div>
  )

  /** Empty-list text that says what is filtered, with the way out. */
  const empty = (what: string, otherwise: ReactNode) => (projectId && p ? (
    <p className="text-sm text-subtle">
      No {what} on {p.code} yet.{' '}
      <button type="button" onClick={() => setAllFor(p.id)} className="font-medium text-slate underline underline-offset-4">Show all projects</button>
    </p>
  ) : otherwise)

  return {
    /** The project the list is filtered to, or null for every project. */
    projectId,
    chip,
    empty,
    /** New records start on the sidebar project in both views, like "+ Record". */
    recordProject: p?.id ?? null,
    /** Rows say which project they belong to when the list mixes projects. */
    showProject: !projectId,
  }
}
