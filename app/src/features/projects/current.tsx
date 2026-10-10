// The project someone is working on right now (UX review, nav step 3). Chosen once in the
// nav; new slips, deliveries, labour and bills start on it, and lists open filtered to it.
// Remembered on this device only (per user and company): a convenience, never a permission.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useCompany } from '../../auth/AuthProvider'
import { useProjects } from './api'

type Project = { id: string; code: string; name: string; status: string }

const WORKABLE = (p: Project) => !['completed', 'closed', 'cancelled'].includes(p.status)

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

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}

export function CurrentProjectProvider({ children }: { children: ReactNode }) {
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const key = storageKey(auth.userId, auth.companyId)
  const [stored, setStored] = useState(() => read(key))
  const projectId = resolveCurrentProject(stored, projects.data)
  const choices = projects.data?.filter(WORKABLE) ?? []

  const value: CurrentProject = {
    projectId,
    project: choices.find((p) => p.id === projectId) ?? null,
    choices,
    ready: projects.isSuccess,
    setProjectId: (id) => {
      setStored(id)
      write(key, id)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useCurrentProject = () => useContext(Ctx)
