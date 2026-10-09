// What the signed-in user may do in the supplier loop (design §3.6). The database re-checks
// every action; these only decide which buttons to show.
import type { useCompany } from '../../auth/AuthProvider'

type Auth = ReturnType<typeof useCompany>

/** Viewers only look; every other role can enter slips, deliveries and bill drafts. */
export const canEnter = (auth: Auth) => auth.membership?.roles.some((r) => r !== 'viewer') ?? false

export const canManageSuppliers = (auth: Auth) => auth.isAdmin || auth.hasRole('project_manager') || auth.hasRole('accounts')

export const canRecordPayments = (auth: Auth) => auth.isAdmin || auth.hasRole('accounts') || !!auth.membership?.can_record_payments

/** Post bills, credits and reversals (Admin, Accounts). */
export const canPost = (auth: Auth) => auth.seesAllProjects
