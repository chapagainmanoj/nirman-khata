// The project someone is working on right now (UX review, nav step 3). Chosen once in the
// nav; new slips, deliveries, labour and bills start on it, and lists open filtered to it.
// Remembered on this device only (per user and company): a convenience, never a permission.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { platform } from '../../platform'
import { useProjects } from './api'

type Project = { id: string; code: string; name: string; status: string }

/**
 * Which projects a form lists (GLOSSARY: Project status). Site work (order slips, daily reports,
 * deliveries, attendance, work packages) is for Active and On hold projects; money (bills, labour,
 * expenses, payments, client receipts) also for Completed ones, since final bills and retention come
 * after the work ends. Books closed and Cancelled are in neither; the server refuses money on them.
 */
export type ProjectUse = 'site' | 'money'
const USABLE: Record<ProjectUse, readonly string[]> = {
  site: ['active', 'on_hold'],
  money: ['active', 'on_hold', 'completed'],
}
export const usableFor = (use: ProjectUse, status: string) => USABLE[use].includes(status)

/** The projects a form for `use` lists. `keep`: projects already on the record being edited stay listed. */
export function projectChoices<P extends { id: string; status: string }>(projects: P[] | undefined, use: ProjectUse, keep: Array<string | null | undefined> = []): P[] {
  return (projects ?? []).filter((p) => usableFor(use, p.status) || keep.includes(p.id))
}

const WORKABLE = (p: Project) => usableFor('site', p.status)

/**
 * The stored choice if it is still a project this person can see and work on; otherwise
 * their only workable project, if they have exactly one; otherwise none ("All projects").
 */
export function resolveCurrentProject(stored: string | null, projects: Project[] | undefined): string | null {
  if (!projects) return stored
  const workable = projects.filter(WORKABLE)
  if (stored && workable.some((p) => p.id === stored)) return stored
  return workable.length === 1 ? workable[0].id : null
}

type CurrentProject = {
  projectId: string | null
  project: Project | null
  /** Projects that can be chosen (not completed, closed or cancelled). */
  choices: Project[]
  /** The project list has loaded (so an empty `choices` really means none). */
  ready: boolean
  setProjectId: (id: string | null) => void
}

const Ctx = createContext<CurrentProject>({ projectId: null, project: null, choices: [], ready: false, setProjectId: () => {} })

const storageKey = (userId: string, companyId: string) => `nk:current-project:${userId}:${companyId}`

export function CurrentProjectProvider({ children }: { children: ReactNode }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const key = storageKey(auth.userId, auth.companyId)
  const [stored, setStored] = useState(() => platform.prefs.get(key))
  const projectId = resolveCurrentProject(stored, projects.data)
  const choices = projects.data?.filter(WORKABLE) ?? []

  const value: CurrentProject = {
    projectId,
    project: choices.find((p) => p.id === projectId) ?? null,
    choices,
    ready: projects.isSuccess,
    setProjectId: (id) => {
      setStored(id)
      platform.prefs.set(key, id || null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useCurrentProject = () => useContext(Ctx)

/**
 * The Working on project for a new form, only once the project list has loaded (never the raw saved
 * id, which may be stale). It is a site-work project, so every form lists it. '' with "All projects".
 */
export function useWorkingOnId(): string {
  return useCurrentProject().project?.id ?? ''
}

/**
 * A new form's project when its link names none: fills `value` with the Working on project while it
 * is still empty, on open or when the list arrives later (a refresh straight onto the form). `off`
 * when the project comes from elsewhere: the link, the record being edited, an order slip.
 */
export function useWorkingOnDefault(value: string, fill: (id: string) => void, off = false) {
  const workingOn = useWorkingOnId()
  const id = off ? '' : workingOn
  useEffect(() => {
    if (id && !value) fill(id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
}
