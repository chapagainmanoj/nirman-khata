import { useCompany } from '../auth/AuthProvider'
import { canRecordPayments } from '../features/supply/permissions'
import type { NavRole } from './nav'

/** The nav-relevant facts about the signed-in person. */
export function useNavRole(): NavRole {
  const auth = useCompany()
  return {
    roles: auth.membership?.roles ?? [],
    isAdmin: auth.isAdmin,
    seesAllProjects: auth.seesAllProjects,
    canSeeFinance: auth.canSeeFinance,
    canRecordPayments: canRecordPayments(auth),
    canApproveSlips: !!auth.membership?.can_approve_slips,
    labourEnabled: auth.company.labour_module_enabled,
    labourByAttendance: auth.company.labour_mode === 'attendance',
  }
}
