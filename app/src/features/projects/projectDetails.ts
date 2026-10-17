// Project detail form values and their mapping to database columns.
import { z } from 'zod'
import type { ProjectStatus } from '../../lib/supabase'

export const detailsSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(20),
  name: z.string().trim().min(1, 'Name is required'),
  client_name: z.string().trim(),
  client_phone: z.string().trim(),
  district: z.string().trim(),
  municipality: z.string().trim(),
  ward: z.string().trim(),
  location_note: z.string().trim(),
  manager_id: z.string(),
  planned_start: z.string(),
  planned_end: z.string(),
  actual_start: z.string(),
  actual_end: z.string(),
  status: z.enum(['planned', 'active', 'on_hold', 'completed', 'closed', 'cancelled']),
})

export type DetailsValues = z.infer<typeof detailsSchema>

export const emptyDetails: DetailsValues = {
  code: '', name: '', client_name: '', client_phone: '', district: '', municipality: '', ward: '',
  location_note: '', manager_id: '', planned_start: '', planned_end: '', actual_start: '', actual_end: '',
  status: 'active',
}

/** Form values -> database columns (empty strings become null). */
export function detailsToRow(v: DetailsValues) {
  const n = (s: string) => (s.trim() === '' ? null : s.trim())
  return {
    code: v.code.trim(), name: v.name.trim(), client_name: n(v.client_name), client_phone: n(v.client_phone),
    district: n(v.district), municipality: n(v.municipality), ward: n(v.ward), location_note: n(v.location_note),
    manager_id: n(v.manager_id), planned_start: n(v.planned_start), planned_end: n(v.planned_end),
    actual_start: n(v.actual_start), actual_end: n(v.actual_end), status: v.status as ProjectStatus,
  }
}
