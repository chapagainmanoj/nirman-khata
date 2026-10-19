// Lists open on the current project (the sidebar's "Working on"). A two-way switch shows which
// view is on: [P-2 · Lakeside] [All projects]. "All" lasts until the current project changes,
// so the sidebar and the list never disagree for long. A link with ?all=1 (a company-wide count on
// the dashboard) opens on "All projects", so the project cannot hide the item it points to.
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { t } from '../../lib/i18n'
import { useCurrentProject } from './current'

const option = (on: boolean) =>
  `min-h-11 [@media(pointer:fine)]:min-h-10 min-w-0 rounded-md px-3 text-sm font-medium ${on ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink'}`

const ANY = '*'

export function useProjectFilter() {
  const current = useCurrentProject()
  // Only a project that has loaded filters the list, so it is never filtered without a label.
  const p = current.project
  // The project "All" was chosen for; a different current project starts filtered again.
  // ANY: opened with ?all=1, so "All" whatever the project (which may not have loaded yet).
  const [params] = useSearchParams()
  const [allFor, setAllFor] = useState<string | null>(() => (params.get('all') === '1' ? ANY : null))
  const all = !!p && (allFor === p.id || allFor === ANY)
  const projectId = p && !all ? p.id : null

  const chip = p && (
    <div role="group" aria-label={t('filter.projectsShown')} className="mb-3 inline-flex max-w-full gap-1 rounded-lg bg-track p-1">
      <button type="button" aria-pressed={!all} onClick={() => setAllFor(null)} className={`${option(!all)} truncate`}>
        {p.code} · {p.name}
      </button>
      <button type="button" aria-pressed={all} onClick={() => setAllFor(p.id)} className={`${option(all)} shrink-0`}>
        {t('nav.project.all')}
      </button>
    </div>
  )

  /** Empty-list text that says what is filtered, with the way out. */
  const empty = (what: string, otherwise: ReactNode) => (projectId && p ? (
    <p className="text-sm text-subtle">
      {t('filter.noneOnProject', { what, code: p.code })}{' '}
      <button type="button" onClick={() => setAllFor(p.id)} className="inline-flex min-h-11 items-center font-medium text-slate underline underline-offset-4 [@media(pointer:fine)]:min-h-0">{t('filter.showAll')}</button>
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
