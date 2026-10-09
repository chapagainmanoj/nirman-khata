import type { AppRole, ProjectStatus } from './supabase'

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Owner / Admin',
  project_manager: 'Project Manager / Engineer',
  site_staff: 'Site Staff / Supervisor',
  accounts: 'Accounts',
  viewer: 'Viewer',
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export const STATUS_TONE: Record<ProjectStatus, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  planned: 'info',
  active: 'good',
  on_hold: 'warn',
  completed: 'neutral',
  closed: 'neutral',
  cancelled: 'bad',
}
