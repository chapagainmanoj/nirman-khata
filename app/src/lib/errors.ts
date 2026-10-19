// Turn database and network errors into messages a site engineer can act on.
import { type MessageKey, t } from './i18n'

type ErrorLike = { message?: string; code?: string; details?: string } | null | undefined

// Unique constraints with a more specific message than "This already exists".
const BY_CONSTRAINT: Record<string, MessageKey> = {
  projects_company_id_code_key: 'error.unique.projects_company_id_code_key',
  suppliers_unique_name: 'error.unique.suppliers_unique_name',
  subcontractors_unique_name: 'error.unique.subcontractors_unique_name',
  payees_unique_name: 'error.unique.payees_unique_name',
  expense_project_or_company: 'error.unique.expense_project_or_company',
  crews_unique_name: 'error.unique.crews_unique_name',
  registration_allowlist_login_email_key: 'error.unique.registration_allowlist_login_email_key',
}

// Check constraints people can hit from a form.
const BY_CHECK: Record<string, MessageKey> = {
  attendance_times: 'error.check.attendance_times',
  attendance_minutes_fit: 'error.check.attendance_minutes_fit',
  // Not reachable from a form (the server picks the source); kept readable if it ever shows.
  settlement_one_source: 'error.check.settlement_one_source',
  allocation_one_source: 'error.check.allocation_one_source',
}

// Our own error codes: the readable part follows the colon.
const PREFIXED = ['attendance_off', 'day_closed', 'day_verified', 'day_too_old', 'attendance_overlap', 'already_paid']

const BY_CODE: Record<string, MessageKey> = {
  '23505': 'error.code.23505',
  '23503': 'error.code.23503',
  '42501': 'error.code.42501',
}

/** A request lib/supabase stopped waiting for: retrying it at once only makes the wait longer. */
export function isTimeout(error: unknown): boolean {
  return !!(error as ErrorLike)?.message?.includes('request_timeout')
}

export function friendlyError(error: unknown): string {
  const e = error as ErrorLike
  if (!e) return t('error.generic')
  if (e.message?.includes('Failed to fetch')) return t('error.offline')
  // lib/supabase: no answer within the time limit (a weak signal that never times out by itself).
  if (isTimeout(e)) return t('error.timeout')
  // A save whose reply was lost, then resubmitted with changes (design §5.1).
  if (e.message?.startsWith('op_key_reused')) {
    return t('error.opKeyReused')
  }
  // A refund is capped at the Overpayment held with the party; peski returned at the Peski.
  if (e.message?.startsWith('refund_exceeds_overpayment')) {
    return t('error.refundTooBig', { what: e.message.replace(/^refund_exceeds_overpayment: t/, 'T') })
  }
  if (e.message?.startsWith('peski_returned_exceeds_peski')) {
    return t('error.peskiReturnedTooBig', { what: e.message.replace(/^peski_returned_exceeds_peski: t/, 'T') })
  }
  if (e.message?.startsWith('peski_with_unpaid')) {
    return t('error.peskiWithUnpaid')
  }
  const prefixed = PREFIXED.find((p) => e.message?.startsWith(`${p}:`))
  if (prefixed) {
    const text = e.message!.slice(prefixed.length + 1).trim()
    return text.charAt(0).toUpperCase() + text.slice(1) + '.'
  }
  if (e.code === '23514') {
    const check = Object.keys(BY_CHECK).find((name) => e.message?.includes(name))
    if (check) return t(BY_CHECK[check])
  }
  // Our own RPC errors (P0001, 22023, ...) already carry a readable message.
  if (e.code && BY_CODE[e.code]) {
    if (e.code === '23505') {
      const constraint = Object.keys(BY_CONSTRAINT).find((name) => e.message?.includes(name))
      if (constraint) return t(BY_CONSTRAINT[constraint])
    }
    return t(BY_CODE[e.code])
  }
  return e.message || t('error.generic')
}
